// On-device storage (IndexedDB). Everything — profile, dives, photos, species cache — lives in this browser.
import { openDB } from 'idb';

export const dbp = openDB('divedex', 1, {
  upgrade(db) {
    db.createObjectStore('meta');                                   // key -> value (profile, sites timestamp…)
    db.createObjectStore('cache');                                  // url -> { v, exp } API response cache
    db.createObjectStore('species', { keyPath: 'aphia_id' });       // species rows (record, card fields, profile)
    db.createObjectStore('names', { keyPath: ['aphia_id', 'norm', 'lang'] }); // local search index
    db.createObjectStore('dives', { keyPath: 'id', autoIncrement: true });
    const p = db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
    p.createIndex('dive', 'dive_id');
    p.createIndex('aphia', 'aphia_id');
  },
});

export async function idb() { return dbp; }

/** Ask the browser not to evict our data under storage pressure (important on phones). */
export async function persistStorage() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { /* ignore */ }
}
