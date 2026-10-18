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
- **Upgrades never rewrite your data:** database migrations only add new tables (v2 added `manual`, for species added without a dive). New dive fields (drafts, highlight, duration, special flags) are optional, so older records work unchanged.
- **Unsaved work is kept:** what you type in the dive form is kept on the device until you save, so leaving the screen by accident loses nothing. Incomplete dives can be saved as **drafts**.

## Develop

Requires Node.js 22.13+.

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # static files in dist/ (deployable to any static host, any sub-path)
npm run sites     # refresh client/public/sites.json from OpenStreetMap (Overpass)
```

`npm run deploy` builds the app and publishes `dist/` to the `gh-pages` branch, which GitHub Pages serves.

## Where the data comes from

| Data | Source | Notes |
| --- | --- | --- |
| Names, taxonomy, synonyms, traits, distribution | [WoRMS REST](https://www.marinespecies.org/rest/) | Fuzzy scientific matching uses WoRMS TAXAMATCH |
| Hebrew & extra English names, summaries | Wikidata (P850 = WoRMS ID), Hebrew/English Wikipedia | Wikipedia text is CC BY-SA and attributed on screen |
| Photos | Wikimedia Commons and GBIF | **Only images whose own license is Public Domain or CC0** |
| Local frequency | GBIF occurrence records near the sighting | See **Local frequency & special encounters** below |
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

## Local frequency & special encounters

Two separate ideas, never mixed together:

- **Local frequency** (`client/src/core/rarity.js`) is computed from GBIF records within 100 km of where you saw the species.
  - **How:** it ranks the species among all species of its group recorded there. The group is the GBIF class, or the order when GBIF has no class or the class includes land animals.
  - **Bands:** top quarter = *frequently recorded*, middle half = *occasionally*, bottom quarter = *rarely recorded*, or *no nearby records*.
  - **Why ranking:** comparing against neighbours cancels out how heavily an area is sampled.
  - **Not rated:** areas with fewer than 300 group records or 8 species.
  - **Caveat:** it describes recording frequency, not true abundance, and never produces a numeric score.
  - **Cost:** one cached request per group and area.
- **Special encounter** is the diver's own star on a sighting.
  - **Pre-starred:** species from groups many divers treat as highlights (mantas, sharks, turtles, cetaceans, seahorses, … — `core/highlights.js`) start starred when added.
  - **Your choice:** you can unstar them. Nothing claims they are rare.
- **Dive Highlight** on a journal page is the species *you* pick when logging the dive.
  - **No pick:** the page uses one of your dive photos, or a clean layout. Nothing is inferred automatically.

## Photos: how they load fast

Measured on a cold start with 23 species, simulated slow 3G and a 4× slower CPU (`npm run build` + the scripts used during development):

| | Before | After |
| --- | --- | --- |
| First photo visible | 36 s | 1.1 s |
| All 23 photos | ~37 s, 1 missing | 5.7 s, none missing |
| Rate-limited / failed requests | 37 | 0 |
| Second visit (first screen) | — | 0.6 s, no API requests |

What changed:

- **Parallel lookups:** each species' verified photo list (`getPhotos`) is its own small lookup (Commons first, GBIF only when needed), separate from names and traits.
- **Per-card loading:** cards load independently, visible ones first, with request caps per host. GBIF requests are spaced ≥400 ms apart, because it rejects bursts with HTTP 429, and `Retry-After` is respected.
- **Sized images:** thumbnails use standard, edge-cached Wikimedia sizes (WebP) and iNaturalist's small renditions. Large images load only on the species page, progressively.
- **Fallback:** a photo that fails is remembered and replaced by the next verified photo of the *same* species, never another species.
- **Caching:** photo URLs and metadata are cached on the device (IndexedDB, 14–30 days), and image files by the service worker.

## Search

`client/src/core/search.js` merges:

1. **Manual aliases** in `client/src/core/aliases.js`, matched with typo tolerance ("Nemo", "דג ליצן" → clownfish).
2. **On-device fuzzy index** of every name seen so far. This also works offline.
3. **WoRMS** by scientific name and by vernacular name, plus TAXAMATCH for misspellings.
4. **Wikidata** for English common names, and **Hebrew Wikipedia** for Hebrew queries.

Filters: animal group (from WoRMS taxonomy), size class and region (WoRMS distribution). Species without verified size or region data are left out of those filters.
Completed searches are reused for 10 minutes; results show names immediately and photos as they arrive.

## Layout

```
client/src/core/   the "backend" that runs in the browser: storage (IndexedDB), API clients, search, species assembly
client/src/        React UI: journal, collection, species pages, log form, maps
client/public/     static assets incl. sites.json (dive-site snapshot)
scripts/           build-sites.mjs (regenerates the dive-site snapshot)
```
