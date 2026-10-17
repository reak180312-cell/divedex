// Builds client/public/sites.json — every OpenStreetMap feature tagged sport=scuba_diving (dive centres removed).
// Usage:  node scripts/build-sites.mjs            (download fresh data from Overpass)
//         node scripts/build-sites.mjs <db.sqlite> (reuse sites from an old DiveDex server database)
import fs from 'node:fs';

const OUT = new URL('../client/public/sites.json', import.meta.url);
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const QUERY = '[out:json][timeout:180];(node["sport"="scuba_diving"];way["sport"="scuba_diving"];relation["sport"="scuba_diving"];);out center tags;';

const isShop = (t) => t.shop || /dive_cent(re|er)/.test(t.amenity || '') || t['scuba_diving:divespot'] === 'no' || t.office || t.craft
  || t.building || t.club || t.leisure === 'sports_centre' || /^(hotel|guest_house|hostel)$/.test(t.tourism || '');
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

async function fromOverpass() {
  for (const url of ENDPOINTS) {
    try {
      console.log(`fetching ${url} …`);
      const res = await fetch(url, { method: 'POST', body: `data=${encodeURIComponent(QUERY)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'DiveDex site snapshot builder' }, signal: AbortSignal.timeout(240000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      return j.elements.map((e) => ({ id: `osm:${e.type}/${e.id}`, lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon, tags: e.tags || {} }));
    } catch (e) { console.warn(`  failed: ${e.message}`); }
  }
  throw new Error('All Overpass mirrors failed — try again later.');
}

async function fromDb(file) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(file, { readOnly: true });
  return db.prepare('SELECT id, lat, lon, tags FROM dive_sites').all().map((r) => ({ id: r.id, lat: r.lat, lon: r.lon, tags: JSON.parse(r.tags) }));
}

const raw = process.argv[2] ? await fromDb(process.argv[2]) : await fromOverpass();
const sites = [], details = {};
for (const s of raw) {
  const t = s.tags;
  if (s.lat == null || s.lon == null || isShop(t)) continue;
  const name = t['name:en'] || t.name || t['scuba_diving:name'] || null;
  const type = t['scuba_diving:type'] || (t.historic === 'wreck' || t['seamark:type'] === 'wreck' ? 'wreck' : null);
  sites.push([s.id, name, +s.lat.toFixed(5), +s.lon.toFixed(5), num(t['scuba_diving:maxdepth'] ?? t['scuba_diving:depth'] ?? t.depth), type]);
  const d = {
    entry: t['scuba_diving:entry'] || (t['scuba_diving:entry:boat'] === 'yes' ? 'boat' : t['scuba_diving:entry:shore'] === 'yes' ? 'shore' : undefined),
    difficulty: t['scuba_diving:difficulty'], description: t.description || t['description:en'],
    website: t.website || t.url, place: t.is_in || t['addr:city'],
  };
  Object.keys(d).forEach((k) => d[k] === undefined && delete d[k]);
  if (Object.keys(d).length) details[s.id] = d;
}
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), attribution: '© OpenStreetMap contributors (ODbL)', sites, details }));
console.log(`wrote ${sites.length} sites (${Object.keys(details).length} with details) → ${OUT.pathname}`);
