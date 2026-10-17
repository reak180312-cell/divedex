import type { SpeciesImage } from './types';

// Responsive sources for remote species photos so high-DPI screens get sharp pixels
// while small thumbnails stay light.

const COMMONS_THUMB = /(\/thumb\/.+?\/)(\d+)px-([^/?]+)/;
const INAT = /(inaturalist-open-data[^?]*\/)(original|large|medium|small|square)\.(jpe?g|png)/i;
const COMMONS_STEPS = [500, 960, 1280, 1920, 2560];
const INAT_STEPS: [string, number][] = [['medium', 500], ['large', 1024], ['original', 2048]];

export function srcSetFor(img: Pick<SpeciesImage, 'url' | 'original' | 'fullWidth'> | null | undefined): string | undefined {
  if (!img?.url) return undefined;
  const url = img.url.replace(/\?utm_[^#]*$/, '');
  const c = url.match(COMMONS_THUMB);
  if (c) {
    const max = img.fullWidth ?? Number(c[2]); // never ask Wikimedia to upscale
    const steps = COMMONS_STEPS.filter((w) => w <= max);
    const set = steps.map((w) => `${url.replace(COMMONS_THUMB, `$1${w}px-$3`)} ${w}w`);
    if (img.fullWidth && img.original && img.fullWidth <= 3000 && !steps.includes(img.fullWidth)) set.push(`${img.original.replace(/\?utm_[^#]*$/, '')} ${img.fullWidth}w`);
    return set.length ? set.join(', ') : undefined;
  }
  const n = url.match(INAT);
  if (n) return INAT_STEPS.map(([size, w]) => `${url.replace(INAT, `$1${size}.$3`)} ${w}w`).join(', ');
  return undefined;
}
