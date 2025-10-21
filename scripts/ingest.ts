#!/usr/bin/env tsx
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import BetterSqlite3, { type Database as BetterSqliteDatabase } from 'better-sqlite3';
import matter from 'gray-matter';
import sharp from 'sharp';
import { z } from 'zod';
import pdfParse from '../lib/pdfParseWrapper';
import type { ItemRecord } from '../types/item';

const SUPPORTED_EXTENSIONS = new Set(['.md', '.txt', '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.mp3', '.wav', '.mp4']);
const DEFAULT_ROOT = process.env.COLLECTIONS_ROOT ?? '2025-10-18';
const DB_PATH = resolvePath(process.env.COLLECTIONS_DB_PATH ?? path.join('data', 'collections.db'));
const OUTPUT_DIR = path.dirname(DB_PATH);
const JSONL_PATH = path.join(OUTPUT_DIR, 'items.jsonl');
const THUMB_DIR = path.join(process.cwd(), 'public', 'thumbnails');

interface CliOptions {
  root: string | null;
  fromJsonl: string[];
  helpRequested: boolean;
}

const DurationSchema = z
  .preprocess((value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
    return value;
  }, z.number({ invalid_type_error: 'durationSec must be a number' }).nonnegative())
  .nullable();

const JsonlRecordSchema = z.object({
  id: z.string().min(1, 'id is required'),
  title: z.string().min(1, 'title is required'),
  description: z.string().trim().optional().nullable(),
  date: z.string().trim().optional().nullable(),
  creators: z
    .array(z.string().trim().min(1))
    .optional()
    .nullable()
    .transform((value) => {
      if (!value) return null;
      const cleaned = dedupeStrings(value);
      return cleaned.length ? cleaned : null;
    }),
  subjects: z
    .array(z.string().trim().min(1))
    .optional()
    .nullable()
    .transform((value) => {
      if (!value) return null;
      const cleaned = dedupeStrings(value);
      return cleaned.length ? cleaned : null;
    }),
  collection: z.string().trim().optional().nullable(),
  series: z.string().trim().optional().nullable(),
  sourceUrl: z
    .union([z.string().url('sourceUrl must be a valid URL'), z.string().trim().min(1), z.null()])
    .optional()
    .nullable(),
  localPath: z.string().trim().optional().nullable(),
  mediaType: z.enum(['text', 'pdf', 'image', 'audio', 'video']),
  durationSec: DurationSchema.optional().nullable(),
  thumbnail: z.string().trim().optional().nullable(),
  transcriptText: z.string().optional().nullable(),
  ocrText: z.string().optional().nullable(),
  rights: z.string().optional().nullable(),
  citation: z.string().optional().nullable(),
  captionsVttPath: z.string().trim().optional().nullable(),
  captionsSrtPath: z.string().trim().optional().nullable(),
  mediaUrl: z.string().trim().optional().nullable(),
  checksumSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'checksumSha256 must be a 64 character hex string')
    .optional(),
  addedAt: z.string().optional(),
  advisory: z.number().int().min(0).max(1).optional()
});

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    seen.add(trimmed);
  }
  return Array.from(seen);
}

function resolvePath(candidate: string) {
  return path.isAbsolute(candidate) ? candidate : path.join(process.cwd(), candidate);
}

function parseArgs(argv: string[]): CliOptions {
  let root: string | null = null;
  const fromJsonl: string[] = [];
  let helpRequested = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--root flag requires a directory path');
      }
      root = value;
      i += 1;
    } else if (arg === '--from-jsonl') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--from-jsonl flag requires a file path');
      }
      fromJsonl.push(value);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      helpRequested = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { root, fromJsonl, helpRequested };
}

function printHelp() {
  console.log(`Usage: pnpm ingest [--root <dir>] [--from-jsonl <file>]

Options:
  --root <dir>        Directory containing local collection files (default: ${DEFAULT_ROOT})
  --from-jsonl <file> Load additional items from a harvested JSONL file (repeatable)
  -h, --help          Show this message
`);
}

