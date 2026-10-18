// Species photographs from Wikimedia Commons and GBIF.
// Policy: an image is accepted ONLY if its own (per-file / per-media-item) license metadata
// explicitly says Public Domain or CC0. Dataset-level licenses are never trusted on their own.
import { getJSON, settle } from './http.js';

const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const DAY = 86400;
const enc = encodeURIComponent;
const IMG_MIME = /^image\/(jpeg|png|webp)$/;
// Historical plates & drawings are often PD; keep them, but rank behind real photographs.
const ILLUSTRATION = /illustrat|drawing|plate|tafel|planche|lithograph|engrav|chromolith|\bfig(ure)?\b|\bpl\.|watercolou?r|painting|sketch|diagram|stamp|skeleton|specimen|museum|\bmap\b|distribution|biodiversity heritage library|\bbhl\b/i;

const stripHtml = (s) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

/** Classify a Commons file's extmetadata. Returns 'PD' | 'CC0' | null (rejected). */
export function commonsLicense(meta) {
  if (!meta) return null;
  const code = String(meta.License?.value ?? '').toLowerCase().trim();
  const short = String(meta.LicenseShortName?.value ?? '').toLowerCase().trim();
  const usage = String(meta.UsageTerms?.value ?? '').toLowerCase();
  if (String(meta.NonFree?.value ?? '').toLowerCase() === 'true') return null;
  // Any attribution / share-alike / non-commercial marker -> reject outright.
  const tokens = `${code} ${short}`;
  if (/(^|[\s-])(by|sa|nc|nd)([\s-]|$)/.test(tokens) || /gfdl|attribution|copyrighted|\bfal\b|art libre/.test(`${tokens} ${usage}`)) return null;
  if (code === 'cc0' || /^cc0\b/.test(short) || /cc0/.test(usage)) return 'CC0';
  if ((code === 'pd' || code.startsWith('pd-') || code === 'public domain') && /public domain|^pd\b/.test(`${short} ${usage}`)) return 'PD';
  return null;
}

/** Classify a GBIF media item's license URL/string. */
export function gbifLicense(lic) {
  const l = String(lic ?? '').toLowerCase();
  if (/publicdomain\/zero|\bcc0\b|cc0_1_0/.test(l)) return 'CC0';
  if (/publicdomain\/mark|public domain/.test(l)) return 'PD';
  return null;
}

async function commonsInfo(titles) {
  if (!titles.length) return [];
  const t = titles.slice(0, 50).map((x) => (x.startsWith('File:') ? x : `File:${x}`)).join('|');
  const r = await getJSON(`${COMMONS}?action=query&format=json&origin=*&titles=${enc(t)}&prop=imageinfo&iiprop=url|extmetadata|mime|size&iiurlwidth=1280&iiextmetadatafilter=License|LicenseShortName|UsageTerms|Artist|Credit|NonFree|ImageDescription`, { ttl: 14 * DAY });
  return Object.values(r?.query?.pages || {});
}

function commonsToImage(page) {
  const ii = page.imageinfo?.[0];
  if (!ii || !IMG_MIME.test(ii.mime || '')) return null;
  const license = commonsLicense(ii.extmetadata);
  if (!license) return null;
  if ((ii.width || 0) < 400) return null; // skip icons / tiny scans
  const m = ii.extmetadata;
  const illustration = ii.mime === 'image/png' || ILLUSTRATION.test(`${page.title} ${stripHtml(m?.ImageDescription?.value)} ${stripHtml(m?.Credit?.value)}`);
  return {
    illustration,
    id: `commons:${page.pageid}`,
    source: 'Wikimedia Commons',
    url: ii.thumburl || ii.url,
    original: ii.url,
    width: ii.thumbwidth || ii.width,
    fullWidth: ii.width || null,
    height: ii.thumbheight || ii.height,
    license,
    licenseLabel: stripHtml(m?.LicenseShortName?.value) || (license === 'CC0' ? 'CC0' : 'Public domain'),
    author: stripHtml(m?.Artist?.value) || null,
    credit: stripHtml(m?.Credit?.value) || null,
    title: page.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
    sourceUrl: ii.descriptionurl,
  };
}

export async function commonsImages(scientificName, p18, limit = 10, failed) {
  const titles = [];
  if (p18) titles.push(p18);
  const cat = await settle(getJSON(`${COMMONS}?action=query&format=json&origin=*&list=categorymembers&cmtitle=${enc(`Category:${scientificName}`)}&cmtype=file&cmlimit=40`, { ttl: 14 * DAY }), null, failed);
  for (const m of cat?.query?.categorymembers || []) titles.push(m.title);
  if (titles.length < 5) {
    const s = await settle(getJSON(`${COMMONS}?action=query&format=json&origin=*&list=search&srnamespace=6&srlimit=20&srsearch=${enc(`"${scientificName}" filetype:bitmap`)}`, { ttl: 14 * DAY }), null, failed);
    for (const m of s?.query?.search || []) titles.push(m.title);
  }
  const uniq = [...new Set(titles.map((t) => (t.startsWith('File:') ? t : `File:${t}`)))];
  const pages = await settle(commonsInfo(uniq), [], failed);
  const byTitle = new Map(pages.map((p) => [p.title, p]));
  const out = [];
  for (const t of uniq) {
    const p = byTitle.get(t.replace(/_/g, ' '));
    const img = p && commonsToImage(p);
    if (img) out.push(img);
  }
  // stable sort: photographs first
  return [...out.filter((i) => !i.illustration), ...out.filter((i) => i.illustration)].slice(0, limit);
}

