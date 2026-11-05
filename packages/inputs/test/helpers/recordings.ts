// Stored snapshots and small recorded RPC answers, for the Ethereum and Solana module tests.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { IndexRow, Snapshot } from '@petal/core/types';
import type { Recording } from '../../src/rpc/recording.ts';
import type { SnapshotIndex } from '../../src/store/file-store.ts';
import { FIXTURES } from './snapshots.ts';

export const noSleep = async () => {};

export function loadRecording(name: string): Recording {
  const path = join(import.meta.dirname, '..', 'fixtures', name, 'recording.json.gz');
  return JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) as Recording;
}

export function indexRows(network: string): IndexRow[] {
  const index = JSON.parse(readFileSync(join(FIXTURES, 'index.json'), 'utf8')) as SnapshotIndex;
  return index.snapshots.filter((r) => r.network === network);
}

/** The stored row of a module for these parameters. */
export function rowFor(network: string, params: Record<string, string>): IndexRow {
  const row = indexRows(network).find((r) =>
    Object.entries(params).every(([k, v]) => r.params?.[k] === v),
  );
  if (!row) throw new Error(`no stored ${network} for ${JSON.stringify(params)}`);
  return row;
}

export function storedSnapshot(row: IndexRow): Snapshot {
  return JSON.parse(
    gunzipSync(readFileSync(join(FIXTURES, row.file))).toString('utf8'),
  ) as Snapshot;
}
