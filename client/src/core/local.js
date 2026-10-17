// The whole DiveDex "backend", running in the browser. `handle(method, path, body)` mirrors the old
// REST routes so the UI code stays the same; data is stored on this device (IndexedDB).
import { dbp, persistStorage } from './db.js';
import { getJSON } from './http.js';
import { search } from './search.js';
import { getCards, getProfile, rowToCard, speciesRow, ensureRecord, getCard, RARITY } from './species.js';
import { SIZE_CLASSES, GROUPS } from './worms.js';

export class LocalError extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

const FIELDS = ['siteName', 'siteRef', 'lat', 'lon', 'date', 'startTime', 'endTime', 'maxDepth', 'avgDepth', 'startBar', 'endBar', 'weights',
  'waterTemp', 'visibility', 'buddy', 'notes', 'area', 'light', 'current', 'suit'];
const RANGES = { lat: [-90, 90], lon: [-180, 180], maxDepth: [0, 350], avgDepth: [0, 350], startBar: [0, 350], endBar: [0, 350], weights: [0, 40], waterTemp: [-3, 40], visibility: [0, 100] };
const ENUMS = { light: ['day', 'night', 'dusk'], current: ['none', 'mild', 'moderate', 'strong'] };

function clean(body) {
  const out = {};
  for (const k of FIELDS) {
    let v = body[k];
    if (v === undefined) continue;
    if (v === '' || v === null) { out[k] = null; continue; }
    if (RANGES[k]) {
      v = Number(v);
      if (!Number.isFinite(v)) throw new LocalError(`${k} must be a number`);
      const [lo, hi] = RANGES[k];
      if (v < lo || v > hi) throw new LocalError(`${k} must be between ${lo} and ${hi}`);
    } else {
      v = String(v).trim().slice(0, k === 'notes' ? 5000 : 200);
      if (ENUMS[k] && !ENUMS[k].includes(v)) throw new LocalError(`${k} is invalid`);
    }
    out[k] = v;
  }
  if ('date' in out && !/^\d{4}-\d{2}-\d{2}$/.test(out.date || '')) throw new LocalError('date must be YYYY-MM-DD');
  for (const t of ['startTime', 'endTime']) if (out[t] && !/^\d{2}:\d{2}$/.test(out[t])) throw new LocalError(`${t} must be HH:MM`);
  if (out.maxDepth != null && out.avgDepth != null && out.avgDepth > out.maxDepth) throw new LocalError('Average depth cannot exceed max depth');
  return out;
}

// ---------- photos (Blobs) → stable object URLs ----------
const urlCache = new Map();
function photoUrl(p) {
  if (!urlCache.has(p.id)) urlCache.set(p.id, URL.createObjectURL(p.blob));
  return urlCache.get(p.id);
}
const photoOut = (p) => ({ id: p.id, aphiaId: p.aphia_id ?? null, width: p.width ?? null, height: p.height ?? null, caption: p.caption ?? null, url: photoUrl(p) });

// ---------- dives ----------
const byDate = (a, b) => `${a.date} ${a.startTime || ''} ${String(a.id).padStart(9, '0')}`.localeCompare(`${b.date} ${b.startTime || ''} ${String(b.id).padStart(9, '0')}`);

async function hydrateDive(d, n) {
  const db = await dbp;
  const sightings = [];
  for (const s of d.sightings || []) sightings.push({ aphiaId: s.aphiaId, count: s.count, species: rowToCard(await speciesRow(s.aphiaId)) });
  const photos = (await db.getAllFromIndex('photos', 'dive', d.id)).sort((a, b) => a.id - b.id).map(photoOut);
  const out = { id: d.id, clientId: d.clientId ?? null, number: n, createdAt: d.createdAt, updatedAt: d.updatedAt, sightings, photos };
  for (const k of FIELDS) out[k] = d[k] ?? null;
  return out;
}

async function allDives() {
  return (await (await dbp).getAll('dives')).sort(byDate);
}

async function cleanSightings(list) {
  const out = [];
  for (const s of list || []) {
    const id = await ensureRecord(Number(s.aphiaId)).catch(() => (Number(s.aphiaId) || null));
    if (!id) continue;
    const count = Math.max(1, Math.min(9999, Math.round(Number(s.count) || 1)));
    const ex = out.find((c) => c.aphiaId === id);
    if (ex) ex.count += count; else out.push({ aphiaId: id, count });
  }
  // Warm species cards (images, rarity) in the background for the journal & collection.
  for (const s of out) getCard(s.aphiaId).catch(() => {});
  return out;
}

