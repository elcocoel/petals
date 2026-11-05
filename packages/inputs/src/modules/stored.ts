// What the stored modules share: `at` resolves to a block in fixtures/snapshots/index.json and
// fetch reads that file. Reading the source again is a separate, explicit step (the module's
// pull function, run by scripts/pull-module.ts), so a render never costs a public server a call.
import type {
  At,
  IndexRow,
  NetworkDescriptor,
  Params,
  Progress,
  ResolvedAt,
  Snapshot,
} from '@petal/core/types';
import { InputError } from '../errors.ts';
import type { InputModule } from '../index.ts';
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

/**
 * A module whose target comes from its parameters. A fixture with the same parameters answers
 * first, at no cost; otherwise the module reads the source now.
 */
export function paramModule(cfg: {
  descriptor: NetworkDescriptor;
  keyFor(params: Params | undefined): { chain: string; population: string };
  /** the block a live read would use, or this block when the caller pinned one */
  head(params: Params | undefined, block?: number): Promise<ResolvedAt>;
  /** whether the source can be read at an older block */
  pinnable: boolean;
  pull(at: ResolvedAt, params: Params | undefined, onProgress?: Progress): Promise<Snapshot>;
  fixtures?: string;
}): InputModule {
  const { id } = cfg.descriptor;
  const dir = snapshotDir(cfg.fixtures ?? REPO_FIXTURES);
  const rowsFor = async (params: Params | undefined): Promise<IndexRow[]> => {
    const { population } = cfg.keyFor(params);
    return (await readIndex(dir)).snapshots
      .filter((r) => r.network === id && r.population === population && r.block_height !== null)
      .sort((a, b) => (a.block_height ?? 0) - (b.block_height ?? 0));
  };
  return {
    descriptor: cfg.descriptor,
    keyFor: cfg.keyFor,
    async resolveAt(at, params) {
      const rows = await rowsFor(params);
      const want = parseAt(at);
      const row =
        want.kind === 'latest'
          ? rows.at(-1)
          : want.kind === 'block'
            ? rows.find((r) => r.block_height === want.block_height)
            : rows.filter((r) => Date.parse(r.as_of) <= want.ms).at(-1);
      if (row && row.block_height !== null)
        return { block_height: row.block_height, as_of: row.as_of };
      if (want.kind === 'latest') return cfg.head(params);
      if (want.kind === 'block' && cfg.pinnable) return cfg.head(params, want.block_height);
      throw new InputError('cannot_read', `${id} has nothing stored for ${JSON.stringify(at)}`, {
        hint: cfg.pinnable ? 'ask for "latest" or a block number' : 'ask for "latest"',
      });
    },
    async fetch(at, params, onProgress) {
      const row = (await rowsFor(params)).find((r) => r.block_height === at.block_height);
      const stored = row ? await readSnapshotFile(dir, row.sha256, row.file) : null;
      return stored ?? cfg.pull(at, params, onProgress);
    },
  };
}
