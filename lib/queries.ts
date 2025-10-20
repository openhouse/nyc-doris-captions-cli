import { getDb, type Db } from './db';
import type { ItemRecord } from '../types/item';

function tableExists(db: Db, name: string) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name) as { name?: string } | undefined;
  return Boolean(row?.name);
}

export async function getRecentItems(limit = 6): Promise<ItemRecord[]> {
  const db = getDb();
  if (!tableExists(db, 'items')) {
    return [];
  }
  const stmt = db.prepare(
    `SELECT id, title, description, date, collection, series, media_type as mediaType, source_url as sourceUrl,
            local_path as localPath, rights, citation, transcript_text as transcriptText, ocr_text as ocrText,
            duration_sec as durationSec, thumbnail, checksum_sha256 as checksumSha256, added_at as addedAt,
            advisory, creators, subjects
       FROM items
       ORDER BY (date IS NULL), date DESC, added_at DESC
       LIMIT ?`
  );
  const rows = stmt.all(limit);
  return rows.map(hydrateItemRow);
}

export interface SearchFilters {
  query?: string;
  mediaType?: string;
  collection?: string;
  startDate?: string;
  endDate?: string;
  sort?: 'relevance' | 'date';
  limit?: number;
  offset?: number;
}

export interface SearchResult extends ItemRecord {
  rank: number;
  snippet: string | null;
}

export async function searchItems(filters: SearchFilters): Promise<{ results: SearchResult[]; total: number }>
{
  const db = getDb();
  if (!tableExists(db, 'items')) {
    return { results: [], total: 0 };
  }
  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;
  const params: Record<string, unknown> = { limit, offset };

  let where = '1=1';

  if (filters.mediaType) {
    where += ' AND media_type = @mediaType';
    params.mediaType = filters.mediaType;
  }
  if (filters.collection) {
    where += ' AND collection = @collection';
    params.collection = filters.collection;
  }
  if (filters.startDate) {
    where += ' AND date >= @startDate';
    params.startDate = filters.startDate;
  }
  if (filters.endDate) {
    where += ' AND date <= @endDate';
    params.endDate = filters.endDate;
  }

  let orderBy = 'ORDER BY (date IS NULL), date DESC, added_at DESC';
  let select =
    'SELECT items.*, items_fts.rank AS rank, snippet(items_fts, 0, "<mark>", "</mark>") as snippet FROM items';
  let from = ' JOIN items_fts ON items.rowid = items_fts.rowid';
  if (!filters.query) {
    select = 'SELECT items.*, 0 as rank, NULL as snippet FROM items';
    from = '';
    orderBy = filters.sort === 'date' ? 'ORDER BY (date IS NULL), date DESC, added_at DESC' : 'ORDER BY added_at DESC';
  }

  const baseQuery = `${select}${from}${filters.query ? ' WHERE items_fts MATCH @query AND ' : ' WHERE '}${where}`;

  const query = `${baseQuery} ${orderBy} LIMIT @limit OFFSET @offset`;

  const rows = db
    .prepare(query)
    .all({ ...params, query: filters.query ? normaliseQuery(filters.query) : undefined }) as Array<
    { rank: number; snippet: string | null } & Record<string, unknown>
  >;

  const totalStmt = db.prepare(
    `SELECT COUNT(*) as count FROM items${filters.query ? ' JOIN items_fts ON items.rowid = items_fts.rowid' : ''}
      ${filters.query ? ' WHERE items_fts MATCH @query AND ' : ' WHERE '}${where}`
  );
  const total = (totalStmt.get({ ...params, query: filters.query ? normaliseQuery(filters.query) : undefined }) as {
    count: number;
  }).count;

  return { results: rows.map(hydrateSearchRow), total };
}

export function getCollections(): { id: string; title: string; description: string | null }[] {
  const db = getDb();
  if (!tableExists(db, 'collections')) {
    return [];
  }
  return db.prepare('SELECT id, title, description FROM collections ORDER BY title').all();
}

export function getItemById(id: string): ItemRecord | undefined {
  const db = getDb();
  if (!tableExists(db, 'items')) {
    return undefined;
  }
  const row = db
    .prepare(
      `SELECT id, title, description, date, collection, series, media_type as mediaType, source_url as sourceUrl,
              local_path as localPath, rights, citation, transcript_text as transcriptText, ocr_text as ocrText,
              duration_sec as durationSec, thumbnail, checksum_sha256 as checksumSha256, added_at as addedAt,
              advisory, creators, subjects
         FROM items WHERE id = ?`
    )
    .get(id);
  return row ? hydrateItemRow(row) : undefined;
}

export function getItemCount(): number {
  const db = getDb();
  if (!tableExists(db, 'items')) {
    return 0;
  }
  const row = db.prepare('SELECT COUNT(*) as count FROM items').get() as { count: number };
  return row.count;
}

function normaliseQuery(query: string) {
  return query
    .trim()
    .split(/\s+/)
    .map((part) => `${part}*`)
    .join(' ');
}

function hydrateItemRow(row: Record<string, unknown>): ItemRecord {
  return {
    id: String(row.id),
    title: String(row.title ?? 'Untitled'),
    description: toNullableString(row.description),
    date: toNullableString(row.date),
    collection: toNullableString(row.collection),
    series: toNullableString(row.series),
    mediaType: String(row.mediaType ?? 'text') as ItemRecord['mediaType'],
    sourceUrl: toNullableString(row.sourceUrl),
    localPath: toNullableString(row.localPath),
    rights: toNullableString(row.rights),
    citation: toNullableString(row.citation),
    transcriptText: toNullableString(row.transcriptText),
    ocrText: toNullableString(row.ocrText),
    durationSec: typeof row.durationSec === 'number' ? row.durationSec : row.durationSec === null ? null : Number(row.durationSec) || null,
    thumbnail: toNullableString(row.thumbnail),
    checksumSha256: String(row.checksumSha256 ?? ''),
    addedAt: String(row.addedAt ?? ''),
    advisory: Number(row.advisory ?? 0),
    creators: parseJsonList(row.creators),
    subjects: parseJsonList(row.subjects)
  };
}

function hydrateSearchRow(row: { rank: number; snippet: string | null } & Record<string, unknown>): SearchResult {
  const item = hydrateItemRow(row);
  return {
    ...item,
    rank: typeof row.rank === 'number' ? row.rank : Number(row.rank ?? 0),
    snippet: typeof row.snippet === 'string' ? row.snippet : null
  };
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return value === null || value === undefined ? null : String(value);
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseJsonList(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const cleaned = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
    return cleaned.length ? Array.from(new Set(cleaned)) : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      const cleaned = parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
      return cleaned.length ? Array.from(new Set(cleaned)) : null;
    }
    if (typeof parsed === 'string') {
      const trimmed = parsed.trim();
      return trimmed ? [trimmed] : null;
    }
  } catch {
    return null;
  }
  return null;
}
