// Species search: manual aliases + local fuzzy index (instant) and WoRMS / Wikidata / he.wikipedia (remote).
import { settle, pool } from './http.js';
import { worms, sizeClass } from './worms.js';
import { searchHebrew, searchEnglishEntities } from './wiki.js';
import { ALIASES } from './aliases.js';
import RESOLVED from './aliases-resolved.json';
import { norm, fuzzyScore, hasHebrew } from './text.js';
import { upsertRecord, rowToCard, speciesRow, getCard, getDistributions, ensureRecord, allNames, addNames } from './species.js';

const RANKS = new Set(['Species', 'Subspecies', 'Genus', 'Family', 'Forma', 'Variety']);
const aliasIndex = ALIASES.map((a) => ({ ...a, normTerms: a.terms.map(norm) }));
const aliasResolved = new Map(); // scientific name -> accepted AphiaID

async function resolveName(name) {
  if (aliasResolved.has(name)) return aliasResolved.get(name);
  // Pre-resolved at build time (scripts/build-aliases.mjs): no network round-trip for nickname hits.
  const pre = RESOLVED[name];
  if (pre?.AphiaID) {
    if (!(await speciesRow(pre.AphiaID))) await upsertRecord(pre);
    aliasResolved.set(name, pre.AphiaID);
    return pre.AphiaID;
  }
  // Already known locally? (works offline)
  const local = (await allNames()).find((r) => r.lang === 'sci' && r.norm === norm(name));
  if (local) { aliasResolved.set(name, local.aphia_id); return local.aphia_id; }
  const recs = await settle(worms.byName(name, false), []);
  const r = recs.find((x) => x.status === 'accepted') || recs[0];
  let id = null;
  if (r) {
    id = r.valid_AphiaID || r.AphiaID;
    if (id === r.AphiaID) await upsertRecord(r);
    else id = await ensureRecord(id).catch(() => null);
  }
  if (id) aliasResolved.set(name, id);
  return id;
}

function add(map, id, score, matched, lang) {
  if (!id) return;
  const cur = map.get(id);
  if (!cur || score > cur.score) map.set(id, { id, score, matched, lang });
}

/** Instant tier: aliases + everything already in the local name index. */
export async function searchLocal(qRaw, map = new Map()) {
  const q = norm(qRaw);
  if (q.length < 2) return map;
  for (const a of aliasIndex) {
    let best = 0, term = null;
    a.normTerms.forEach((t, i) => { const s = fuzzyScore(q, t); if (s > best) { best = s; term = a.terms[i]; } });
    if (best >= 0.7) {
      const ids = await Promise.all(a.names.map(resolveName));
      ids.forEach((id, i) => add(map, id, best * 1.04 - i * 0.004, term, hasHebrew(term) ? 'he' : 'alias'));
    }
  }
  for (const r of await allNames()) {
    const s = fuzzyScore(q, r.norm);
    if (s >= 0.55) add(map, r.aphia_id, s * (r.lang === 'syn' ? 0.9 : 1), r.name, r.lang);
  }
  return map;
}

async function takeRecords(map, recs, q, base, lang) {
  for (const r of recs) {
    if (!r || !RANKS.has(r.rank)) continue;
    const accepted = r.status === 'accepted' || !r.valid_AphiaID || r.valid_AphiaID === r.AphiaID;
    if (accepted) await upsertRecord(r);
    else await addNames(r.valid_AphiaID, [r.scientificname], 'syn');
    const id = accepted ? r.AphiaID : r.valid_AphiaID;
    const s = base ?? Math.max(0.5, fuzzyScore(q, norm(r.scientificname)));
    add(map, id, s * (r.rank === 'Species' ? 1 : 0.9), r.scientificname, lang);
  }
}

/** Remote tier. Partial results survive individual upstream failures. */
export async function searchRemote(qRaw, map = new Map()) {
  const q = norm(qRaw);
  const errors = [];
  const guard = (p, label) => p.catch((e) => { errors.push(`${label}: ${e.message}`); return []; });
  if (hasHebrew(qRaw)) {
    const hits = await guard(searchHebrew(qRaw.trim()), 'Hebrew Wikipedia');
    for (const h of hits) add(map, h.aphiaId, 0.86 - h.rank * 0.03, h.title, 'he');
  } else {
    const term = qRaw.trim();
    const [byName, byVern, wd] = await Promise.all([
      guard(worms.byName(term), 'WoRMS'),
      term.length >= 3 ? guard(worms.byVernacular(term), 'WoRMS vernacular') : [],
      term.length >= 3 ? guard(searchEnglishEntities(term), 'Wikidata') : [],
    ]);
    await takeRecords(map, byName, q, null, 'sci');
    await takeRecords(map, byVern, q, 0.8, 'en');
    for (const h of wd) add(map, h.aphiaId, 0.74 - h.rank * 0.02, null, 'en');
    // Typo-tolerant scientific match (TAXAMATCH) when nothing obvious came back.
    if (byName.length === 0 && /^[a-z]+ ?[a-z]*$/i.test(term) && term.length >= 5) {
      const [m] = await guard(worms.matchNames([term]), 'WoRMS TAXAMATCH');
      await takeRecords(map, m || [], q, 0.72, 'sci');
    }
  }
  return { map, errors };
}

