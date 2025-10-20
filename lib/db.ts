import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { cache } from 'react';

const DB_PATH = process.env.COLLECTIONS_DB_PATH ?? path.join(process.cwd(), 'data', 'collections.db');

interface DatabaseUnavailableOptions extends ErrorOptions {
  dbPath?: string;
  troubleshooting?: string[];
}

export class DatabaseUnavailableError extends Error {
  readonly dbPath?: string;

  readonly troubleshooting: string[];

  constructor(message: string, { dbPath, troubleshooting = [], ...options }: DatabaseUnavailableOptions = {}) {
    super(message, options);
    this.name = 'DatabaseUnavailableError';
    this.dbPath = dbPath;
    this.troubleshooting = troubleshooting;
  }
}

export function isDatabaseUnavailableError(error: unknown): error is DatabaseUnavailableError {
  return error instanceof DatabaseUnavailableError;
}

function createDatabase() {
  try {
    const dir = path.dirname(DB_PATH);
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: false });
    db.pragma('journal_mode = WAL');
    return db;
  } catch (error) {
    if (isMissingNativeBindingError(error)) {
      throw new DatabaseUnavailableError(
        'The better-sqlite3 native bindings could not be loaded. Approve the build so the dependency can compile.',
        {
          dbPath: DB_PATH,
          troubleshooting: [
            'Run "pnpm approve-builds better-sqlite3" to allow pnpm to compile the native extension.',
            'Reinstall dependencies with "pnpm install" after approving the build.',
            'If the database file is missing, ingest data with "pnpm ingest" to create data/collections.db.'
          ],
          cause: error instanceof Error ? error : undefined
        }
      );
    }

    throw error;
  }
}

function isMissingNativeBindingError(error: unknown) {
  return error instanceof Error && /Could not locate the bindings file/.test(error.message);
}

export const getDb = cache(createDatabase);

export type Db = ReturnType<typeof createDatabase>;

export function getDatabasePath() {
  return DB_PATH;
}
