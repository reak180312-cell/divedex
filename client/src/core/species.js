// Assembles species "cards" (light) and "profiles" (full) from WoRMS + GBIF + Wikidata/Wikipedia + Commons.
// Everything shown is sourced; missing data stays missing (null) rather than being guessed.
// All results are cached on this device (IndexedDB) so the collection works offline.
import { dbp } from './db.js';
import { settle } from './http.js';
import { worms, parseTraits, sizeClass, groupOf, GROUPS } from './worms.js';
import { entityForAphia, namesFromEntity, summary } from './wiki.js';
import { commonsImages, gbifMatch, gbifCount, gbifImages } from './images.js';
import { norm } from './text.js';

const DAY_MS = 86400e3;
const CARD_TTL = 30 * DAY_MS;

export const RARITY = [
  { key: 'common', label: 'Common', min: 100000 },
  { key: 'uncommon', label: 'Uncommon', min: 10000 },
  { key: 'rare', label: 'Rare', min: 1000 },
  { key: 'very-rare', label: 'Very rare', min: 100 },
  { key: 'exceptional', label: 'Exceptional', min: 0 },
];
export const rarityOf = (count) => (count == null ? null : RARITY.find((r) => count >= r.min).key);

// ---- local name index (kept in memory for fast fuzzy search) ----
let nameIndex = null;
export async function allNames() {
  if (!nameIndex) nameIndex = await (await dbp).getAll('names');
  return nameIndex;
}
export async function addNames(aphiaId, names, lang) {
  const db = await dbp;
  const idx = await allNames();
  const tx = db.transaction('names', 'readwrite');
  for (const n of names) {
    const nn = norm(n);
    if (!nn) continue;
    const row = { aphia_id: aphiaId, name: n, norm: nn, lang };
    if (!idx.some((r) => r.aphia_id === aphiaId && r.norm === nn && r.lang === lang)) idx.push(row);
    tx.store.put(row);
  }
  await tx.done.catch(() => {});
}

export const speciesRow = async (id) => (await dbp).get('species', id);
const saveRow = async (row) => (await dbp).put('species', row);

/** Store a raw WoRMS record (callers only pass accepted records). */
export async function upsertRecord(r) {
  if (!r?.AphiaID) return;
  const old = await speciesRow(r.AphiaID);
  await saveRow({ ...(old || {}), aphia_id: r.AphiaID, scientific_name: r.scientificname, authority: r.authority ?? null, rank: r.rank ?? null, record: r, group_key: groupOf(r) });
  await addNames(r.AphiaID, [r.scientificname], 'sci');
}

export function rowToCard(row) {
  if (!row) return null;
  const rec = row.record || {};
  return {
    aphiaId: row.aphia_id,
    scientificName: row.scientific_name,
    authority: row.authority,
    rank: row.rank,
    family: rec.family ?? null,
    nameEn: row.name_en ?? null,
    nameHe: row.name_he ?? null,
    group: row.group_key,
    groupLabel: GROUPS[row.group_key] ?? null,
    sizeCm: row.size_cm ?? null,
    sizeClass: sizeClass(row.size_cm ?? null),
    gbifCount: row.gbif_count ?? null,
    rarity: row.rarity ?? null,
    image: row.image ?? null,
    wormsUrl: `https://www.marinespecies.org/aphia.php?p=taxdetails&id=${row.aphia_id}`,
    enriched: !!row.card_at,
  };
}

/** Ensure we have an accepted WoRMS record; follows synonym -> valid name. Returns accepted AphiaID or null. */
export async function ensureRecord(aphiaId) {
  if (await speciesRow(aphiaId)) return aphiaId;
  const r = await worms.record(aphiaId);
  if (!r) return null;
  if (r.valid_AphiaID && r.valid_AphiaID !== r.AphiaID) {
    await addNames(r.valid_AphiaID, [r.scientificname], 'syn');
    return ensureRecord(r.valid_AphiaID);
  }
  await upsertRecord(r);
  return r.AphiaID;
}

