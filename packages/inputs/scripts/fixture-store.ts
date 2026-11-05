// Writes a stored snapshot into fixtures/snapshots/ and registers it in index.json, the way
// scripts/import-spike-data.ts registers the validators fixture. Refuses anything invalid.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { validateSnapshot } from '@petal/core';
import type { IndexRow, Snapshot } from '@petal/core/types';
import { REPO_FIXTURES } from '../src/modules/near-validators.ts';
import { encodeSnapshot, INDEX_FILE, type SnapshotIndex } from '../src/store/file-store.ts';

export function storeFixture(s: Snapshot): { sha256: string; bytes: number; gz_bytes: number } {
  const check = validateSnapshot(s);
  if (!check.ok)
    throw new Error(
      `${s.network.id}: not a valid snapshot: ${JSON.stringify(check.errors.slice(0, 5))}`,
    );
  const { canonical, sha256 } = encodeSnapshot(s);
  const gz = gzipSync(canonical, { level: 9 });
  const file = `${sha256}.json.gz`;
  writeFileSync(join(REPO_FIXTURES, file), gz);

  const indexPath = join(REPO_FIXTURES, INDEX_FILE);
  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as SnapshotIndex;
  const row: IndexRow = {
    sha256,
    network: s.network.id,
    chain: s.network.chain,
    population: s.network.population,
    ...(s.network.params ? { params: s.network.params as Record<string, string> } : {}),
    block_height: s.snapshot.block_height ?? null,
    as_of: s.snapshot.as_of,
    final: s.snapshot.final,
    bytes: canonical.length,
    gz_bytes: gz.length,
    file,
    where: 'fixture',
    module: s.module,
  };
  index.snapshots = [
    ...index.snapshots.filter(
      (r) =>
        r.sha256 !== row.sha256 &&
        !(r.population === row.population && r.block_height === row.block_height),
    ),
    row,
  ].sort(
    (a, b) => a.network.localeCompare(b.network) || (a.block_height ?? 0) - (b.block_height ?? 0),
  );
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  return { sha256, bytes: canonical.length, gz_bytes: gz.length };
}