/** Ensure local rows exist for ids coming from Wikidata (no WoRMS record fetched yet). */
async function hydrate(ids) {
  const missing = [];
  for (const id of ids) if (!(await speciesRow(id))) missing.push(id);
  if (!missing.length) return;
  const recs = await settle(worms.records(missing), []);
  for (const r of recs) if (r && (r.status === 'accepted' || r.valid_AphiaID === r.AphiaID)) await upsertRecord(r);
  const still = [];
  for (const id of missing) if (!(await speciesRow(id))) still.push(id);
  await pool(still, 3, (id) => ensureRecord(id));
}

async function toResults(map, { group, limit }) {
  const hits = [...map.values()].sort((a, b) => b.score - a.score).slice(0, 60);
  const results = [];
  const seen = new Set();
  for (const h of hits) {
    const row = await speciesRow(h.id);
    if (!row || seen.has(row.aphia_id)) continue;
    seen.add(row.aphia_id);
    const rec = row.record || {};
    if (!(rec.isMarine === 1 || rec.isBrackish === 1 || (rec.isMarine == null && rec.isBrackish == null))) continue;
    if (group && row.group_key !== group) continue;
    results.push({ ...rowToCard(row), score: h.score, matched: h.matched, matchedLang: h.lang });
  }
  return results.slice(0, limit);
}

/**
 * Streaming search: calls `onUpdate(results, { done, errors })` after the local tier and again as each remote
 * source answers, so the list (and its photos) appear without waiting for the slowest source.
 * Measured: WoRMS' common-name search alone can take 5 s; the other sources usually answer in < 1 s.
 * @param {string} qRaw
 * @param {{ group?: string, limit?: number }} opts
 * @param {(results: any[], state: { done: boolean, errors: string[] }) => void} onUpdate
 */
export async function searchStream(qRaw, { group, limit = 24 } = {}, onUpdate) {
  const map = await searchLocal(qRaw);
  const errors = [];
  let last = '';
  const emit = async (done = false) => {
    const results = await toResults(map, { group, limit });
    const sig = results.map((r) => `${r.aphiaId}:${r.score.toFixed(3)}`).join(',');
    if (sig !== last || done) { last = sig; onUpdate(results, { done, errors }); }
  };
  await emit();
  const q = norm(qRaw);
  const term = qRaw.trim();
  const guard = (p, label) => p.catch((e) => { errors.push(`${label}: ${e.message}`); return []; });
  const step = (p) => p.then(() => emit());
  if (hasHebrew(qRaw)) {
    await step(guard(searchHebrew(term), 'Hebrew Wikipedia').then(async (hits) => {
      await hydrate(hits.map((h) => h.aphiaId));
      for (const h of hits) add(map, h.aphiaId, 0.86 - h.rank * 0.03, h.title, 'he');
    }));
  } else {
    await Promise.all([
      step(guard(worms.byName(term), 'WoRMS').then(async (byName) => {
        await takeRecords(map, byName, q, null, 'sci');
        // typo-tolerant scientific match (TAXAMATCH) only when nothing obvious came back
        if (byName.length === 0 && /^[a-z]+ ?[a-z]*$/i.test(term) && term.length >= 5) {
          const [mm] = await guard(worms.matchNames([term]), 'WoRMS TAXAMATCH');
          await takeRecords(map, mm || [], q, 0.72, 'sci');
        }
      })),
      term.length >= 3 ? step(guard(worms.byVernacular(term), 'WoRMS vernacular').then((byVern) => takeRecords(map, byVern, q, 0.8, 'en'))) : null,
      term.length >= 3 ? step(guard(searchEnglishEntities(term), 'Wikidata').then(async (wd) => {
        await hydrate(wd.map((h) => h.aphiaId));
        for (const h of wd) add(map, h.aphiaId, 0.74 - h.rank * 0.02, null, 'en');
      })) : null,
    ]);
  }
  await emit(true);
}

export async function search(qRaw, { remote = true, group, size, region, limit = 24 } = {}) {
  const map = await searchLocal(qRaw);
  let errors = [];
  if (remote) ({ errors } = await searchRemote(qRaw, map));
  const hits = [...map.values()].sort((a, b) => b.score - a.score).slice(0, 60);
  if (remote) await hydrate(hits.map((h) => h.id));
  let results = [];
  const seen = new Set();
  for (const h of hits) {
    const row = await speciesRow(h.id);
    if (!row || seen.has(row.aphia_id)) continue;
    seen.add(row.aphia_id);
    // keep marine/brackish taxa only
    const rec = row.record || {};
    if (!(rec.isMarine === 1 || rec.isBrackish === 1 || (rec.isMarine == null && rec.isBrackish == null))) continue;
    results.push({ ...rowToCard(row), score: h.score, matched: h.matched, matchedLang: h.lang });
  }

  if (group) results = results.filter((r) => r.group === group);
  // Size / region need verified data; species lacking it are excluded rather than guessed.
  if (size) {
    const top = results.slice(0, 30);
    const cards = await pool(top, 4, (r) => (r.enriched ? r : getCard(r.aphiaId)));
    results = top.map((r, i) => cards[i] && { ...r, ...cards[i] }).filter((c) => c && sizeClass(c.sizeCm) === size);
  }
  if (region) {
    const rq = norm(region);
    const top = results.slice(0, 30);
    const dists = await pool(top, 4, (r) => getDistributions(r.aphiaId));
    results = top.filter((r, i) => (dists[i] || []).some((d) => norm(`${d.locality} ${d.higherGeography || ''}`).includes(rq)));
  }
  return { results: results.slice(0, limit), errors };
}
