import { useEffect, useRef, useState } from 'react';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { api } from './api';
import type { SiteTuple, SpeciesCard } from './types';

// ---------- species cards (batched, cached in memory) ----------
const cardCache = new Map<number, SpeciesCard>();
const waiting = new Map<number, ((c: SpeciesCard | null) => void)[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flushCards() {
  timer = null;
  const ids = [...waiting.keys()].slice(0, 24);
  const cbs = ids.map((id) => [id, waiting.get(id)!] as const);
  ids.forEach((id) => waiting.delete(id));
  api.get<{ cards: SpeciesCard[] }>(`/api/species/cards?ids=${ids.join(',')}`)
    .then(({ cards }) => {
      const byId = new Map(cards.map((c) => [c.aphiaId, c]));
      for (const [id, fns] of cbs) {
        const c = byId.get(id) ?? null;
        if (c) cardCache.set(id, c);
        fns.forEach((f) => f(c));
      }
    })
    .catch(() => cbs.forEach(([, fns]) => fns.forEach((f) => f(null))));
  if (waiting.size) timer = setTimeout(flushCards, 30);
}

export function loadCard(id: number): Promise<SpeciesCard | null> {
  const hit = cardCache.get(id);
  if (hit?.enriched) return Promise.resolve(hit);
  return new Promise((resolve) => {
    (waiting.get(id) || waiting.set(id, []).get(id)!).push(resolve);
    if (!timer) timer = setTimeout(flushCards, 40);
  });
}

export const primeCard = (c: SpeciesCard) => { if (c.enriched || !cardCache.has(c.aphiaId)) cardCache.set(c.aphiaId, c); };

/** Upgrade possibly un-enriched species cards (names/images/rarity load lazily server-side). */
export function useEnrichedCards<T extends SpeciesCard>(items: T[]): T[] {
  const [, force] = useState(0);
  const ids = items.filter((c) => !c.enriched && !cardCache.get(c.aphiaId)?.enriched).map((c) => c.aphiaId);
  const key = ids.join(',');
  useEffect(() => {
    if (!ids.length) return;
    let live = true;
    Promise.all(ids.map(loadCard)).then(() => live && force((n) => n + 1));
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return items.map((c) => {
    const e = cardCache.get(c.aphiaId);
    if (!e?.enriched || c.enriched) return c;
    // copy only species fields so collection-specific ones (dives, depth…) survive
    const merged: T = { ...c };
    for (const k of CARD_KEYS) (merged as any)[k] = e[k];
    return merged;
  });
}
const CARD_KEYS = ['nameEn', 'nameHe', 'sizeCm', 'sizeClass', 'gbifCount', 'rarity', 'image', 'groupLabel', 'family', 'enriched'] as const;

// ---------- OSM dive sites (shipped whole, ~4k points) ----------
let sitesPromise: Promise<SiteTuple[]> | null = null;
export function loadSites(): Promise<SiteTuple[]> {
  if (!sitesPromise) {
    sitesPromise = api.get<{ sites: SiteTuple[]; status: { state: string } }>('/api/sites')
      .then((r) => {
        if (r.sites.length) idbSet('dd:sites', r.sites).catch(() => {});
        if (!r.sites.length && r.status.state === 'loading') sitesPromise = null; // server still fetching from Overpass
        return r.sites;
      })
      .catch(async () => { sitesPromise = null; return (await idbGet<SiteTuple[]>('dd:sites').catch(() => undefined)) || []; });
  }
  return sitesPromise;
}

export function useSites() {
  const [sites, setSites] = useState<SiteTuple[] | null>(null);
  useEffect(() => {
    let live = true, tries = 0;
    const go = () => loadSites().then((s) => {
      if (!live) return;
      setSites(s);
      if (!s.length && tries++ < 6) setTimeout(go, 8000); // first boot: server may still be importing OSM sites
    });
    go();
    return () => { live = false; };
  }, []);
  return sites;
}

export function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function useClickOutside<T extends HTMLElement>(onOut: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const h = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOut(); };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, [onOut]);
  return ref;
}
