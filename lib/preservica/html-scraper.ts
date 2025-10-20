import { load } from 'cheerio';
import { NormalizedPreservicaRecord, SeedRecord } from './types';

export interface HtmlExtractionOptions {
  fallbackMediaType?: 'audio' | 'video';
}

export function extractFromHtml(html: string, url: string, seed: SeedRecord = {}, options: HtmlExtractionOptions = {}): NormalizedPreservicaRecord {
  const $ = load(html);

  const title =
    seed.title ??
    $('meta[property="og:title"]').attr('content') ??
    $('meta[name="dc.title"]').attr('content') ??
    $('h1').first().text().trim() ??
    'Untitled';

  const description =
    seed.description ??
    $('meta[name="description"]').attr('content') ??
    $('[itemprop="description"]').first().text().trim() ??
    $('.description, .Description, .summary').first().text().trim() ||
    null;

  const rights =
    seed.rights ??
    $('[class*="right" i], [id*="right" i], .rights-statement').first().text().trim() ||
    $('meta[name="dc.rights"]').attr('content') ??
    null;

  const citation =
    seed.citation ??
    $('[class*="citation" i], [id*="citation" i]').first().text().trim() ||
    $('meta[name="citation_reference"]').attr('content') ??
    null;

  const date =
    seed.date ??
    $('time[datetime]').attr('datetime') ??
    $('meta[name="date"]').attr('content') ??
    $('[itemprop="datePublished"]').attr('content') ??
    $('[class*="date" i]').first().text().trim() ||
    null;

  const collection =
    seed.collection ??
    $('[class*="collection" i] a, [class*="collection" i]').first().text().trim() ||
    $('meta[name="dc.relation.ispartof"]').attr('content') ??
    null;

  const series =
    seed.series ??
    $('[class*="series" i]').first().text().trim() ||
    $('meta[name="dc.relation"]').attr('content') ??
    null;

  const creators: string[] = seed.creators ??
    $('meta[name="dc.creator"], [itemprop="creator"]')
      .map((_, element) => $(element).attr('content') ?? $(element).text().trim())
      .get()
      .filter(Boolean);

  const subjects: string[] = seed.subjects ??
    $('meta[name="dc.subject"], [itemprop="about"]')
      .map((_, element) => $(element).attr('content') ?? $(element).text().trim())
      .get()
      .filter(Boolean);

  const mediaType =
    seed.mediaType ??
    inferMediaType($('meta[property="og:type"]').attr('content'), $('meta[property="og:video:type"]').attr('content')) ??
    options.fallbackMediaType ??
    'audio';

  const id = seed.id ?? deriveIdFromUrl(url);

  return {
    id,
    title,
    date: sanitize(date),
    creators,
    subjects,
    collection: sanitize(collection),
    series: sanitize(series),
    sourceUrl: url,
    mediaType,
    rights: sanitize(rights),
    citation: sanitize(citation),
    advisory: seed.advisory ?? 0,
    description: description ? description : null
  };
}

function inferMediaType(...candidates: Array<string | undefined>): 'audio' | 'video' | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const lower = candidate.toLowerCase();
    if (lower.includes('video')) return 'video';
    if (lower.includes('audio')) return 'audio';
  }
  return null;
}

function deriveIdFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    return last ? last.replace(/[^A-Za-z0-9_-]/g, '_') : parsed.hostname;
  } catch {
    return url.replace(/[^A-Za-z0-9_-]/g, '_');
  }
}

function sanitize(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