const englishVernacular = (vs) => vs.filter((v) => v.language_code === 'eng').map((v) => v.vernacular);
const hebrewVernacular = (vs) => vs.filter((v) => v.language_code === 'heb').map((v) => v.vernacular);
const titleCaseFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const cardInflight = new Map();

export async function getCard(aphiaId, { force = false } = {}) {
  const id = await ensureRecord(aphiaId);
  if (!id) return null;
  const row = await speciesRow(id);
  if (!force && row.card_at && Date.now() - row.card_at < CARD_TTL) return rowToCard(row);
  if (cardInflight.has(id)) return cardInflight.get(id);
  const p = buildCard(row).finally(() => cardInflight.delete(id));
  cardInflight.set(id, p);
  return p;
}

async function buildCard(row) {
  const id = row.aphia_id;
  const sci = row.scientific_name;
  const failed = [];
  const [vern, ent, attrs, gbifKey] = await Promise.all([
    settle(worms.vernaculars(id), [], failed),
    settle(entityForAphia(id), null, failed),
    settle(worms.attributes(id), [], failed),
    settle(gbifMatch(sci), null, failed),
  ]);
  const wd = namesFromEntity(ent, sci);
  const en = englishVernacular(vern);
  const he = [...hebrewVernacular(vern), ...wd.heAliases];
  const notSci = (s) => s && s.toLowerCase() !== sci.toLowerCase();
  const enWikiName = notSci(wd.enWiki) ? wd.enWiki.replace(/\s*\(.*\)$/, '') : null;
  // WoRMS vernaculars are unordered, so prefer English Wikipedia's article title, then Wikidata's label,
  // then a WoRMS name Wikidata agrees with, and only then any WoRMS English name.
  const wdNorm = new Set(wd.enAliases.map(norm));
  const nameEn = enWikiName || wd.enAliases[0] || en.find((v) => wdNorm.has(norm(v))) || en[0] || null;
  const nameHe = he[0] || null;
  await addNames(id, [...en, ...wd.enAliases, ...(enWikiName ? [enWikiName] : [])], 'en');
  await addNames(id, he, 'he');

  const { sizeCm } = parseTraits(attrs, id);
  const count = gbifKey ? await settle(gbifCount(gbifKey), null, failed) : null;

  // Prefer a real photograph: Commons photo, then GBIF field photo, then a Commons illustration.
  const commons = await settle(commonsImages(sci, wd.p18, 3, failed), [], failed);
  let image = commons.find((i) => !i.illustration) || null;
  if (!image && gbifKey) image = (await settle(gbifImages(gbifKey, 1), [], failed))[0] || null;
  if (!image) image = commons[0] || null;

  // If upstreams were unreachable, keep whatever we had before and retry in ~10 minutes.
  const keep = (v, old) => v ?? old ?? null;
  const fresh = await speciesRow(id);
  const next = {
    ...fresh,
    name_en: keep(nameEn && titleCaseFirst(nameEn), fresh.name_en), name_he: keep(nameHe, fresh.name_he),
    size_cm: keep(sizeCm, fresh.size_cm), gbif_key: keep(gbifKey, fresh.gbif_key), gbif_count: keep(count, fresh.gbif_count),
    rarity: keep(rarityOf(count), fresh.rarity), image: image ?? fresh.image ?? null,
    card_at: failed.length ? Date.now() - CARD_TTL + 10 * 60e3 : Date.now(),
  };
  await saveRow(next);
  return rowToCard(next);
}

export async function getCards(ids) {
  const out = [];
  const queue = [...new Set(ids)];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const id = queue.shift();
      const c = await getCard(id).catch(async () => rowToCard(await speciesRow(id)));
      if (c) out.push(c);
    }
  }));
  return out;
}

