// Wikidata / Wikipedia helpers: cross-links WoRMS AphiaIDs (Wikidata P850) to names in English & Hebrew.
import { getJSON } from './http.js';
import { hasHebrew } from './text.js';

const WD = 'https://www.wikidata.org/w/api.php';
const DAY = 86400;
const enc = encodeURIComponent;
const stripParen = (s) => s.replace(/\s*\(.*\)$/, '');

/** Find the Wikidata entity for a WoRMS AphiaID. */
export async function entityForAphia(aphiaId) {
  const s = await getJSON(`${WD}?action=query&list=search&srsearch=haswbstatement:P850=${aphiaId}&format=json&origin=*&srlimit=1`, { ttl: 30 * DAY });
  const q = s?.query?.search?.[0]?.title;
  if (!q) return null;
  const e = await getJSON(`${WD}?action=wbgetentities&ids=${q}&props=labels|aliases|sitelinks|claims&languages=en|he&sitefilter=enwiki|hewiki&format=json&origin=*`, { ttl: 30 * DAY });
  return e?.entities?.[q] ?? null;
}

export function namesFromEntity(e, scientificName) {
  if (!e) return { qid: null, he: null, enWiki: null, heWiki: null, enAliases: [], heAliases: [], p18: null };
  const sci = (scientificName || '').toLowerCase();
  const heLabel = e.labels?.he?.value;
  const heWiki = e.sitelinks?.hewiki?.title ?? null;
  const he = [heLabel, heWiki].find((x) => x && hasHebrew(x)) ?? null;
  const enAliases = [e.labels?.en?.value, ...(e.aliases?.en || []).map((a) => a.value)].filter((x) => x && x.toLowerCase() !== sci);
  const heAliases = [heLabel, heWiki, ...(e.aliases?.he || []).map((a) => a.value)].filter((x) => x && hasHebrew(x)).map(stripParen);
  const p18 = e.claims?.P18?.[0]?.mainsnak?.datavalue?.value ?? null;
  return { qid: e.id, he: he ? stripParen(he) : null, enWiki: e.sitelinks?.enwiki?.title ?? null, heWiki, enAliases, heAliases: [...new Set(heAliases)], p18 };
}

/** Hebrew free-text search on he.wikipedia -> Wikidata items carrying a WoRMS ID. */
export async function searchHebrew(q) {
  const s = await getJSON(`https://he.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${enc(q)}&gsrlimit=12&prop=pageprops&ppprop=wikibase_item`, { ttl: 7 * DAY, timeout: 8000 });
  const pages = Object.values(s?.query?.pages || {}).sort((a, b) => a.index - b.index);
  const items = pages.map((p) => ({ qid: p.pageprops?.wikibase_item, title: stripParen(p.title) })).filter((p) => p.qid);
  if (!items.length) return [];
  const e = await getJSON(`${WD}?action=wbgetentities&ids=${items.map((i) => i.qid).join('|')}&props=claims&format=json&origin=*`, { ttl: 30 * DAY });
  return items
    .map((it, rank) => ({ aphiaId: Number(e?.entities?.[it.qid]?.claims?.P850?.[0]?.mainsnak?.datavalue?.value), title: it.title, rank }))
    .filter((x) => x.aphiaId);
}

/** English common-name lookup via Wikidata labels/aliases (covers names WoRMS vernaculars miss). */
export async function searchEnglishEntities(q) {
  const s = await getJSON(`${WD}?action=query&list=search&srsearch=${enc(q)}%20haswbstatement:P850&srlimit=10&format=json&origin=*`, { ttl: 7 * DAY, timeout: 8000 });
  const qids = (s?.query?.search || []).map((x) => x.title);
  if (!qids.length) return [];
  const e = await getJSON(`${WD}?action=wbgetentities&ids=${qids.join('|')}&props=claims&format=json&origin=*`, { ttl: 30 * DAY });
  return qids
    .map((qid, rank) => ({ aphiaId: Number(e?.entities?.[qid]?.claims?.P850?.[0]?.mainsnak?.datavalue?.value), rank }))
    .filter((x) => x.aphiaId);
}

export async function summary(lang, title) {
  if (!title) return null;
  const s = await getJSON(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${enc(title.replace(/ /g, '_'))}`, { ttl: 14 * DAY });
  if (!s?.extract || s.type === 'disambiguation') return null;
  return {
    lang, title: s.title, extract: s.extract, url: s.content_urls?.desktop?.page,
    license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  };
}
