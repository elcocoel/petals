// What the stored modules share: `at` resolves to a block in fixtures/snapshots/index.json and
// fetch reads that file. Reading the source again is a separate, explicit step (the module's
// pull function, run by scripts/pull-module.ts), so a render never costs a public server a call.
import type { At, IndexRow, Progress, ResolvedAt, Snapshot } from '@petal/core/types';
import { InputError } from '../errors.ts';
import { readIndex, readSnapshotFile, snapshotDir } from '../store/file-store.ts';
import { parseAt } from './at.ts';
import { REPO_FIXTURES } from './near-validators.ts';

export interface StoredReads {
  resolveAt(at: At): Promise<ResolvedAt>;
  fetch(at: ResolvedAt, onProgress?: Progress): Promise<Snapshot>;
}

export function storedReads(networkId: string, opts: { fixtures?: string } = {}): StoredReads {
  const dir = snapshotDir(opts.fixtures ?? REPO_FIXTURES);

  const stored = async (): Promise<IndexRow[]> =>
    (await readIndex(dir)).snapshots
      .filter((r) => r.network === networkId && r.block_height !== null)
      .sort((a, b) => (a.block_height ?? 0) - (b.block_height ?? 0));

  const available = (rows: IndexRow[]) =>
    rows.map((r) => `block ${r.block_height} (${r.as_of})`).join(', ') || 'none';

  return {
    async resolveAt(at) {
      const rows = await stored();
      const want = parseAt(at);
      const pick =
        want.kind === 'latest'
          ? rows.at(-1)
          : want.kind === 'block'
            ? rows.find((r) => r.block_height === want.block_height)
            : rows.filter((r) => Date.parse(r.as_of) <= want.ms).at(-1);
      if (!pick || pick.block_height === null)
        throw new InputError(
          'cannot_read',
          `${networkId} is stored only in this build, and no stored snapshot matches ${JSON.stringify(at)}`,
          { hint: `stored: ${available(rows)}. Ask for "latest" or one of these blocks.` },
        );
      return { block_height: pick.block_height, as_of: pick.as_of };
    },

    async fetch(at, onProgress) {
      const rows = await stored();
      const row = rows.find((r) => r.block_height === at.block_height);
      if (!row)
        throw new InputError(
          'cannot_read',
          `${networkId} has no stored snapshot at block ${at.block_height}`,
          { hint: `stored: ${available(rows)}` },
        );
      onProgress?.({
        stage: 'fetching',
        message: `reading the stored ${networkId} snapshot at block ${row.block_height}`,
      });
      const s = await readSnapshotFile(dir, row.sha256, row.file);
      if (!s)
        throw new InputError('internal', `the fixture file ${row.file} is missing from ${dir}`);
      return s;
    },
  };
}