export async function getDistributions(aphiaId, failed) {
  return (await settle(worms.distributions(aphiaId), [], failed))
    .filter((d) => d.recordStatus !== 'deleted')
    .map((d) => ({
      locality: d.locality, higherGeography: d.higherGeography || null, locationId: d.locationID || null,
      establishment: d.establishmentMeans || null, occurrence: d.occurrence || null, invasiveness: d.invasiveness || null,
    }));
}

export async function getProfile(aphiaId, { force = false } = {}) {
  const card = await getCard(aphiaId);
  if (!card) return null;
  const id = card.aphiaId;
  const row = await speciesRow(id);
  if (!force && row.profile && row.profile_at && Date.now() - row.profile_at < CARD_TTL) return { ...card, ...row.profile };
  const rec = row.record || {};
  const failed = [];
  const [cls, syn, vern, dist, attrs, ent] = await Promise.all([
    settle(worms.classification(id), null, failed),
    settle(worms.synonyms(id), [], failed),
    settle(worms.vernaculars(id), [], failed),
    getDistributions(id, failed),
    settle(worms.attributes(id), [], failed),
    settle(entityForAphia(id), null, failed),
  ]);
  const wd = namesFromEntity(ent, card.scientificName);
  const classification = [];
  for (let n = cls; n; n = n.child) classification.push({ rank: n.rank, name: n.scientificname, aphiaId: n.AphiaID });
  const synonyms = syn.map((s) => ({ name: s.scientificname, authority: s.authority, status: s.status }));
  await addNames(id, synonyms.map((s) => s.name), 'syn');

  const [commons, gbif, sumEn, sumHe] = await Promise.all([
    settle(commonsImages(card.scientificName, wd.p18, 12, failed), [], failed),
    row.gbif_key ? settle(gbifImages(row.gbif_key, 12), [], failed) : Promise.resolve([]),
    settle(summary('en', wd.enWiki), null, failed),
    settle(summary('he', wd.heWiki), null, failed),
  ]);
  const { traits, sizeRef } = parseTraits(attrs, id);
  // Alerts only from explicit WoRMS records — nothing inferred.
  const alerts = [];
  for (const t of traits) {
    if (/iucn/i.test(t.type)) alerts.push({ kind: 'iucn', title: 'IUCN Red List', text: `${t.value}${t.detail ? ` (${t.detail})` : ''}`, source: t.reference });
    else if (/cites/i.test(t.type)) alerts.push({ kind: 'cites', title: 'CITES listed', text: t.value, source: t.reference });
  }
  const introduced = dist.filter((d) => /alien|introduced/i.test(d.establishment || '') || /invasive/i.test(d.invasiveness || ''));
  if (introduced.length) {
    alerts.push({
      kind: 'introduced', title: introduced.some((d) => /^invasive$/i.test(d.invasiveness || '')) ? 'Invasive' : 'Introduced',
      text: `Recorded as non-native in ${introduced.slice(0, 4).map((d) => d.locality).join(', ')}${introduced.length > 4 ? ` and ${introduced.length - 4} more` : ''}.`,
      source: 'WoRMS distribution records',
    });
  }
  const profile = {
    alerts,
    classification,
    synonyms,
    vernaculars: vern.map((v) => ({ name: v.vernacular, lang: v.language, code: v.language_code })),
    distribution: dist,
    traits,
    sizeRef,
    environment: { marine: !!rec.isMarine, brackish: !!rec.isBrackish, freshwater: !!rec.isFreshwater, terrestrial: !!rec.isTerrestrial },
    extinct: rec.isExtinct === 1,
    citation: rec.citation ?? null,
    images: [...commons.filter((i) => !i.illustration), ...gbif, ...commons.filter((i) => i.illustration)],
    summaries: { en: sumEn, he: sumHe },
    wikidata: wd.qid,
    gbifKey: row.gbif_key ?? null,
  };
  // Only cache complete profiles; partial ones (an upstream failed) are retried on the next view.
  if (!failed.length) await saveRow({ ...(await speciesRow(id)), profile, profile_at: Date.now() });
  else profile.partial = true;
  return { ...card, ...profile };
}
