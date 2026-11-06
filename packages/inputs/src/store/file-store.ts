// The content-addressed snapshot store on disk (T033; constitution IV, research R7).
//
// A snapshot is named by the SHA-256 of its RFC 8785 canonical JSON, uncompressed, and kept as
// `<sha256>.json.gz`. Gzip is only how the bytes sit on disk: reading a file gunzips it and
// checks the bytes against the name, so a different gzip level never changes the hash.
// Each folder has an `index.json` (`snapshot-index/v1`) mapping (chain, population,
// block_height) to the hash. Lookups go to the fixtures folder first, then the cache.
// Only the cache is written.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gunzip as gunzipCb, gzip as gzipCb } from 'node:zlib';
import { canonicalJson } from '@petal/core';
import type { IndexRow, Snapshot } from '@petal/core/types';
import type { SnapshotStore } from '../index.ts';

const gzip = promisify(gzipCb);
const gunzip = promisify(gunzipCb);

export const INDEX_FILE = 'index.json';
export const INDEX_FORMAT = 'snapshot-index/v1';

export interface SnapshotIndex {
  petal: typeof INDEX_FORMAT;
  snapshots: IndexRow[];
}

const SHA256 = /^[0-9a-f]{64}$/;

export function isSha256(x: unknown): x is string {
  return typeof x === 'string' && SHA256.test(x);
}

/** Canonical bytes and their name, as the store keeps them. */
export function encodeSnapshot(s: Snapshot): { canonical: Buffer; sha256: string } {
  const canonical = Buffer.from(canonicalJson(s), 'utf8');
  return { canonical, sha256: createHash('sha256').update(canonical).digest('hex') };
}

/** The folder that holds index.json. A repo `fixtures/` root is accepted for `fixtures/snapshots/`. */
export function snapshotDir(dir: string): string {
  if (existsSync(join(dir, INDEX_FILE))) return dir;
  const nested = join(dir, 'snapshots');
  if (existsSync(join(nested, INDEX_FILE))) return nested;
  return dir;
}

/** A folder's index; an empty one when the file does not exist yet. */
export async function readIndex(dir: string): Promise<SnapshotIndex> {
  let text: string;
  try {
    text = await readFile(join(dir, INDEX_FILE), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT')
      return { petal: INDEX_FORMAT, snapshots: [] };
    throw e;
  }
  const index = JSON.parse(text) as SnapshotIndex;
  if (index.petal !== INDEX_FORMAT || !Array.isArray(index.snapshots))
    throw new Error(`store: ${join(dir, INDEX_FILE)} is not a ${INDEX_FORMAT} file`);
  return index;
}

/**
 * Read `<dir>/<file>`, gunzip it, check that the bytes hash to `sha256`, and parse it.
 * Null when the file does not exist. Throws when the bytes do not match their name.
 */
export async function readSnapshotFile(
  dir: string,
  sha256: string,
  file = `${sha256}.json.gz`,
): Promise<Snapshot | null> {
  const path = join(dir, file);
  let gz: Buffer;
  try {
    gz = await readFile(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  const bytes = await gunzip(gz);
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== sha256)
    throw new Error(`store: ${path} holds bytes with sha256 ${actual}, not ${sha256}`);
  return JSON.parse(bytes.toString('utf8')) as Snapshot;
}

/** Final rows first, then the newest. */
function preferred(a: IndexRow, b: IndexRow): number {
  if (a.final !== b.final) return a.final ? -1 : 1;
  return a.as_of < b.as_of ? 1 : a.as_of > b.as_of ? -1 : 0;
}

function sortRows(rows: IndexRow[]): IndexRow[] {
  return rows.sort(
    (a, b) =>
      a.network.localeCompare(b.network) ||
      (a.block_height ?? -1) - (b.block_height ?? -1) ||
      a.as_of.localeCompare(b.as_of) ||
      a.sha256.localeCompare(b.sha256),
  );
}

/** Write a file so readers never see half of it. */
async function writeAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, path);
}

/** Lookup order: fixtures, then the local cache. Only the cache is written. */
export function fileStore(dirs: { fixtures: string; cache: string }): SnapshotStore {
  const fixtures = snapshotDir(dirs.fixtures);
  const cache = dirs.cache;
  // put() is a read-modify-write of cache/index.json: one at a time per store.
  let queue: Promise<unknown> = Promise.resolve();

  const rows = async (): Promise<IndexRow[]> => {
    const [f, c] = await Promise.all([readIndex(fixtures), readIndex(cache)]);
    const fromFixtures = f.snapshots.map((r) => ({ ...r, where: 'fixture' as const }));
    const seen = new Set(fromFixtures.map((r) => r.sha256));
    const fromCache = c.snapshots
      .filter((r) => !seen.has(r.sha256))
      .map((r) => ({ ...r, where: 'cache' as const }));
    return [...fromFixtures, ...fromCache];
  };

  const store: SnapshotStore = {
    async get(sha256) {
      if (!isSha256(sha256)) return null;
      const f = (await readIndex(fixtures)).snapshots.find((r) => r.sha256 === sha256);
      const fromFixtures = await readSnapshotFile(fixtures, sha256, f?.file);
      if (fromFixtures) return fromFixtures;
      const c = (await readIndex(cache)).snapshots.find((r) => r.sha256 === sha256);
      return readSnapshotFile(cache, sha256, c?.file);
    },

    async gz(sha256) {
      if (!isSha256(sha256)) return null;
      for (const dir of [fixtures, cache]) {
        const row = (await readIndex(dir)).snapshots.find((r) => r.sha256 === sha256);
        try {
          return await readFile(join(dir, row?.file ?? `${sha256}.json.gz`));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        }
      }
      return null;
    },

    put(s) {
      const run = queue.then(async () => {
        const { canonical, sha256 } = encodeSnapshot(s);
        const bytes = canonical.length;
        const file = `${sha256}.json.gz`;
        if (existsSync(join(fixtures, file))) return { sha256, bytes };

        await mkdir(cache, { recursive: true });
        const index = await readIndex(cache);
        const existing = index.snapshots.find((r) => r.sha256 === sha256);
        if (existing && existsSync(join(cache, existing.file))) return { sha256, bytes };

        const gz = await gzip(canonical, { level: 9 });
        await writeAtomic(join(cache, file), gz);
        const row: IndexRow = {
          sha256,
          network: s.network.id,
          chain: s.network.chain,
          population: s.network.population,
          ...(s.network.params ? { params: s.network.params as Record<string, string> } : {}),
          block_height: s.snapshot.block_height ?? null,
          as_of: s.snapshot.as_of,
          final: s.snapshot.final,
          bytes,
          gz_bytes: gz.length,
          file,
          where: 'cache',
          module: s.module,
        };
        index.snapshots = sortRows([...index.snapshots.filter((r) => r.sha256 !== sha256), row]);
        await writeAtomic(join(cache, INDEX_FILE), `${JSON.stringify(index, null, 2)}\n`);
        return { sha256, bytes };
      });
      queue = run.catch(() => undefined);
      return run;
    },

    async lookup(key) {
      const match = (await rows())
        .filter(
          (r) =>
            r.chain === key.chain &&
            r.population === key.population &&
            r.block_height === key.block_height,
        )
        .sort(preferred);
      return match[0]?.sha256 ?? null;
    },

    async list(networkId) {
      const all = await rows();
      return sortRows(networkId === undefined ? all : all.filter((r) => r.network === networkId));
    },
  };
  return store;
}
