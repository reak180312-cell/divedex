// World Register of Marine Species REST client — https://www.marinespecies.org/rest/
import { getJSON } from './http.js';

const BASE = 'https://www.marinespecies.org/rest';
const DAY = 86400;
const enc = encodeURIComponent;
const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

export const worms = {
  record: (id) => getJSON(`${BASE}/AphiaRecordByAphiaID/${id}`, { ttl: 30 * DAY }),
  records: async (ids) => {
    if (!ids.length) return [];
    const qs = ids.slice(0, 50).map((i) => `aphiaids[]=${i}`).join('&');
    return arr(await getJSON(`${BASE}/AphiaRecordsByAphiaIDs?${qs}`, { ttl: 30 * DAY })).filter(Boolean);
  },
  byName: async (name, like = true) =>
    arr(await getJSON(`${BASE}/AphiaRecordsByName/${enc(name)}?like=${like}&marine_only=true&offset=1`, { ttl: 7 * DAY, timeout: 9000 })),
  byVernacular: async (name) =>
    arr(await getJSON(`${BASE}/AphiaRecordsByVernacular/${enc(name)}?like=true&offset=1`, { ttl: 7 * DAY, timeout: 9000 })),
  /** TAXAMATCH fuzzy matching of (possibly misspelled) scientific names. */
  matchNames: async (names) => {
    const qs = names.map((n) => `scientificnames[]=${enc(n)}`).join('&');
    const res = arr(await getJSON(`${BASE}/AphiaRecordsByMatchNames?${qs}&marine_only=true`, { ttl: 7 * DAY, timeout: 12000 }));
    return res.map(arr);
  },
  classification: (id) => getJSON(`${BASE}/AphiaClassificationByAphiaID/${id}`, { ttl: 30 * DAY }),
  vernaculars: async (id) => arr(await getJSON(`${BASE}/AphiaVernacularsByAphiaID/${id}`, { ttl: 30 * DAY })),
  synonyms: async (id) => arr(await getJSON(`${BASE}/AphiaSynonymsByAphiaID/${id}?offset=1`, { ttl: 30 * DAY })),
  distributions: async (id) => arr(await getJSON(`${BASE}/AphiaDistributionsByAphiaID/${id}`, { ttl: 30 * DAY })),
  attributes: async (id) => arr(await getJSON(`${BASE}/AphiaAttributesByAphiaID/${id}`, { ttl: 30 * DAY })),
};

/** Flatten the WoRMS attribute tree into readable traits. Only traits recorded for this exact taxon. */
export function parseTraits(attrs, aphiaId) {
  const traits = [];
  let sizeCm = null;
  let sizeRef = null;
  const walk = (node, ctx) => {
    for (const c of node.children || []) {
      ctx[c.measurementType] = c.measurementValue;
      walk(c, ctx);
    }
    return ctx;
  };
  for (const a of attrs) {
    if (a.AphiaID_Inherited && a.AphiaID_Inherited !== aphiaId) continue;
    const ctx = walk(a, {});
    if (a.measurementType === 'Body size') {
      const v = parseFloat(String(a.measurementValue).replace(',', '.'));
      const unit = (ctx.Unit || 'cm').toLowerCase();
      const factor = unit === 'mm' ? 0.1 : unit === 'm' ? 100 : unit === 'cm' ? 1 : null;
      if (Number.isFinite(v) && factor) {
        const cm = v * factor;
        const isMax = !ctx.Type || /max/i.test(ctx.Type);
        if (isMax && (sizeCm == null || cm > sizeCm)) { sizeCm = cm; sizeRef = a.reference || null; }
      }
      traits.push({ type: 'Body size', value: `${a.measurementValue} ${ctx.Unit || ''}`.trim(), detail: [ctx.Type, ctx.Dimension].filter(Boolean).join(' ') || null, reference: a.reference || null });
      continue;
    }
    if (/identifier/i.test(a.measurementType)) continue;
    const detail = Object.entries(ctx).filter(([k]) => !/identifier|unit/i.test(k)).map(([k, v]) => `${k}: ${v}`).join(' · ');
    traits.push({ type: a.measurementType, value: a.measurementValue, detail: detail || null, reference: a.reference || null });
  }
  const seen = new Set();
  return {
    sizeCm,
    sizeRef,
    traits: traits.filter((t) => { const k = `${t.type}|${t.value}|${t.detail}`; if (seen.has(k)) return false; seen.add(k); return true; }),
  };
}

export const SIZE_CLASSES = [
  { key: 'tiny', label: 'Tiny', max: 5, range: '< 5 cm' },
  { key: 'small', label: 'Small', max: 30, range: '5–30 cm' },
  { key: 'medium', label: 'Medium', max: 100, range: '30 cm–1 m' },
  { key: 'large', label: 'Large', max: 300, range: '1–3 m' },
  { key: 'giant', label: 'Giant', max: Infinity, range: '> 3 m' },
];
export const sizeClass = (cm) => (cm == null ? null : SIZE_CLASSES.find((s) => cm < s.max)?.key ?? null);

/** Broad, taxonomy-derived group (from WoRMS classification fields, not guessed). */
export function groupOf(r) {
  const cls = r.class || '', phy = r.phylum || '', ord = r.order || '', kg = r.kingdom || '';
  if (cls === 'Elasmobranchii' || cls === 'Holocephali') return 'sharks-rays';
  if (['Teleostei', 'Actinopteri', 'Actinopterygii', 'Myxini', 'Petromyzonti', 'Sarcopterygii'].includes(cls)) return 'fish';
  if (cls === 'Mammalia') return 'mammals';
  if (cls === 'Reptilia' || ord === 'Testudines' || ord === 'Squamata') return 'reptiles';
  if (cls === 'Aves') return 'birds';
  if (cls === 'Cephalopoda') return 'cephalopods';
  if (['Nudibranchia', 'Pleurobranchida', 'Aplysiida', 'Cephalaspidea'].includes(ord)) return 'sea-slugs';
  if (phy === 'Mollusca') return 'molluscs';
  if (phy === 'Arthropoda') return 'crustaceans';
  if (phy === 'Echinodermata') return 'echinoderms';
  if (phy === 'Cnidaria') return cls === 'Anthozoa' ? 'corals-anemones' : 'jellies-hydroids';
  if (phy === 'Porifera') return 'sponges';
  if (phy === 'Annelida' || phy === 'Platyhelminthes') return 'worms';
  if (cls === 'Ascidiacea') return 'tunicates';
  if (kg === 'Plantae' || kg === 'Chromista') return 'algae-plants';
  return 'other';
}

export const GROUPS = {
  fish: 'Bony fish', 'sharks-rays': 'Sharks & rays', mammals: 'Marine mammals', reptiles: 'Reptiles', birds: 'Seabirds',
  cephalopods: 'Cephalopods', 'sea-slugs': 'Sea slugs', molluscs: 'Molluscs', crustaceans: 'Crustaceans',
  echinoderms: 'Echinoderms', 'corals-anemones': 'Corals & anemones', 'jellies-hydroids': 'Jellies & hydroids',
  sponges: 'Sponges', worms: 'Marine worms', tunicates: 'Tunicates', 'algae-plants': 'Algae & seagrass', other: 'Other',
};
