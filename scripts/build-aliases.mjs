// Pre-resolves every scientific name in client/src/core/aliases.js against WoRMS and writes
// client/src/core/aliases-resolved.json, so nickname searches ("Nemo", "דג ליצן") show results instantly
// without first asking WoRMS. Re-run after editing aliases.js:  npm run aliases
import fs from 'node:fs';
import { ALIASES } from '../client/src/core/aliases.js';

const OUT = new URL('../client/src/core/aliases-resolved.json', import.meta.url);
const KEEP = ['AphiaID', 'scientificname', 'authority', 'status', 'rank', 'valid_AphiaID', 'valid_name', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'isMarine', 'isBrackish', 'isFreshwater', 'isTerrestrial', 'isExtinct'];
const pick = (r) => Object.fromEntries(KEEP.map((k) => [k, r[k] ?? null]));
const get = async (u) => { const r = await fetch(u, { headers: { Accept: 'application/json' } }); return r.status === 200 ? r.json() : null; };

const names = [...new Set(ALIASES.flatMap((a) => a.names))];
const out = {};
for (const name of names) {
  const recs = (await get(`https://www.marinespecies.org/rest/AphiaRecordsByName/${encodeURIComponent(name)}?like=false&marine_only=true`)) || [];
  let r = recs.find((x) => x.status === 'accepted') || recs[0];
  if (r && r.valid_AphiaID && r.valid_AphiaID !== r.AphiaID) r = await get(`https://www.marinespecies.org/rest/AphiaRecordByAphiaID/${r.valid_AphiaID}`);
  if (r) out[name] = pick(r); else console.warn(`  not found in WoRMS: ${name}`);
  await new Promise((res) => setTimeout(res, 250));
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`resolved ${Object.keys(out).length}/${names.length} alias names → ${OUT.pathname}`);