export async function main() {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    printHelp();
    process.exit(1);
    return;
  }

  if (options.helpRequested) {
    printHelp();
    process.exit(0);
  }

  const rootPath = options.root ? resolvePath(options.root) : resolvePath(DEFAULT_ROOT);
  const jsonlPaths = options.fromJsonl.map((entry) => resolvePath(entry));

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(THUMB_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(JSONL_PATH), { recursive: true });

  const items = new Map<string, ItemRecord>();

  if (jsonlPaths.length) {
    for (const jsonlPath of jsonlPaths) {
      const remoteItems = await loadItemsFromJsonl(jsonlPath);
      for (const item of remoteItems) {
        items.set(item.id, item);
      }
      console.log(`Loaded ${remoteItems.length} record${remoteItems.length === 1 ? '' : 's'} from ${jsonlPath}`);
    }
  }

  if (rootPath && fs.existsSync(rootPath)) {
    const files = collectFiles(rootPath).filter((file) => SUPPORTED_EXTENSIONS.has(path.extname(file).toLowerCase()));
    for (const file of files) {
      try {
        const record = await buildItemFromFile(file);
        if (record) {
          items.set(record.id, record);
        }
      } catch (error) {
        console.error('Failed to ingest file', file, error);
      }
    }
  } else if (rootPath) {
    console.warn(`Source directory ${rootPath} not found. Skipping local file ingest.`);
  }

  const records = Array.from(items.values());
  writeDatabase(records);
  writeJsonl(records);
  console.log(`Ingested ${records.length} item${records.length === 1 ? '' : 's'}.`);
}

async function buildItemFromFile(fullPath: string): Promise<ItemRecord | null> {
  const relativePath = path.relative(process.cwd(), fullPath);
  const ext = path.extname(fullPath).toLowerCase();
  const sha = await hashFile(fullPath);
  const baseMetadata = buildBaseMetadata(relativePath);
  let description: string | null = null;
  let transcriptText: string | null = null;
  let ocrText: string | null = null;
  let durationSec: number | null = null;
  let thumbnail: string | null = null;
  const rights = baseMetadata.rights;
  const citation = baseMetadata.citation;

  if (ext === '.md' || ext === '.txt') {
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const { content, data } = matter(raw);
    const lines = content.trim().split(/\r?\n/).filter(Boolean);
    const title = data.title ?? lines[0] ?? path.basename(fullPath, ext);
    description = lines.slice(1, 5).join(' ');
    transcriptText = content;
    return {
      id: sha.slice(0, 32),
      title,
      description,
      date: baseMetadata.date,
      creators: Array.isArray(data.creators) ? data.creators.map(String) : null,
      subjects: Array.isArray(data.subjects) ? data.subjects.map(String) : null,
      collection: baseMetadata.collection,
      series: baseMetadata.series,
      sourceUrl: baseMetadata.sourceUrl,
      localPath: relativePath,
      mediaType: 'text',
      durationSec,
      thumbnail,
      transcriptText,
      ocrText,
      captionsVttPath: null,
      captionsSrtPath: null,
      rights,
      citation,
      checksumSha256: sha,
      addedAt: new Date().toISOString(),
      advisory: baseMetadata.advisory
    };
  }

  if (ext === '.pdf') {
    const buffer = fs.readFileSync(fullPath);
    try {
      const parsed = await pdfParse(buffer);
      ocrText = parsed.text;
      description = parsed.text.split('\n').slice(0, 5).join(' ');
    } catch (error) {
      console.warn(`Could not parse PDF ${fullPath}:`, error);
    }
    return {
      id: sha.slice(0, 32),
      title: baseMetadata.title,
      description,
      date: baseMetadata.date,
      creators: null,
      subjects: null,
      collection: baseMetadata.collection,
      series: baseMetadata.series,
      sourceUrl: baseMetadata.sourceUrl,
      localPath: relativePath,
      mediaType: 'pdf',
      durationSec,
      thumbnail,
      transcriptText,
      ocrText,
      captionsVttPath: null,
      captionsSrtPath: null,
      rights,
      citation,
      checksumSha256: sha,
      addedAt: new Date().toISOString(),
      advisory: baseMetadata.advisory
    };
  }

  if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
    const thumbName = `${sha.slice(0, 16)}.jpg`;
    await sharp(fullPath).resize(800, 800, { fit: 'inside' }).jpeg({ quality: 80 }).toFile(path.join(THUMB_DIR, thumbName));
    thumbnail = thumbName;
    return {
      id: sha.slice(0, 32),
      title: baseMetadata.title,
      description,
      date: baseMetadata.date,
      creators: null,
      subjects: null,
      collection: baseMetadata.collection,
      series: baseMetadata.series,
      sourceUrl: baseMetadata.sourceUrl,
      localPath: relativePath,
      mediaType: 'image',
      durationSec,
      thumbnail,
      transcriptText,
      ocrText,
      captionsVttPath: null,
      captionsSrtPath: null,
      rights,
      citation,
      checksumSha256: sha,
      addedAt: new Date().toISOString(),
      advisory: baseMetadata.advisory
    };
  }

  if (ext === '.mp3' || ext === '.wav') {
    transcriptText = findAdjacentTranscript(fullPath);
    description = transcriptText ? transcriptText.split('\n').slice(0, 5).join(' ') : baseMetadata.title;
    return {
      id: sha.slice(0, 32),
      title: baseMetadata.title,
      description,
      date: baseMetadata.date,
      creators: null,
      subjects: null,
      collection: baseMetadata.collection,
      series: baseMetadata.series,
      sourceUrl: baseMetadata.sourceUrl,
      localPath: relativePath,
      mediaType: 'audio',
      durationSec,
      thumbnail,
      transcriptText,
      ocrText,
      captionsVttPath: null,
      captionsSrtPath: null,
      rights,
      citation,
      checksumSha256: sha,
      addedAt: new Date().toISOString(),
      advisory: baseMetadata.advisory
    };
  }

  if (ext === '.mp4') {
    transcriptText = findAdjacentTranscript(fullPath);
    description = transcriptText ? transcriptText.split('\n').slice(0, 5).join(' ') : baseMetadata.title;
    return {
      id: sha.slice(0, 32),
      title: baseMetadata.title,
      description,
      date: baseMetadata.date,
      creators: null,
      subjects: null,
      collection: baseMetadata.collection,
      series: baseMetadata.series,
      sourceUrl: baseMetadata.sourceUrl,
      localPath: relativePath,
      mediaType: 'video',
      durationSec,
      thumbnail,
      transcriptText,
      ocrText,
      captionsVttPath: null,
      captionsSrtPath: null,
      rights,
      citation,
      checksumSha256: sha,
      addedAt: new Date().toISOString(),
      advisory: baseMetadata.advisory
    };
  }

  return null;
}

