// Browser fetch with timeouts, per-host politeness limits, 429 back-off and an IndexedDB response cache.
import { dbp } from './db.js';

export class UpstreamError extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

// Max concurrent requests per host (Wikimedia & Nominatim are strict).
const LIMITS = { 'www.wikidata.org': 2, 'commons.wikimedia.org': 2, 'he.wikipedia.org': 2, 'en.wikipedia.org': 2, 'nominatim.openstreetmap.org': 1 };
const hosts = new Map();
const slot = (host) => hosts.get(host) || hosts.set(host, { active: 0, queue: [], pauseUntil: 0 }).get(host);
async function acquire(host) {
  const h = slot(host);
  if (h.active >= (LIMITS[host] ?? 6)) await new Promise((r) => h.queue.push(r));
  h.active++;
  const wait = h.pauseUntil - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
function release(host) { const h = slot(host); h.active--; h.queue.shift()?.(); }

const timeoutSignal = (ms) => (AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);

async function doFetch(url, { timeout, init }) {
  const host = new URL(url).host;
  for (let attempt = 0; ; attempt++) {
    await acquire(host);
    let res;
    try {
      res = await fetch(url, { ...init, headers: { Accept: 'application/json', ...(init?.headers || {}) }, signal: timeoutSignal(timeout) });
    } finally {
      release(host);
    }
    if ((res.status === 429 || res.status === 503) && attempt < 2) {
      const ra = Number(res.headers.get('retry-after'));
      slot(host).pauseUntil = Date.now() + Math.min(8000, Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1200 * (attempt + 1));
      continue;
    }
    return res;
  }
}

const inflight = new Map();

/**
 * Fetch JSON with caching. Returns `null` for 204/404 (WoRMS uses 204 for "no match").
 * On network failure, falls back to stale cache if present; otherwise throws UpstreamError.
 */
export async function getJSON(url, { ttl = 86400, timeout = 12000, init } = {}) {
  const key = init?.body ? `${url}#${init.body}` : url;
  const db = await dbp;
  const now = Date.now();
  const hit = await db.get('cache', key).catch(() => undefined);
  if (hit && hit.exp > now) return hit.v;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const res = await doFetch(url, { timeout, init });
      if (res.status === 204 || res.status === 404) {
        db.put('cache', { v: null, exp: now + Math.min(ttl, 86400) * 1000 }, key).catch(() => {});
        return null;
      }
      if (!res.ok) throw new UpstreamError(`${new URL(url).host} responded ${res.status}`, res.status);
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      db.put('cache', { v: data, exp: now + ttl * 1000 }, key).catch(() => {});
      return data;
    } catch (e) {
      if (hit) return hit.v; // stale is better than nothing (e.g. offline)
      throw e instanceof UpstreamError ? e : new UpstreamError(`${new URL(url).host} unreachable${navigator.onLine === false ? ' (offline)' : ''}`, 0);
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/** Run promise-returning fns with bounded concurrency. Failed items become undefined. */
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); } catch { out[idx] = undefined; }
    }
  }));
  return out;
}

/** Resolve to the value (or fallback on null/error). Pass a `failures` array to record that something failed. */
export function settle(p, fallback = null, failures) {
  return p.then((v) => v ?? fallback, (e) => { failures?.push(e.message); return fallback; });
}
