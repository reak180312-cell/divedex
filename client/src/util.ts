import type { SpeciesCard, Dive, SizeClass, LocalBand } from './types';

/** Local record frequency bands (see core/rarity.js). Order = least to most recorded, for sorting. */
export const LOCAL_META: Record<LocalBand, { label: string; short: string; color: string | null; order: number }> = {
  none: { label: 'No nearby records', short: 'No nearby records', color: '#ffb547', order: 0 },
  rare: { label: 'Rarely recorded here', short: 'Rarely recorded', color: '#b277ff', order: 1 },
  occasional: { label: 'Occasionally recorded here', short: 'Occasional', color: '#45a9ff', order: 2 },
  frequent: { label: 'Frequently recorded here', short: 'Frequent', color: '#4fd38a', order: 3 },
  unrated: { label: 'Not rated', short: 'Not rated', color: null, order: 4 },
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

/** Minutes between two HH:MM times (handles midnight); null if not plausible. */
export function minutesBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const [a, b] = [start, end].map((t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });
  const diff = b >= a ? b - a : b + 1440 - a;
  return diff > 0 && diff < 600 ? diff : null;
}

/** A dive's duration: the entered value, else derived from start/end time. */
export function durationMin(d: Pick<Dive, 'startTime' | 'endTime' | 'duration'>) {
  if (d.duration != null) return d.duration;
  if (!d.startTime || !d.endTime) return null;
  const [a, b] = [d.startTime, d.endTime].map((t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });
  const diff = b >= a ? b - a : b + 1440 - a;
  return diff > 0 && diff < 600 ? diff : null;
}

/** The species the diver chose to feature on this journal page, if any (never inferred). */
export function highlightSighting(d: Dive) {
  return d.highlight != null ? d.sightings.find((s) => s.aphiaId === d.highlight && s.species) ?? null : null;
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
