import { getDb } from './db';

export interface ItemRecord {
  id: string;
  title: string;
  description: string | null;
  date: string | null;
  collection: string | null;
  series: string | null;
  mediaType: 'text' | 'pdf' | 'image' | 'audio' | 'video';
  sourceUrl: string | null;
  localPath: string;
  rights: string | null;
  citation: string | null;
  transcriptText: string | null;
  ocrText: string | null;
  durationSec: number | null;
  thumbnail: string | null;
  checksumSha256: string;
  addedAt: string;
  advisory: number;
}

export async function getRecentItems(limit = 6): Promise<ItemRecord[]> {
  const db = getDb();
  const stmt = db.prepare(
    `SELECT id, title, description, date, collection, series, media_type as mediaType, source_url as sourceUrl,
            local_path as localPath, rights, citation, transcript_text as transcriptText, ocr_text as ocrText,
            duration_sec as durationSec, thumbnail, checksum_sha256 as checksumSha256, added_at as addedAt,
            advisory
       FROM items
       ORDER BY (date IS NULL), date DESC, added_at DESC
       LIMIT ?`
  );
  return stmt.all(limit) as ItemRecord[];
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

  const rows = db.prepare(query).all({ ...params, query: filters.query ? normaliseQuery(filters.query) : undefined }) as
    SearchResult[];

  const totalStmt = db.prepare(
    `SELECT COUNT(*) as count FROM items${filters.query ? ' JOIN items_fts ON items.rowid = items_fts.rowid' : ''}
      ${filters.query ? ' WHERE items_fts MATCH @query AND ' : ' WHERE '}${where}`
  );
  const total = (totalStmt.get({ ...params, query: filters.query ? normaliseQuery(filters.query) : undefined }) as {
    count: number;
  }).count;

  return { results: rows, total };
}

export function getCollections(): { id: string; title: string; description: string | null }[] {
  const db = getDb();
  return db.prepare('SELECT id, title, description FROM collections ORDER BY title').all();
}

export function getItemById(id: string): ItemRecord | undefined {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, title, description, date, collection, series, media_type as mediaType, source_url as sourceUrl,
              local_path as localPath, rights, citation, transcript_text as transcriptText, ocr_text as ocrText,
              duration_sec as durationSec, thumbnail, checksum_sha256 as checksumSha256, added_at as addedAt,
              advisory
         FROM items WHERE id = ?`
    )
    .get(id);
  return row as ItemRecord | undefined;
}

function normaliseQuery(query: string) {
  return query
    .trim()
    .split(/\s+/)
    .map((part) => `${part}*`)
    .join(' ');
}