export function collectFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(fullPath);
    }
    return [fullPath];
  });
}

export function buildBaseMetadata(relativePath: string) {
  const segments = relativePath.split(path.sep);
  const fileName = segments[segments.length - 1];
  const date = segments.find((segment) => /^\d{4}-\d{2}-\d{2}$/.test(segment)) ?? null;
  const title = fileName.replace(path.extname(fileName), '').replace(/[_-]+/g, ' ');
  const collection = segments.length > 1 ? segments[1] : null;
  const series = segments.length > 2 ? segments.slice(2, -1).join(' / ') : null;
  const httpsIndex = segments.findIndex((seg) => seg.startsWith('https:'));
  const sourceUrl = httpsIndex >= 0 ? `${segments[httpsIndex]}/${segments.slice(httpsIndex + 1).join('/')}` : null;
  const rights = segments.some((seg) => /harmful|sensitive/i.test(seg))
    ? 'Contains potentially harmful content.'
    : null;
  const citation = `${title}. ${collection ?? 'NYC DORIS collections'}. ${date ?? 'Date unknown'}. Repo path: ${relativePath}.`;
  const advisory = rights ? 1 : 0;
  return { title, date, collection, series, sourceUrl, rights, citation, advisory };
}

export function findAdjacentTranscript(mediaPath: string): string | null {
  const dir = path.dirname(mediaPath);
  const base = path.basename(mediaPath, path.extname(mediaPath));
  const candidates = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(base) && (name.endsWith('.txt') || name.endsWith('.md')));
  for (const candidate of candidates) {
    const full = path.join(dir, candidate);
    try {
      return fs.readFileSync(full, 'utf-8');
    } catch {
      continue;
    }
  }
  return null;
}