const IINFO = 'prop=imageinfo&iiprop=url|extmetadata|mime|size&iiurlwidth=330&iiextmetadatafilter=License|LicenseShortName|UsageTerms|Artist|Credit|NonFree|ImageDescription';

/**
 * Fast path for collection/search thumbnails: one Commons request (category members + per-file license
 * metadata in a single generator query), plus a search fallback only when the category is thin.
 */
export async function commonsPhotoSet(scientificName, limit = 6, { fallback = true } = {}) {
  const cat = await getJSON(`${COMMONS}?action=query&format=json&origin=*&generator=categorymembers&gcmtitle=${enc(`Category:${scientificName}`)}&gcmtype=file&gcmlimit=30&${IINFO}`, { ttl: 14 * DAY, timeout: 10000 });
  let pages = Object.values(cat?.query?.pages || {});
  if (fallback && pages.filter((p) => commonsToImage(p)).length < 2) pages = [...pages, ...(await commonsSearchPages(scientificName))];
  return toPhotoSet(pages, limit);
}

async function commonsSearchPages(scientificName) {
  const s = await getJSON(`${COMMONS}?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=15&gsrsearch=${enc(`"${scientificName}" filetype:bitmap`)}&${IINFO}`, { ttl: 14 * DAY, timeout: 10000 });
  return Object.values(s?.query?.pages || {});
}

/** Commons keyword search (used when a species' category has too few usable photos). */
export async function commonsSearchSet(scientificName, limit = 6) {
  return toPhotoSet(await commonsSearchPages(scientificName), limit);
}

function toPhotoSet(pages, limit) {
  const seen = new Set();
  const out = pages.map(commonsToImage).filter((i) => i && !seen.has(i.id) && seen.add(i.id));
  return [...out.filter((i) => !i.illustration), ...out.filter((i) => i.illustration)].slice(0, limit);
}

export async function gbifMatch(scientificName) {
  const m = await getJSON(`https://api.gbif.org/v1/species/match?name=${enc(scientificName)}&strict=true`, { ttl: 30 * DAY });
  if (!m?.usageKey || m.matchType === 'NONE' || m.matchType === 'HIGHERRANK') return null;
  return m.acceptedUsageKey || m.usageKey;
}

export async function gbifCount(key) {
  const r = await getJSON(`https://api.gbif.org/v1/occurrence/search?taxonKey=${key}&limit=0`, { ttl: 30 * DAY });
  return typeof r?.count === 'number' ? r.count : null;
}

const inatSize = (u, size) => u.replace(/\/(original|large|medium|small|square)\.(jpe?g|png)/i, `/${size}.$2`);

/**
 * CC0 photos from GBIF occurrences. Searching by scientific name lets GBIF resolve its own taxonomy, so no
 * separate species-match request is needed (GBIF throttles phones that fire many requests in a burst).
 */
export async function gbifImages(scientificName, limit = 10) {
  const r = await getJSON(`https://api.gbif.org/v1/occurrence/search?scientificName=${enc(scientificName)}&mediaType=StillImage&license=CC0_1_0&limit=${limit <= 6 ? 8 : 24}`, { ttl: 14 * DAY, timeout: 15000 });
  const out = [];
  const seen = new Set();
  for (const occ of r?.results || []) {
    for (const m of occ.media || []) {
      if (m.type && m.type !== 'StillImage') continue;
      if (!m.identifier || seen.has(m.identifier)) continue;
      // http:// images are blocked on an https page (mixed content) — they would never load.
      if (!/^https:\/\//i.test(m.identifier)) continue;
      const license = gbifLicense(m.license); // per-image license — required
      if (!license) continue;
      if (m.format && !IMG_MIME.test(m.format)) continue;
      seen.add(m.identifier);
      const isInat = /inaturalist/.test(m.identifier);
      out.push({
        id: `gbif:${occ.key}:${out.length}`,
        source: 'GBIF',
        url: isInat ? inatSize(m.identifier, 'large') : m.identifier,
        original: m.identifier,
        width: null,
        height: null,
        license,
        licenseLabel: license === 'CC0' ? 'CC0 1.0' : 'Public Domain Mark',
        author: m.creator || m.rightsHolder || occ.recordedBy || null,
        credit: [occ.datasetName || occ.institutionCode, occ.publisher].filter(Boolean).join(' · ') || null,
        title: [occ.locality, occ.country, occ.eventDate?.slice(0, 10)].filter(Boolean).join(', ') || null,
        sourceUrl: `https://www.gbif.org/occurrence/${occ.key}`,
      });
      break; // one per occurrence keeps variety
    }
    if (out.length >= limit) break;
  }
  return out;
}
