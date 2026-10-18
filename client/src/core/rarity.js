// Local record frequency — how often a species is *recorded* near a place, compared with its neighbours.
//
// Why not global counts: a raw worldwide GBIF count mostly measures how many people photograph a species
// (a manta ray has more records than an obscure goby that is far more abundant). Instead we take all GBIF
// records of the species' group (class; or order when GBIF has no class, or the class includes land
// animals) within ~100 km of the sighting, rank the species among the species recorded there, and report
// a coarse band. Ranking among neighbours cancels out how heavily an area happens to be sampled.
//
// Never a precise score. With too few records or species in the area the answer is "Not rated".
// One request per group and area (shared by every species of that group), cached for 30 days.
import { getJSON } from './http.js';

const DAY = 86400;
export const RADIUS_KM = 100;
const MIN_GROUP_RECORDS = 300;
const MIN_GROUP_SPECIES = 8;
const enc = encodeURIComponent;

export const LOCAL_BANDS = {
  frequent: { label: 'Frequently recorded here', short: 'Frequent here', explain: 'among the most-recorded quarter of its group nearby' },
  occasional: { label: 'Occasionally recorded here', short: 'Occasional here', explain: 'in the middle half of its group by records nearby' },
  rare: { label: 'Rarely recorded here', short: 'Rarely recorded', explain: 'among the least-recorded quarter of its group nearby' },
  none: { label: 'No nearby records', short: 'No nearby records', explain: 'no GBIF records of it nearby, though the area is well recorded' },
  unrated: { label: 'Not rated', short: 'Not rated', explain: 'not enough records nearby to judge' },
};

const LAND_CLASSES = new Set(['Reptilia', 'Mammalia', 'Aves']);
const round = (v) => Math.round(v * 4) / 4; // ~25 km grid so nearby dive sites share one cached answer

async function match(scientificName) {
  const m = await getJSON(`https://api.gbif.org/v1/species/match?name=${enc(scientificName)}&strict=true`, { ttl: 60 * DAY });
  if (!m?.usageKey || m.matchType === 'NONE' || m.matchType === 'HIGHERRANK') return null;
  return m;
}

/**
 * @returns {Promise<{band: string, records: number|null, rank: number|null, peers: number|null, groupRecords: number|null, groupName: string|null, radiusKm: number}>}
 */
export async function localFrequency(scientificName, lat, lon) {
  const out = { band: 'unrated', records: null, rank: null, peers: null, groupRecords: null, groupName: null, radiusKm: RADIUS_KM };
  if (lat == null || lon == null) return out;
  const m = await match(scientificName);
  if (!m) return out;
  const speciesKey = m.speciesKey || m.acceptedUsageKey || m.usageKey;
  const useOrder = !m.classKey || LAND_CLASSES.has(m.class);
  const groupKey = useOrder ? m.orderKey : m.classKey;
  out.groupName = (useOrder ? m.order : m.class) || null;
  if (!groupKey) return out;
  const r = await getJSON(`https://api.gbif.org/v1/occurrence/search?taxonKey=${groupKey}&geoDistance=${round(lat)},${round(lon)},${RADIUS_KM}km&limit=0&facet=speciesKey&facetLimit=3000`, { ttl: 30 * DAY, timeout: 15000 });
  const counts = (r?.facets?.[0]?.counts || []).map((c) => ({ key: Number(c.name), n: c.count }));
  out.groupRecords = r?.count ?? null;
  out.peers = counts.length;
  const mine = counts.find((c) => c.key === speciesKey)?.n ?? 0;
  out.records = mine;
  if ((out.groupRecords ?? 0) < MIN_GROUP_RECORDS || counts.length < MIN_GROUP_SPECIES) return out;
  if (mine === 0) return { ...out, band: 'none' };
  const above = counts.filter((c) => c.n > mine).length;
  out.rank = above + 1;
  const p = above / counts.length;
  return { ...out, band: p < 0.25 ? 'frequent' : p < 0.75 ? 'occasional' : 'rare' };
}