export async function hashFile(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  return await new Promise<string>((resolve, reject) => {
    stream.on('data', (data) => hash.update(data));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function hashString(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function loadItemsFromJsonl(filePath: string): Promise<ItemRecord[]> {
  if (!fs.existsSync(filePath)) {
    console.error(`JSONL source not found: ${filePath}`);
    process.exit(1);
  }
  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/).filter((line) => line.trim().length > 0);
  const items: ItemRecord[] = [];
  for (const [index, line] of lines.entries()) {
    let rawValue: unknown;
    try {
      rawValue = JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSON at line ${index + 1}: ${(error as Error).message}`);
    }

    const parsed = JsonlRecordSchema.safeParse(rawValue);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const location = issue?.path?.length ? issue.path.join('.') : 'record';
      throw new Error(`Invalid record at line ${index + 1} (${location}): ${issue.message}`);
    }

    const raw = parsed.data;
    const sourceUrl = raw.sourceUrl === undefined || raw.sourceUrl === null || raw.sourceUrl === '' ? null : raw.sourceUrl;
    const localPath = raw.localPath === undefined || raw.localPath === null || raw.localPath === '' ? null : raw.localPath;
    const thumbnail = raw.thumbnail === undefined || raw.thumbnail === null || raw.thumbnail === '' ? null : raw.thumbnail;
    const description = raw.description && raw.description.trim().length ? raw.description : null;
    const rights = raw.rights && raw.rights.trim().length ? raw.rights : null;
    const citation = raw.citation && raw.citation.trim().length ? raw.citation : null;
    const transcriptText = raw.transcriptText ?? null;
    const ocrText = raw.ocrText ?? null;
    const captionsVttPath = raw.captionsVttPath && raw.captionsVttPath.trim().length ? raw.captionsVttPath : null;
    const captionsSrtPath = raw.captionsSrtPath && raw.captionsSrtPath.trim().length ? raw.captionsSrtPath : null;
    const durationSec = raw.durationSec ?? null;
    const addedAt = raw.addedAt ?? new Date().toISOString();
    const checksum = raw.checksumSha256 ?? (sourceUrl ? hashString(sourceUrl) : hashString(raw.id));

    const record: ItemRecord = {
      id: raw.id,
      title: raw.title,
      description,
      date: raw.date ?? null,
      creators: raw.creators ?? null,
      subjects: raw.subjects ?? null,
      collection: raw.collection ?? null,
      series: raw.series ?? null,
      sourceUrl,
      localPath,
      mediaType: raw.mediaType,
      durationSec,
      thumbnail,
      transcriptText,
      ocrText,
      captionsVttPath,
      captionsSrtPath,
      rights,
      citation,
      checksumSha256: checksum,
      addedAt,
      advisory: typeof raw.advisory === 'number' ? raw.advisory : 0
    };

    items.push(record);
  }
  return items;
}

function writeDatabase(items: ItemRecord[]) {
  const db = new BetterSqlite3(DB_PATH);
  db.exec(`PRAGMA journal_mode = WAL;`);
  db.exec(`DROP TABLE IF EXISTS items;`);
  db.exec(`DROP TABLE IF EXISTS collections;`);
  db.exec(`DROP TABLE IF EXISTS items_fts;`);
  db.exec(`CREATE TABLE items (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    date TEXT,
    creators TEXT,
    subjects TEXT,
    collection TEXT,
    series TEXT,
    source_url TEXT,
    local_path TEXT,
    media_type TEXT NOT NULL,
    duration_sec REAL,
    thumbnail TEXT,
    captions_vtt_path TEXT,
    captions_srt_path TEXT,
    transcript_text TEXT,
    ocr_text TEXT,
    rights TEXT,
    citation TEXT,
    checksum_sha256 TEXT NOT NULL,
    added_at TEXT NOT NULL,
    advisory INTEGER DEFAULT 0
  );`);
  db.exec(`CREATE TABLE collections (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT
  );`);
  db.exec(`CREATE VIRTUAL TABLE items_fts USING fts5(
    title, description, transcript_text, ocr_text, subjects, creators, content='items', content_rowid='rowid'
  );`);

  const insert = db.prepare(`INSERT INTO items (
      id, title, description, date, creators, subjects, collection, series, source_url, local_path, media_type,
      duration_sec, thumbnail, captions_vtt_path, captions_srt_path, transcript_text, ocr_text, rights, citation,
      checksum_sha256, added_at, advisory
    ) VALUES (@id, @title, @description, @date, json(@creators), json(@subjects), @collection, @series, @sourceUrl,
      @localPath, @mediaType, @durationSec, @thumbnail, @captionsVttPath, @captionsSrtPath, @transcriptText, @ocrText,
      @rights, @citation, @checksumSha256, @addedAt, @advisory)`);

  const ftsInsert = db.prepare(`INSERT INTO items_fts(rowid, title, description, transcript_text, ocr_text, subjects, creators)
    VALUES ((SELECT rowid FROM items WHERE id = @id), @title, @description, @transcriptText, @ocrText, json(@subjects), json(@creators));`);

  const collectionMap = new Map<string, { id: string; title: string; description: string | null }>();

  const transaction = db.transaction(() => {
    for (const item of items) {
      insert.run(item);
      ftsInsert.run(item);
      if (item.collection && !collectionMap.has(item.collection)) {
        collectionMap.set(item.collection, {
          id: item.collection,
          title: sentenceCase(item.collection),
          description: null
        });
      }
    }
    const insertCollection = db.prepare(`INSERT INTO collections(id, title, description) VALUES (?, ?, ?)`);
    for (const collection of collectionMap.values()) {
      insertCollection.run(collection.id, collection.title, collection.description);
    }
  });

  transaction();
  db.close();
}

export function upsertItems(db: BetterSqliteDatabase, items: ItemRecord[]) {
  const upsert = db.prepare(`INSERT INTO items (
      id, title, description, date, creators, subjects, collection, series, source_url, local_path, media_type,
      duration_sec, thumbnail, captions_vtt_path, captions_srt_path, transcript_text, ocr_text, rights, citation,
      checksum_sha256, added_at, advisory
    ) VALUES (@id, @title, @description, @date, json(@creators), json(@subjects), @collection, @series, @sourceUrl,
      @localPath, @mediaType, @durationSec, @thumbnail, @captionsVttPath, @captionsSrtPath, @transcriptText, @ocrText,
      @rights, @citation, @checksumSha256, @addedAt, @advisory)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      date = excluded.date,
      creators = excluded.creators,
      subjects = excluded.subjects,
      collection = excluded.collection,
      series = excluded.series,
      source_url = excluded.source_url,
      local_path = excluded.local_path,
      media_type = excluded.media_type,
      duration_sec = excluded.duration_sec,
      thumbnail = excluded.thumbnail,
      captions_vtt_path = excluded.captions_vtt_path,
      captions_srt_path = excluded.captions_srt_path,
      transcript_text = excluded.transcript_text,
      ocr_text = excluded.ocr_text,
      rights = excluded.rights,
      citation = excluded.citation,
      checksum_sha256 = excluded.checksum_sha256,
      added_at = excluded.added_at,
      advisory = excluded.advisory`);

  const deleteFts = db.prepare('DELETE FROM items_fts WHERE rowid = (SELECT rowid FROM items WHERE id = @id)');
  const insertFts = db.prepare(`INSERT INTO items_fts(rowid, title, description, transcript_text, ocr_text, subjects, creators)
    VALUES ((SELECT rowid FROM items WHERE id = @id), @title, @description, @transcriptText, @ocrText, json(@subjects), json(@creators));`);

  const upsertCollection = db.prepare(`INSERT INTO collections(id, title, description)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description`);

  const run = db.transaction((records: ItemRecord[]) => {
    const seenCollections = new Map<string, { id: string; title: string; description: string | null }>();
    for (const record of records) {
      upsert.run(record);
      deleteFts.run(record);
      insertFts.run(record);
      if (record.collection) {
        const collectionId = record.collection;
        if (!seenCollections.has(collectionId)) {
          seenCollections.set(collectionId, {
            id: collectionId,
            title: sentenceCase(collectionId),
            description: null
          });
        }
      }
    }

    for (const collection of seenCollections.values()) {
      upsertCollection.run(collection.id, collection.title, collection.description);
    }
  });

  run(items);
}

function sentenceCase(value: string) {
  return value
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function writeJsonl(items: ItemRecord[]) {
  const stream = fs.createWriteStream(JSONL_PATH, { encoding: 'utf-8' });
  for (const item of items) {
    stream.write(`${JSON.stringify(item)}\n`);
  }
  stream.end();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
