import type { SpeciesImage } from './types';

// Responsive sources for remote species photos. The browser picks the smallest file that is sharp
// for the slot it is drawn in, so thumbnails stay tiny and only the species page fetches big images.
//
// Wikimedia: only *standard* thumbnail widths are used — those are edge-cached; arbitrary widths must be
// rendered on demand and get rate-limited (HTTP 429) under load. `.webp` thumbs are ~30% smaller.
// iNaturalist (GBIF CC0 photos): fixed renditions square 75 / small 240 / medium 500 / large 1024 / original 2048.

const COMMONS_THUMB = /(\/thumb\/.+?\/)(\d+)px-([^/?]+?)(\.webp)?(\?|$)/;
const COMMONS_STEPS = [120, 250, 330, 500, 960, 1280, 1920];
const INAT = /(inaturalist-open-data[^?]*\/)(original|large|medium|small|square)\.(jpe?g|png)/i;
const INAT_STEPS: [string, number][] = [['small', 240], ['medium', 500], ['large', 1024], ['original', 2048]];

const supportsWebp = (() => {
  try { return document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp'); } catch { return false; }
})();

function clean(u: string) { return u.replace(/\?utm_[^#]*$/, ''); }

export interface Source { src: string; srcSet?: string }

/** `maxWidth` caps the largest rendition offered (e.g. 500 for thumbnails, 1920 for the hero). */
export function sourcesFor(img: Pick<SpeciesImage, 'url' | 'original' | 'fullWidth'> | null | undefined, maxWidth = 2048): Source | null {
  if (!img?.url) return null;
  const url = clean(img.url);
  const c = url.match(COMMONS_THUMB);
  if (c) {
    const full = img.fullWidth ?? Number(c[2]); // never ask Wikimedia to upscale
    const steps = COMMONS_STEPS.filter((w) => w <= Math.min(full, maxWidth));
    if (!steps.length) return { src: url };
    const ext = supportsWebp && !/\.(gif|svg)$/i.test(c[3]) ? '.webp' : '';
    const at = (w: number) => url.replace(COMMONS_THUMB, `$1${w}px-$3${ext}$5`);
    return { src: at(steps[Math.min(steps.length - 1, 2)]), srcSet: steps.map((w) => `${at(w)} ${w}w`).join(', ') };
  }
  const n = url.match(INAT);
  if (n) {
    const steps = INAT_STEPS.filter(([, w]) => w <= Math.max(240, maxWidth));
    const at = (size: string) => url.replace(INAT, `$1${size}.$3`);
    return { src: at(steps.find(([, w]) => w >= 500)?.[0] ?? 'medium'), srcSet: steps.map(([s, w]) => `${at(s)} ${w}w`).join(', ') };
  }
  return { src: url };
}

/** Back-compat helper used by the journal prints. */
export function srcSetFor(img: Pick<SpeciesImage, 'url' | 'original' | 'fullWidth'> | null | undefined): string | undefined {
  return sourcesFor(img, 1280)?.srcSet;
}

// ---------------------------------------------------------------- failure memory
// URLs that failed recently are skipped for a while instead of being retried on every render.
const BAD_KEY = 'dd:badimg';
const bad = new Map<string, number>((() => {
  try { return JSON.parse(sessionStorage.getItem(BAD_KEY) || '[]') as [string, number][]; } catch { return []; }
})());
export const isBad = (url: string) => (bad.get(url) ?? 0) > Date.now();
export function markBad(url: string) {
  bad.set(url, Date.now() + 30 * 60e3);
  try { sessionStorage.setItem(BAD_KEY, JSON.stringify([...bad].slice(-300))); } catch { /* private mode */ }
}
