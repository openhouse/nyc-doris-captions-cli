export type PreservicaMode = 'api' | 'seed' | 'placeholder';

export interface PreservicaConfig {
  baseUrl: string;
  mode: PreservicaMode;
  clientId?: string;
  clientSecret?: string;
  query?: string;
  maxItems?: number;
  requestsPerSecond?: number;
  userAgent?: string;
  seedPath?: string;
  outputRoot?: string;
}

export interface PreservicaSearchHit {
  id: string;
  title: string;
  description?: string | null;
  date?: string | null;
  collection?: string | null;
  series?: string | null;
  sourceUrl: string;
}

export interface PreservicaObjectDetails {
  id: string;
  title: string;
  description?: string | null;
  date?: string | null;
  creators?: string[] | null;
  subjects?: string[] | null;
  collection?: string | null;
  series?: string | null;
  rights?: string | null;
  citation?: string | null;
  advisory?: 0 | 1;
  mediaType?: 'audio' | 'video';
  sourceUrl: string;
}

export interface NormalizedPreservicaRecord {
  id: string;
  title: string;
  date: string | null;
  creators: string[];
  subjects: string[];
  collection: string | null;
  series: string | null;
  sourceUrl: string;
  mediaType: 'audio' | 'video';
  rights: string | null;
  citation: string | null;
  advisory: 0 | 1;
  description: string | null;
}

export interface SeedRecord {
  id?: string;
  url: string;
  title?: string;
  date?: string;
  collection?: string;
  series?: string;
  mediaType?: 'audio' | 'video';
  rights?: string;
  citation?: string;
  advisory?: 0 | 1;
  creators?: string[];
  subjects?: string[];
  description?: string;
}
