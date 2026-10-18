// On-device storage (IndexedDB). Everything — profile, dives, photos, species cache — lives in this browser.
//
// Migrations only ever *add* stores/indexes; existing records are never rewritten or deleted.
//   v1: meta, cache, species, names, dives, photos
//   v2: manual (species added to the collection without a dive)
// New dive fields (draft, highlight, duration, sightings[].special) are optional and need no migration:
// older records simply don't have them.
import { openDB } from 'idb';

export const dbp = openDB('divedex', 2, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      db.createObjectStore('meta');                                   // key -> value (profile…)
      db.createObjectStore('cache');                                  // url -> { v, exp } API response cache
      db.createObjectStore('species', { keyPath: 'aphia_id' });       // species rows (record, card fields, photos, profile)
      db.createObjectStore('names', { keyPath: ['aphia_id', 'norm', 'lang'] }); // local search index
      db.createObjectStore('dives', { keyPath: 'id', autoIncrement: true });
      const p = db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
      p.createIndex('dive', 'dive_id');
      p.createIndex('aphia', 'aphia_id');
    }
    if (oldVersion < 2 && !db.objectStoreNames.contains('manual')) {
      db.createObjectStore('manual', { keyPath: 'id', autoIncrement: true });
    }
  },
  blocked() {
    // another tab still has the old version open
    console.warn('DiveDex: close other DiveDex tabs to finish the update');
  },
});

/** Ask the browser not to evict our data under storage pressure (important on phones). */
export async function persistStorage() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { /* ignore */ }
}
