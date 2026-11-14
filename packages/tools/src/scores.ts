// The qualifier's readings, kept by what was read: the model, the statement and the words, in <stateDir>/scores.db.
// A reading of the same words doesn't change, so each is read once; the file can be deleted, and what's missing
// is read again.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { sha256Hex } from '@petal/core';

const files = new Map<string, DatabaseSync>();

function scoresAt(stateDir: string): DatabaseSync {
  let db = files.get(stateDir);
  if (!db) {
    mkdirSync(stateDir, { recursive: true });
    // loaded here, not imported: node:sqlite prints an ExperimentalWarning when first loaded
    const { DatabaseSync: Sqlite } = process.getBuiltinModule('node:sqlite');
    db = new Sqlite(join(stateDir, 'scores.db'), { timeout: 5000 });
    db.exec(
      'PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS score (key TEXT PRIMARY KEY, value REAL NOT NULL)',
    );
    files.set(stateDir, db);
  }
  return db;
}

/** The model's reading of these words for this statement: the one kept, or read now and kept. */
export async function keptScore(
  stateDir: string,
  model: string,
  statement: string,
  words: readonly string[],
  read: () => Promise<number>,
): Promise<number> {
  const key = sha256Hex(JSON.stringify([model, statement, words]));
  const db = scoresAt(stateDir);
  const row = db.prepare('SELECT value FROM score WHERE key = ?').get(key) as
    | { value: number }
    | undefined;
  if (row) return row.value;
  const value = await read();
  db.prepare('INSERT OR REPLACE INTO score (key, value) VALUES (?, ?)').run(key, value);
  return value;
}
