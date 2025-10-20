import matter from 'gray-matter';
import fs from 'node:fs';
import path from 'node:path';
import { NormalizedPreservicaRecord, PreservicaObjectDetails, PreservicaSearchHit, SeedRecord } from './types';
import { extractFromHtml } from './html-scraper';

export function normalizeFromApi(details: PreservicaObjectDetails, searchHit?: PreservicaSearchHit): NormalizedPreservicaRecord {
  return {
    id: details.id,
    title: details.title ?? searchHit?.title ?? 'Untitled',
    date: normalizeDate(details.date ?? searchHit?.date ?? null),
    creators: details.creators ?? [],
    subjects: details.subjects ?? [],
    collection: details.collection ?? searchHit?.collection ?? null,
    series: details.series ?? searchHit?.series ?? null,
    sourceUrl: details.sourceUrl ?? searchHit?.sourceUrl ?? '',
    mediaType: details.mediaType ?? 'audio',
    rights: details.rights ?? null,
    citation: details.citation ?? null,
    advisory: details.advisory ?? 0,
    description: details.description ?? searchHit?.description ?? null
  };
}

export function normalizeFromHtml(html: string, url: string, seed: SeedRecord = {}): NormalizedPreservicaRecord {
  return extractFromHtml(html, url, seed);
}

export function normalizePlaceholder(seed: SeedRecord): NormalizedPreservicaRecord {
  const id = seed.id ?? deriveIdFromUrl(seed.url);
  return {
    id,
    title: seed.title ?? 'Untitled',
    date: normalizeDate(seed.date ?? null),
    creators: seed.creators ?? [],
    subjects: seed.subjects ?? [],
    collection: seed.collection ?? null,
    series: seed.series ?? null,
    sourceUrl: seed.url,
    mediaType: seed.mediaType ?? 'audio',
    rights: seed.rights ?? null,
    citation: seed.citation ?? null,
    advisory: seed.advisory ?? 0,
    description: seed.description ?? null
  };
}

export function writeFrontMatter(record: NormalizedPreservicaRecord, outputRoot: string) {
  const baseDir = path.join(outputRoot, 'preservica', record.id);
  fs.mkdirSync(baseDir, { recursive: true });
  const frontMatter = matter.stringify(record.description ?? '', {
    id: record.id,
    title: record.title,
    date: record.date ?? undefined,
    creators: record.creators.length > 0 ? record.creators : undefined,
    subjects: record.subjects.length > 0 ? record.subjects : undefined,
    collection: record.collection ?? undefined,
    series: record.series ?? undefined,
    sourceUrl: record.sourceUrl,
    mediaType: record.mediaType,
    rights: record.rights ?? undefined,
    citation: record.citation ?? undefined,
    advisory: record.advisory
  });
  fs.writeFileSync(path.join(baseDir, 'index.md'), frontMatter, 'utf-8');
}

export function deriveIdFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    return last ? last.replace(/[^A-Za-z0-9_-]/g, '_') : parsed.hostname;
  } catch {
    return url.replace(/[^A-Za-z0-9_-]/g, '_');
  }
}

export function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const isoMatch = trimmed.match(/(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!isoMatch) return trimmed;
  const [, year, month, day] = isoMatch;
  if (!month) return `${year}`;
  if (!day) return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}
