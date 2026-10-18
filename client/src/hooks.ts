import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { api } from './api';
import type { LocalFrequency, SiteTuple, SpeciesCard, SpeciesImage } from './types';

// ---------- species data scheduler ----------
// Measured problem (cold start, slow 3G): the collection requested every card in one batch and rendered
// nothing until the slowest finished (~36 s). Now each species loads on its own, visible ones first,
// with small concurrency caps so phones don't trip the APIs' rate limits.

class Queue {
  private pending: { id: string | number; run: () => Promise<void>; high: boolean }[] = [];
  private active = 0;
  private queued = new Set<string | number>();
  constructor(private limit: number) {}
  push(id: string | number, run: () => Promise<void>, high: boolean) {
    if (this.queued.has(id)) {
      if (high) { // promote: user scrolled it into view
        const i = this.pending.findIndex((t) => t.id === id);
        if (i > 0 && !this.pending[i].high) { const [t] = this.pending.splice(i, 1); t.high = true; this.pending.unshift(t); }
      }
      return;
    }
    this.queued.add(id);
    const t = { id, run, high };
    if (high) { const firstLow = this.pending.findIndex((x) => !x.high); this.pending.splice(firstLow < 0 ? this.pending.length : firstLow, 0, t); }
    else this.pending.push(t);
    this.pump();
  }
  private pump() {
    while (this.active < this.limit && this.pending.length) {
      const t = this.pending.shift()!;
      this.active++;
      t.run().catch(() => {}).finally(() => { this.active--; this.queued.delete(t.id); this.pump(); });
    }
  }
}
const cardQ = new Queue(2);
const photoQ = new Queue(4);

interface Entry { card?: SpeciesCard; photos?: SpeciesImage[]; cardTried?: boolean; photosTried?: boolean; photoRetries?: number }
const cache = new Map<number, Entry>();
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach((f) => f()); };
const entry = (id: number) => cache.get(id) || cache.set(id, {}).get(id)!;
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
/** Re-render whenever any species data arrives. */
export const useSpeciesVersion = () => useSyncExternalStore(subscribe, () => version);

export function requestCard(id: number, high = true) {
  const e = entry(id);
  if (e.cardTried) return;
  cardQ.push(id, async () => {
    e.cardTried = true;
    const r = await api.get<{ cards: SpeciesCard[] }>(`/api/species/cards?ids=${id}`).catch(() => null);
    if (r?.cards[0]) { e.card = r.cards[0]; emit(); }
  }, high);
}
export function requestPhotos(id: number, high = true) {
  const e = entry(id);
  if (e.photosTried) return;
  photoQ.push(id, async () => {
    e.photosTried = true;
    const r = await api.get<{ photos: SpeciesImage[]; partial: boolean }>(`/api/species/${id}/photos`).catch(() => null);
    if (r && (r.photos.length || !r.partial)) { e.photos = r.photos; emit(); }
    // A source was throttled/unreachable and we got nothing: try again a bit later (up to twice).
    if ((!r || (r.partial && !r.photos.length)) && (e.photoRetries ?? 0) < 2) {
      e.photoRetries = (e.photoRetries ?? 0) + 1;
      setTimeout(() => { e.photosTried = false; requestPhotos(id, false); }, 6000 * e.photoRetries);
    } else if (!r || !r.photos.length) { e.photos = r?.photos ?? []; emit(); }
  }, high);
}
export const primeCard = (c: SpeciesCard) => { const e = entry(c.aphiaId); if (c.enriched || !e.card) e.card = c; };

const CARD_KEYS = ['nameEn', 'nameHe', 'sizeCm', 'sizeClass', 'gbifCount', 'rarity', 'groupLabel', 'family', 'enriched'] as const;
/** Base item (e.g. a collection entry) + freshest cached species fields + verified photo candidates. */
export function mergeSpecies<T extends SpeciesCard>(c: T): T {
  const e = cache.get(c.aphiaId);
  if (!e) return c;
  const out: T = { ...c };
  if (e.card?.enriched && !c.enriched) for (const k of CARD_KEYS) (out as any)[k] = e.card[k];
  if (e.photos) { out.images = e.photos; out.image = e.photos[0] ?? c.image ?? null; out.photosFresh = true; }
  return out;
}

/** Small lists (a dive's species, the log form): load everything now. */
export function useEnrichedCards<T extends SpeciesCard>(items: T[]): T[] {
  useSpeciesVersion();
  const key = items.map((c) => c.aphiaId).join(',');
  useEffect(() => {
    for (const c of items) if (!c.enriched) requestCard(c.aphiaId, true);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return items.map(mergeSpecies);
}

/** Large lists (collection): names/sizes refresh in the background at low priority; photos load per card when visible. */
export function useBackgroundCards<T extends SpeciesCard>(items: T[]): T[] {
  useSpeciesVersion();
  const key = items.filter((c) => !c.enriched).map((c) => c.aphiaId).join(',');
  useEffect(() => { for (const c of items) if (!c.enriched) requestCard(c.aphiaId, false); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return items.map(mergeSpecies);
}

/** True once the element is within `margin` px of the viewport (stays true). */
export function useNearViewport<T extends Element>(margin = 400) {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: `${margin}px` });
    io.observe(el);
    return () => io.disconnect();
  }, [near, margin]);
  return [ref, near] as const;
}

// ---------- local record frequency (GBIF, lowest priority; one at a time after photos) ----------
const localQ = new Queue(1);
const localCache = new Map<string, LocalFrequency | null>();
const localKey = (id: number, lat: number, lon: number) => `${id}@${lat.toFixed(2)},${lon.toFixed(2)}`;

export function requestLocal(aphiaId: number, lat: number | null | undefined, lon: number | null | undefined, high = false) {
  if (lat == null || lon == null) return;
  const key = localKey(aphiaId, lat, lon);
  if (localCache.has(key)) return;
  localQ.push(key, async () => {
    if (localCache.has(key)) return;
    const r = await api.get<{ local: LocalFrequency }>(`/api/species/${aphiaId}/local?lat=${lat}&lon=${lon}`).catch(() => null);
    localCache.set(key, r?.local ?? null);
    emit();
  }, high);
}

/** Cached band, `null` if not ratable here, `undefined` while unknown. */
export function peekLocal(aphiaId: number, lat: number | null | undefined, lon: number | null | undefined): LocalFrequency | null | undefined {
  if (lat == null || lon == null) return null;
  const key = localKey(aphiaId, lat, lon);
  return localCache.has(key) ? localCache.get(key) : undefined;
}

/** Local frequency band for a species at a place, fetched lazily (when `enabled`) and cached. */
export function useLocalFrequency(aphiaId: number, lat: number | null | undefined, lon: number | null | undefined, enabled = true): LocalFrequency | null | undefined {
  useSpeciesVersion();
  const key = lat != null && lon != null ? localKey(aphiaId, lat, lon) : '';
  useEffect(() => { if (enabled) requestLocal(aphiaId, lat, lon, true); }, [enabled, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return peekLocal(aphiaId, lat, lon);
}

// ---------- image download slots ----------
// At most 6 photo downloads in flight; the rest wait (visible cards ask first because they mount first).
let imgActive = 0;
const imgWaiting: (() => void)[] = [];
export function acquireImageSlot(): Promise<() => void> {
  return new Promise((resolve) => {
    const grant = () => {
      imgActive++;
      let done = false;
      resolve(() => { if (done) return; done = true; imgActive--; imgWaiting.shift()?.(); });
    };
    if (imgActive < 6) grant(); else imgWaiting.push(grant);
  });
}

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