let lastNominatim = 0;
async function placeName(lat, lon) {
  const wait = 1100 - (Date.now() - lastNominatim);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatim = Date.now();
  const r = await getJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&zoom=10&accept-language=en`, { ttl: 90 * 86400, timeout: 8000 });
  const a = r?.address;
  if (!a) return null;
  const town = a.city || a.town || a.village || a.municipality || a.county || a.state || r.name;
  if (!town || town === a.country) return a.country || null;
  return `${town}, ${a.country}`;
}
function fillArea(id, lat, lon) {
  if (lat == null || lon == null) return;
  placeName(lat, lon).then(async (area) => {
    if (!area) return;
    const db = await dbp;
    const d = await db.get('dives', id);
    if (d && !d.area) await db.put('dives', { ...d, area });
  }).catch(() => {});
}

// ---------- sites (bundled OpenStreetMap snapshot) ----------
let sitesP = null;
function loadSites() {
  if (!sitesP) {
    sitesP = fetch(`${import.meta.env.BASE_URL}sites.json`).then((r) => { if (!r.ok) throw new Error('sites'); return r.json(); })
      .catch((e) => { sitesP = null; throw e; });
  }
  return sitesP;
}

// ---------- profile ----------
const getProfileRow = async () => (await dbp).get('meta', 'profile');
const userOut = (p) => p && { id: 1, email: '', name: p.name, prefs: p.prefs || {}, createdAt: p.createdAt };

// ---------- router ----------
export async function handle(method, path, body) {
  const url = new URL(path, 'http://local');
  const p = url.pathname;
  const q = url.searchParams;
  const db = await dbp;
  let m;

  if (p === '/api/meta') return { rarity: RARITY, sizes: SIZE_CLASSES.map(({ key, label, range }) => ({ key, label, range })), groups: Object.entries(GROUPS).map(([key, label]) => ({ key, label })) };

  // profile
  if (p === '/api/auth/me' && method === 'GET') return { user: userOut(await getProfileRow()) };
  if (p === '/api/auth/register' && method === 'POST') {
    const name = String(body?.name || '').trim().slice(0, 60);
    if (!name) throw new LocalError('Tell us your name.');
    const prof = { name, prefs: {}, createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19) };
    await db.put('meta', prof, 'profile');
    persistStorage();
    return { user: userOut(prof) };
  }
  if (p === '/api/auth/me' && method === 'PATCH') {
    const cur = await getProfileRow();
    const next = { ...cur, name: String(body?.name ?? cur.name).trim().slice(0, 60) || cur.name, prefs: { ...(cur.prefs || {}), ...(body?.prefs || {}) } };
    await db.put('meta', next, 'profile');
    return { user: userOut(next) };
  }
  if (p === '/api/auth/logout') return { ok: true };

  // dives
  if (p === '/api/dives' && method === 'GET') {
    const all = await allDives();
    return { dives: await Promise.all(all.map((d, i) => hydrateDive(d, i + 1))) };
  }
  if ((m = p.match(/^\/api\/dives\/(\d+)$/))) {
    const id = Number(m[1]);
    const prev = await db.get('dives', id);
    if (!prev) throw new LocalError('Dive not found', 404);
    if (method === 'GET') { const all = await allDives(); return { dive: await hydrateDive(prev, all.findIndex((d) => d.id === id) + 1) }; }
    if (method === 'DELETE') {
      const photos = await db.getAllKeysFromIndex('photos', 'dive', id);
      const tx = db.transaction(['dives', 'photos'], 'readwrite');
      tx.objectStore('dives').delete(id);
      for (const k of photos) tx.objectStore('photos').delete(k);
      await tx.done;
      return { ok: true };
    }
    if (method === 'PUT') {
      const data = clean(body || {});
      if ('siteName' in data && !data.siteName) throw new LocalError('Dive site is required');
      const next = { ...prev, ...data, updatedAt: new Date().toISOString() };
      if (Array.isArray(body?.sightings)) next.sightings = await cleanSightings(body.sightings);
      const moved = (data.lat !== undefined && data.lat !== prev.lat) || (data.lon !== undefined && data.lon !== prev.lon);
      if (moved && !('area' in data)) next.area = null;
      await db.put('dives', next);
      if (moved) fillArea(id, next.lat, next.lon);
      return { dive: await hydrateDive(next) };
    }
  }
  if (p === '/api/dives' && method === 'POST') {
    const b = body || {};
    if (b.clientId) {
      const dup = (await db.getAll('dives')).find((d) => d.clientId === b.clientId);
      if (dup) return { dive: await hydrateDive(dup), duplicate: true };
    }
    const data = clean(b);
    if (!data.siteName) throw new LocalError('Dive site is required');
    if (!data.date) throw new LocalError('Date is required');
    const now = new Date().toISOString();
    const rec = { ...data, clientId: b.clientId || null, sightings: await cleanSightings(b.sightings), createdAt: now, updatedAt: now };
    const id = await db.add('dives', rec);
    if (!data.area) fillArea(id, data.lat, data.lon);
    persistStorage();
    return { dive: await hydrateDive({ ...rec, id }) };
  }

  // photos
  if (p === '/api/photos' && method === 'POST') {
    const file = body.get('file');
    if (!(file instanceof Blob) || !/^image\//.test(file.type || 'image/jpeg')) throw new LocalError('Attach a JPEG, PNG or WebP image.');
    const diveId = body.get('diveId') ? Number(body.get('diveId')) : null;
    if (diveId && !(await db.get('dives', diveId))) throw new LocalError('Dive not found', 404);
    const aphiaId = body.get('aphiaId') ? Number(body.get('aphiaId')) : null;
    const rec = {
      dive_id: diveId, aphia_id: aphiaId, blob: file, mime: file.type || 'image/jpeg',
      width: Number(body.get('width')) || null, height: Number(body.get('height')) || null,
      caption: body.get('caption') ? String(body.get('caption')).slice(0, 200) : null, created_at: new Date().toISOString(),
    };
    const id = await db.add('photos', rec);
    return { photo: photoOut({ ...rec, id }) };
  }
  if ((m = p.match(/^\/api\/photos\/(\d+)$/)) && method === 'DELETE') {
    const id = Number(m[1]);
    await db.delete('photos', id);
    if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id); }
    return { ok: true };
  }

  if (p === '/api/buddies') {
    const counts = new Map();
    for (const d of await allDives()) if (d.buddy) counts.set(d.buddy, (counts.get(d.buddy) || 0) + 1);
    return { buddies: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([b]) => b) };
  }

  // collection
  if (p === '/api/collection') {
    const agg = new Map();
    for (const d of await allDives()) {
      for (const s of d.sightings || []) {
        const a = agg.get(s.aphiaId) || { dives: 0, individuals: 0, firstSeen: d.date, lastSeen: d.date, depthMin: null, depthMax: null, nightDives: 0, dayDives: 0, areas: new Set(), sites: new Set() };
        a.dives++; a.individuals += s.count;
        if (d.date < a.firstSeen) a.firstSeen = d.date;
        if (d.date > a.lastSeen) a.lastSeen = d.date;
        if (d.maxDepth != null) { a.depthMin = a.depthMin == null ? d.maxDepth : Math.min(a.depthMin, d.maxDepth); a.depthMax = a.depthMax == null ? d.maxDepth : Math.max(a.depthMax, d.maxDepth); }
        if (d.light === 'night') a.nightDives++; else a.dayDives++;
        if (d.area) a.areas.add(d.area);
        if (d.siteName) a.sites.add(d.siteName);
        agg.set(s.aphiaId, a);
      }
    }
    const species = [];
    for (const [id, a] of agg) {
      const card = rowToCard(await speciesRow(id));
      if (card) species.push({ ...card, ...a, areas: [...a.areas], sites: [...a.sites] });
    }
    return { species };
  }
  if ((m = p.match(/^\/api\/collection\/(\d+)$/))) {
    const id = Number(m[1]);
    const sightings = [];
    for (const d of (await allDives()).reverse()) {
      const s = (d.sightings || []).find((x) => x.aphiaId === id);
      if (s) sightings.push({ diveId: d.id, siteName: d.siteName, area: d.area ?? null, lat: d.lat ?? null, lon: d.lon ?? null, date: d.date, startTime: d.startTime ?? null, maxDepth: d.maxDepth ?? null, count: s.count });
    }
    const photos = (await db.getAllFromIndex('photos', 'aphia', id)).sort((a, b) => b.id - a.id).map(photoOut);
    return { sightings, photos };
  }

  // species
  if (p === '/api/species/search') {
    const qs = String(q.get('q') || '').trim().slice(0, 80);
    if (qs.length < 2) return { results: [], errors: [] };
    return search(qs, { remote: q.get('mode') !== 'local', group: q.get('group') || undefined, size: q.get('size') || undefined, region: q.get('region') || undefined, limit: Math.min(40, Number(q.get('limit')) || 24) });
  }
  if (p === '/api/species/cards') {
    const ids = String(q.get('ids') || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 30);
    return { cards: await getCards(ids) };
  }
  if ((m = p.match(/^\/api\/species\/(\d+)$/))) {
    const id = Number(m[1]);
    try {
      const sp = await getProfile(id);
      if (!sp) throw new LocalError('No WoRMS record for this ID.', 404);
      return { species: sp };
    } catch (e) {
      const cached = rowToCard(await speciesRow(id));
      if (cached) return { species: cached, partial: true, error: e.message };
      throw e;
    }
  }

  // sites
  if (p === '/api/sites') {
    const s = await loadSites();
    return { status: { state: 'ready', count: s.sites.length, updatedAt: s.generatedAt }, sites: s.sites, attribution: s.attribution };
  }
  if ((m = p.match(/^\/api\/sites\/(.+)$/))) {
    const id = decodeURIComponent(m[1]);
    const s = await loadSites();
    const t = s.sites.find((x) => x[0] === id);
    if (!t) throw new LocalError('Unknown site', 404);
    const d = s.details[id] || {};
    return { site: { id, name: t[1], lat: t[2], lon: t[3], maxDepth: t[4], type: t[5], entry: d.entry ?? null, difficulty: d.difficulty ?? null, description: d.description ?? null, website: d.website ?? null, place: d.place ?? null, osmUrl: `https://www.openstreetmap.org/${id.replace('osm:', '')}` } };
  }
  if (p === '/api/geocode') {
    const qs = String(q.get('q') || '').trim();
    if (qs.length < 3) return { places: [] };
    const r = await getJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(qs)}&accept-language=en`, { ttl: 30 * 86400, timeout: 8000 });
    return { places: (r || []).map((x) => ({ name: x.display_name, lat: +x.lat, lon: +x.lon })) };
  }

  throw new LocalError('Not found', 404);
}

// ---------- backup ----------
const blobToDataUrl = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
const dataUrlToBlob = async (u) => (await fetch(u)).blob();

/** Everything on this device as one JSON file (photos embedded). */
export async function exportBackup() {
  const db = await dbp;
  const dives = await db.getAll('dives');
  const photos = await Promise.all((await db.getAll('photos')).map(async ({ blob, ...p }) => ({ ...p, data: await blobToDataUrl(blob) })));
  const ids = new Set(dives.flatMap((d) => (d.sightings || []).map((s) => s.aphiaId)));
  const species = (await db.getAll('species')).filter((s) => ids.has(s.aphia_id));
  return new Blob([JSON.stringify({ format: 'divedex-backup', version: 1, exportedAt: new Date().toISOString(), profile: await getProfileRow(), dives, photos, species })], { type: 'application/json' });
}

/** Merge a backup into this device. Dives already present (same clientId or same id+site+date) are skipped. */
export async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (data?.format !== 'divedex-backup') throw new LocalError('This is not a DiveDex backup file.');
  const db = await dbp;
  if (!(await getProfileRow()) && data.profile) await db.put('meta', data.profile, 'profile');
  // keep imported species usable offline, but let them refresh (newer image rules, names) once online
  for (const s of data.species || []) if (!(await db.get('species', s.aphia_id))) await db.put('species', { ...s, card_at: 1, profile_at: null });
  const existing = await db.getAll('dives');
  const key = (d) => d.clientId || `${d.siteName}|${d.date}|${d.startTime || ''}`;
  const have = new Set(existing.map(key));
  const idMap = new Map();
  let added = 0;
  for (const d of data.dives || []) {
    if (have.has(key(d))) continue;
    const { id: oldId, ...rest } = d;
    const id = await db.add('dives', rest);
    idMap.set(oldId, id);
    added++;
  }
  for (const ph of data.photos || []) {
    if (ph.dive_id != null && !idMap.has(ph.dive_id)) continue; // its dive was a duplicate
    const { id: _old, data: du, ...rest } = ph;
    await db.add('photos', { ...rest, dive_id: ph.dive_id != null ? idMap.get(ph.dive_id) : null, blob: await dataUrlToBlob(du) });
  }
  persistStorage();
  return { added, skipped: (data.dives || []).length - added };
}

/** Delete every DiveDex record on this device. */
export async function wipeAll() {
  const db = await dbp;
  for (const s of ['meta', 'dives', 'photos', 'species', 'names', 'cache']) await db.clear(s);
}
