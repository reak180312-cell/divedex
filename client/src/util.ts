import type { Rarity, SpeciesCard, Dive, SizeClass } from './types';

export const RARITY_META: Record<Rarity, { label: string; color: string; order: number }> = {
  common: { label: 'Common', color: '#4fd38a', order: 0 },
  uncommon: { label: 'Uncommon', color: '#45a9ff', order: 1 },
  rare: { label: 'Rare', color: '#b277ff', order: 2 },
  'very-rare': { label: 'Very rare', color: '#ffb547', order: 3 },
  exceptional: { label: 'Exceptional', color: '#ff6b7f', order: 4 },
};

export const SIZE_META: Record<SizeClass, { label: string; range: string }> = {
  tiny: { label: 'Tiny', range: '< 5 cm' },
  small: { label: 'Small', range: '5–30 cm' },
  medium: { label: 'Medium', range: '30 cm–1 m' },
  large: { label: 'Large', range: '1–3 m' },
  giant: { label: 'Giant', range: '> 3 m' },
};

export const GROUP_LABELS: Record<string, string> = {
  fish: 'Bony fish', 'sharks-rays': 'Sharks & rays', mammals: 'Marine mammals', reptiles: 'Reptiles', birds: 'Seabirds',
  cephalopods: 'Cephalopods', 'sea-slugs': 'Sea slugs', molluscs: 'Molluscs', crustaceans: 'Crustaceans',
  echinoderms: 'Echinoderms', 'corals-anemones': 'Corals & anemones', 'jellies-hydroids': 'Jellies & hydroids',
  sponges: 'Sponges', worms: 'Marine worms', tunicates: 'Tunicates', 'algae-plants': 'Algae & seagrass', other: 'Other',
};

/**
 * 1–10 score derived from the number of GBIF occurrence records worldwide (log scale).
 * It reflects how often a species is recorded, not its conservation status.
 */
export function rarityScore(count: number | null | undefined): number | null {
  if (count == null) return null;
  return Math.max(1, Math.min(10, Math.round(10 - Math.log10(count + 1) * 1.6)));
}

export type NameLang = 'en' | 'he';

export function displayName(c: Pick<SpeciesCard, 'nameEn' | 'nameHe' | 'scientificName'> | null | undefined, lang: NameLang = 'en') {
  if (!c) return 'Unknown species';
  return (lang === 'he' ? c.nameHe || c.nameEn : c.nameEn || c.nameHe) || c.scientificName;
}

export function fmtSize(cm: number | null | undefined) {
  if (cm == null) return null;
  if (cm >= 100) return `${+(cm / 100).toFixed(cm >= 1000 ? 0 : 1)} m`;
  if (cm < 1) return `${Math.round(cm * 10)} mm`;
  return `${+cm.toFixed(cm < 10 ? 1 : 0)} cm`;
}

export function fmtNum(n: number | null | undefined, digits = 0) {
  if (n == null || Number.isNaN(n)) return null;
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}

export function fmtTime(t: string | null | undefined) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function durationMin(d: Pick<Dive, 'startTime' | 'endTime'>) {
  if (!d.startTime || !d.endTime) return null;
  const [a, b] = [d.startTime, d.endTime].map((t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });
  const diff = b >= a ? b - a : b + 1440 - a;
  return diff > 0 && diff < 600 ? diff : null;
}

/** The rarest species seen on a dive = fewest GBIF records worldwide (unknown counts rank last). */
export function rarestSighting(d: Dive) {
  const list = d.sightings.filter((s) => s.species);
  if (!list.length) return null;
  return [...list].sort((a, b) => (a.species!.gbifCount ?? Infinity) - (b.species!.gbifCount ?? Infinity))[0];
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Downscale a photo in the browser before upload (keeps uploads fast on mobile data). */
export async function resizeImage(file: File, max = 3200, quality = 0.92): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return { blob: file, width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
  return { blob: blob || file, width: w, height: h };
}

export const isHebrew = (s: string) => /[֐-׿]/.test(s);

export function cls(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ');
}
