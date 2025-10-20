import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildBaseMetadata, findAdjacentTranscript, main as runIngest } from '../scripts/ingest';

let BetterSqlite3: typeof import('better-sqlite3') | null = null;
let sqliteAvailable = true;

try {
  BetterSqlite3 = await import('better-sqlite3');
  const probe = new BetterSqlite3.default(':memory:');
  probe.close();
} catch {
  sqliteAvailable = false;
}

const describeIf = sqliteAvailable ? describe : describe.skip;

const FIXTURE_ROOT = path.join(process.cwd(), 'tests', 'fixtures');
const OUTPUT_DIR = path.join(process.cwd(), 'data');

function cleanup() {
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
  if (fs.existsSync(path.join(process.cwd(), 'public', 'thumbnails'))) {
    fs.rmSync(path.join(process.cwd(), 'public', 'thumbnails'), { recursive: true, force: true });
  }
}

if (!sqliteAvailable) {
  console.warn('Skipping ingest script tests: better-sqlite3 native bindings are unavailable.');
}

describeIf('ingest script', () => {
  beforeEach(() => {
    cleanup();
    fs.cpSync(FIXTURE_ROOT, process.cwd(), { recursive: true });
  });

  afterEach(() => {
    cleanup();
    if (fs.existsSync(path.join(process.cwd(), '2025-10-18'))) {
      fs.rmSync(path.join(process.cwd(), '2025-10-18'), { recursive: true, force: true });
    }
  });

  it('builds base metadata from relative paths', () => {
    const meta = buildBaseMetadata(path.join('2025-10-18', 'sample', 'note.md'));
    expect(meta.collection).toBe('sample');
    expect(meta.date).toBe('2025-10-18');
    expect(meta.title).toContain('note');
  });

  it('detects transcripts adjacent to audio', () => {
    const transcript = findAdjacentTranscript(path.join(process.cwd(), '2025-10-18/sample/audio.mp3'));
    expect(transcript).toContain('Audio transcript line one');
  });

  it('runs end-to-end and populates SQLite + JSONL', async () => {
    await runIngest();
    const dbPath = path.join(process.cwd(), 'data', 'collections.db');
    expect(fs.existsSync(dbPath)).toBe(true);
    const db = new BetterSqlite3!.default(dbPath, { readonly: true });
    const row = db.prepare('SELECT COUNT(*) as c FROM items').get() as { c: number };
    expect(row.c).toBeGreaterThan(0);
    const jsonl = fs.readFileSync(path.join(process.cwd(), 'data', 'items.jsonl'), 'utf-8');
    expect(jsonl.trim().length).toBeGreaterThan(0);
    db.close();
  });
});
