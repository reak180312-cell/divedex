# DiveDex

A scuba dive logbook and marine-life collection. You log each dive in a paper-style journal, and every species you record is added to your collection. All species data comes from real sources. There is no AI or image recognition: you pick the species yourself.

**No server.** DiveDex is a static web app. Everything runs in your browser:

- **Your data** (profile, dives, photos, species cache) is stored on your device in IndexedDB.
- **Species data** is fetched directly from public APIs.
- **The dive-site map** uses a bundled OpenStreetMap snapshot.

It can be installed to your phone's home screen and works offline.

**Live app:** https://reak180312-cell.github.io/divedex/

## Your data

- Data lives only in the browser where you created it. A phone and a computer each have their own logbook.
- **Profile → Export backup** saves one JSON file with all dives and photos. **Import backup** restores it on any device. The first-run screen also accepts a backup.
- Export now and then: clearing the browser's site data erases the logbook. The app asks the browser for persistent storage to reduce that risk.

## Develop

Requires Node.js 22.13+.

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # static files in dist/ (deployable to any static host, any sub-path)
npm run sites     # refresh client/public/sites.json from OpenStreetMap (Overpass)
```

Every push to `main` builds the app and publishes it to GitHub Pages (`.github/workflows/pages.yml`).

## Where the data comes from

| Data | Source | Notes |
| --- | --- | --- |
| Names, taxonomy, synonyms, traits, distribution | [WoRMS REST](https://www.marinespecies.org/rest/) | Fuzzy scientific matching uses WoRMS TAXAMATCH |
| Hebrew & extra English names, summaries | Wikidata (P850 = WoRMS ID), Hebrew/English Wikipedia | Wikipedia text is CC BY-SA and attributed on screen |
| Photos | Wikimedia Commons and GBIF | **Only images whose own license is Public Domain or CC0** |
| Rarity | GBIF occurrence counts | ≥100k Common · ≥10k Uncommon · ≥1k Rare · ≥100 Very rare · <100 Exceptional. Score is `10 − 1.6·log10(n+1)` |
| Size class | WoRMS "Body size" trait for that exact taxon | Never guessed |
| Alerts (invasive / IUCN / CITES) | WoRMS distribution & attribute records | Shown only when explicitly recorded |
| Dive sites | OpenStreetMap `sport=scuba_diving` (bundled snapshot) | ODbL, attributed |
| Place names | Nominatim (OpenStreetMap) | |
| Satellite imagery | Esri World Imagery | Attributed. Check Esri's terms before commercial use |

### Image license verification

`client/src/core/images.js` checks **each file individually**:

- **Commons:** reads the file's `extmetadata`. It accepts only `cc0` or `pd*`, and rejects anything mentioning BY/SA/NC/ND/GFDL/attribution.
- **GBIF:** every media item's own `license` must be a CC0 or Public Domain Mark URL.

Real photographs rank above historical drawings. Credits appear on every photo.

## Search

`client/src/core/search.js` merges:

1. **Manual aliases** in `client/src/core/aliases.js`, matched with typo tolerance ("Nemo", "דג ליצן" → clownfish).
2. **On-device fuzzy index** of every name seen so far. This also works offline.
3. **WoRMS** by scientific name and by vernacular name, plus TAXAMATCH for misspellings.
4. **Wikidata** for English common names, and **Hebrew Wikipedia** for Hebrew queries.

Filters: animal group (from WoRMS taxonomy), size class and region (WoRMS distribution). Species without verified size or region data are left out of those filters.

## Layout

```
client/src/core/   the "backend" that runs in the browser: storage (IndexedDB), API clients, search, species assembly
client/src/        React UI: journal, collection, species pages, log form, maps
client/public/     static assets incl. sites.json (dive-site snapshot)
scripts/           build-sites.mjs (regenerates the dive-site snapshot)
```
