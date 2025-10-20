export type MediaType = 'text' | 'pdf' | 'image' | 'audio' | 'video';

export interface ItemRecord {
  id: string;
  title: string;
  description: string | null;
  date: string | null;
  creators: string[] | null;
  subjects: string[] | null;
  collection: string | null;
  series: string | null;
  sourceUrl: string | null;
  localPath: string | null;
  mediaType: MediaType;
  durationSec: number | null;
  thumbnail: string | null;
  transcriptText: string | null;
  ocrText: string | null;
  rights: string | null;
  citation: string | null;
  checksumSha256: string;
  addedAt: string;
  advisory: number;
}
