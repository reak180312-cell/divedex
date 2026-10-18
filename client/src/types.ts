export type Rarity = 'common' | 'uncommon' | 'rare' | 'very-rare' | 'exceptional';
export type SizeClass = 'tiny' | 'small' | 'medium' | 'large' | 'giant';

export interface SpeciesImage {
  id: string;
  source: 'Wikimedia Commons' | 'GBIF' | 'You';
  url: string;
  original?: string;
  width?: number | null;
  height?: number | null;
  license: 'PD' | 'CC0' | 'own';
  licenseLabel: string;
  author?: string | null;
  credit?: string | null;
  title?: string | null;
  sourceUrl?: string | null;
  fullWidth?: number | null;
  illustration?: boolean;
}

export interface SpeciesCard {
  aphiaId: number;
  scientificName: string;
  authority?: string | null;
  rank?: string | null;
  family?: string | null;
  suggestSpecial?: boolean;
  /** editorial "how special do divers find it" rating, 1–10 (not biological rarity) */
  score?: { score: number; basis: string } | null;
  nameEn?: string | null;
  nameHe?: string | null;
  group?: string | null;
  groupLabel?: string | null;
  sizeCm?: number | null;
  sizeClass?: SizeClass | null;
  gbifCount?: number | null;
  rarity?: Rarity | null;
  image?: SpeciesImage | null;
  /** verified photo candidates, best first (all of this species) */
  images?: SpeciesImage[];
  photosFresh?: boolean;
  wormsUrl: string;
  enriched?: boolean;
  // search-only
  matched?: string | null;
  matchedLang?: string | null;
}

export interface Alert { kind: 'iucn' | 'cites' | 'introduced'; title: string; text: string; source?: string | null }

export interface SpeciesProfile extends SpeciesCard {
  alerts?: Alert[];
  classification?: { rank: string; name: string; aphiaId: number }[];
  synonyms?: { name: string; authority?: string; status?: string }[];
  vernaculars?: { name: string; lang: string; code: string }[];
  distribution?: { locality: string; higherGeography?: string | null; establishment?: string | null; occurrence?: string | null; invasiveness?: string | null; locationId?: string | null }[];
  traits?: { type: string; value: string; detail?: string | null; reference?: string | null }[];
  sizeRef?: string | null;
  environment?: { marine: boolean; brackish: boolean; freshwater: boolean; terrestrial: boolean };
  extinct?: boolean;
  citation?: string | null;
  images?: SpeciesImage[];
  summaries?: { en: WikiSummary | null; he: WikiSummary | null };
  wikidata?: string | null;
  gbifKey?: number | null;
  partial?: boolean;
}

export interface WikiSummary { lang: string; title: string; extract: string; url: string; license: string; licenseUrl: string }

export interface Photo { id: number; aphiaId: number | null; width?: number | null; height?: number | null; caption?: string | null; url: string; local?: boolean }

/** `special`: the diver marked this encounter as special (their own judgement, not a rarity claim). */
export interface Sighting { aphiaId: number; count: number; special?: boolean; species: SpeciesCard | null }

export type Light = 'day' | 'night' | 'dusk';
export type Current = 'none' | 'mild' | 'moderate' | 'strong';

export interface DiveFields {
  siteName: string;
  siteRef?: string | null;
  lat?: number | null;
  lon?: number | null;
  area?: string | null;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  maxDepth?: number | null;
  avgDepth?: number | null;
  startBar?: number | null;
  endBar?: number | null;
  weights?: number | null;
  waterTemp?: number | null;
  visibility?: number | null;
  buddy?: string | null;
  notes?: string | null;
  light?: Light | null;
  current?: Current | null;
  suit?: string | null;
  /** minutes; entered by hand or derived from start/end time */
  duration?: number | null;
  /** AphiaID of the species featured as the journal page's "Dive Highlight" (diver's choice) */
  highlight?: number | null;
  /** incomplete dive saved for later — not shown in the journal, map or collection */
  draft?: boolean;
}

export interface Dive extends DiveFields {
  id: number;
  clientId?: string | null;
  number?: number;
  createdAt?: string;
  updatedAt?: string;
  sightings: Sighting[];
  photos: Photo[];
}

export interface CollectionEntry extends SpeciesCard {
  dives: number;
  individuals: number;
  firstSeen: string;
  lastSeen: string;
  depthMin: number | null;
  depthMax: number | null;
  nightDives: number;
  dayDives: number;
  areas: string[];
  sites: string[];
  special: boolean;
  /** most recent sighting location (for local record frequency) */
  lastLat: number | null;
  lastLon: number | null;
  lastArea: string | null;
  manual: number;
}

export interface User { id: number; email: string; name: string; prefs: { nameLang?: 'en' | 'he' }; createdAt: string }

/** Compact OSM site tuple: [id, name, lat, lon, maxDepth, type] */
export type SiteTuple = [string, string | null, number, number, number | null, string | null];

export interface SiteDetail {
  id: string; name: string | null; lat: number; lon: number; maxDepth: number | null; type: string | null;
  entry: string | null; difficulty: string | null; description: string | null; website: string | null; place: string | null; osmUrl: string;
}

export type LocalBand = 'frequent' | 'occasional' | 'rare' | 'none' | 'unrated';
export interface LocalFrequency {
  band: LocalBand; records: number | null; rank: number | null; peers: number | null;
  groupRecords: number | null; groupName: string | null; radiusKm: number;
}

/** A place where the diver has logged at least one (non-draft) dive. */
export interface MySite {
  key: string; name: string; siteRef: string | null; lat: number; lon: number; area: string | null;
  count: number; lastDate: string; dives: { id: number; number: number; date: string; maxDepth: number | null }[];
}
