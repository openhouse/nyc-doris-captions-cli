#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import matter from 'gray-matter';
import Database from 'better-sqlite3';
import pdfParse from 'pdf-parse';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(process.cwd(), '2025-10-18');
const OUTPUT_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(OUTPUT_DIR, 'collections.db');
const JSONL_PATH = path.join(OUTPUT_DIR, 'items.jsonl');
const THUMB_DIR = path.join(process.cwd(), 'public', 'thumbnails');

const SUPPORTED_EXTENSIONS = new Set(['.md', '.txt', '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.mp3', '.wav', '.mp4']);

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
  localPath: string;
  mediaType: 'text' | 'pdf' | 'image' | 'audio' | 'video';
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

export async function main() {
  if (!fs.existsSync(ROOT)) {
    console.error(`Source directory ${ROOT} not found. Nothing to ingest.`);
    process.exit(0);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(JSONL_PATH), { recursive: true });
  fs.mkdirSync(THUMB_DIR, { recursive: true });

  const files = collectFiles(ROOT).filter((file) => SUPPORTED_EXTENSIONS.has(path.extname(file).toLowerCase()));

  const items: ItemRecord[] = [];
  for (const file of files) {
    try {
      const relativePath = path.relative(process.cwd(), file);
      const ext = path.extname(file).toLowerCase();
      const sha = await hashFile(file);
      const baseMetadata = buildBaseMetadata(relativePath);
      let description: string | null = null;
      let transcriptText: string | null = null;
      let ocrText: string | null = null;
      let durationSec: number | null = null;
      let thumbnail: string | null = null;
      const rights = baseMetadata.rights;
      const citation = baseMetadata.citation;

      if (ext === '.md' || ext === '.txt') {
        const raw = fs.readFileSync(file, 'utf-8');
        const { content, data } = matter(raw);
        const lines = content.trim().split(/\r?\n/).filter(Boolean);
        const title = data.title ?? lines[0] ?? path.basename(file, ext);
        description = lines.slice(1, 5).join(' ');
        transcriptText = content;
        items.push({
          id: sha.slice(0, 32),
          title,
          description,
          date: baseMetadata.date,
          creators: data.creators ?? null,
          subjects: data.subjects ?? null,
          collection: baseMetadata.collection,
          series: baseMetadata.series,
          sourceUrl: baseMetadata.sourceUrl,
          localPath: relativePath,
          mediaType: 'text',
          durationSec,
          thumbnail,
          transcriptText,
          ocrText,
          rights,
          citation,
          checksumSha256: sha,
          addedAt: new Date().toISOString(),
          advisory: baseMetadata.advisory
        });
      } else if (ext === '.pdf') {
        const buffer = fs.readFileSync(file);
        try {
          const parsed = await pdfParse(buffer);
          ocrText = parsed.text;
          description = parsed.text.split('\n').slice(0, 5).join(' ');
        } catch (error) {
          console.warn(`Could not parse PDF ${file}:`, error);
        }
        items.push({
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
          rights,
          citation,
          checksumSha256: sha,
          addedAt: new Date().toISOString(),
          advisory: baseMetadata.advisory
        });
      } else if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
        const thumbName = `${sha.slice(0, 16)}.jpg`;
        await sharp(file).resize(800, 800, { fit: 'inside' }).jpeg({ quality: 80 }).toFile(path.join(THUMB_DIR, thumbName));
        thumbnail = thumbName;
        items.push({
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
          rights,
          citation,
          checksumSha256: sha,
          addedAt: new Date().toISOString(),
          advisory: baseMetadata.advisory
        });
      } else if (ext === '.mp3' || ext === '.wav') {
        durationSec = null;
        transcriptText = findAdjacentTranscript(file);
        description = transcriptText ? transcriptText.split('\n').slice(0, 5).join(' ') : baseMetadata.title;
        items.push({
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
          rights,
          citation,
          checksumSha256: sha,
          addedAt: new Date().toISOString(),
          advisory: baseMetadata.advisory
        });
      } else if (ext === '.mp4') {
        items.push({
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
          rights,
          citation,
          checksumSha256: sha,
          addedAt: new Date().toISOString(),
          advisory: baseMetadata.advisory
        });
      }
    } catch (error) {
      console.error('Failed to ingest file', file, error);
    }
  }

  writeDatabase(items);
  writeJsonl(items);
  console.log(`Ingested ${items.length} items.`);
}

export function collectFiles(dir: string): string[] {
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

export function writeDatabase(items: ItemRecord[]) {
  const db = new Database(DB_PATH);
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
    local_path TEXT NOT NULL,
    media_type TEXT NOT NULL,
    duration_sec REAL,
    thumbnail TEXT,
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
      duration_sec, thumbnail, transcript_text, ocr_text, rights, citation, checksum_sha256, added_at, advisory
    ) VALUES (@id, @title, @description, @date, json(@creators), json(@subjects), @collection, @series, @sourceUrl,
      @localPath, @mediaType, @durationSec, @thumbnail, @transcriptText, @ocrText, @rights, @citation,
      @checksumSha256, @addedAt, @advisory)`);

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

export function sentenceCase(value: string) {
  return value
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function writeJsonl(items: ItemRecord[]) {
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
