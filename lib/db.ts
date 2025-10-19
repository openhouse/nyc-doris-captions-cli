import Database from 'better-sqlite3';
import path from 'node:path';
import { cache } from 'react';

const DB_PATH = process.env.COLLECTIONS_DB_PATH ?? path.join(process.cwd(), 'data', 'collections.db');

export const getDb = cache(() => {
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: false });
  db.pragma('journal_mode = WAL');
  return db;
});

export type Db = ReturnType<typeof getDb>;
