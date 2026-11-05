// On a host each function has its own disk: a snapshot one wrote must reach the others.
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { Snapshot } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { fileStore } from '../src/store/file-store.ts';
import { type BlobClient, lastingStore } from '../src/store/lasting-store.ts';

const FIXTURES = join(import.meta.dirname, '../../../fixtures/snapshots');
const file = readdirSync(FIXTURES).find((f) => f.endsWith('.json.gz')) as string;
const snapshot = JSON.parse(gunzipSync(readFileSync(join(FIXTURES, file))).toString()) as Snapshot;

function memoryBlob(): BlobClient & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    async put(path, body) {
      files.set(path, body);
    },
    async get(path) {
      return files.get(path) ?? null;
    },
  };
}

/** A server's own disk, with no fixtures: nothing here unless it was written here. */
const disk = () => {
  const dir = mkdtempSync(join(tmpdir(), 'petal-lasting-'));
  return fileStore({ fixtures: join(dir, 'none'), cache: join(dir, 'cache') });
};

describe('lastingStore', () => {
  test('what one server wrote, another can read', async () => {
    const blob = memoryBlob();
    const { sha256 } = await lastingStore(disk(), blob).put(snapshot);
    expect(blob.files.size).toBe(1);
    expect(await disk().get(sha256)).toBeNull();
    expect((await lastingStore(disk(), blob).get(sha256))?.network.id).toBe(snapshot.network.id);
  });

  test('a fetched copy is kept on that server, so it asks only once', async () => {
    const blob = memoryBlob();
    const { sha256 } = await lastingStore(disk(), blob).put(snapshot);
    const here = disk();
    const reader = lastingStore(here, blob);
    await reader.get(sha256);
    blob.files.clear();
    expect(await reader.get(sha256)).not.toBeNull();
    expect(await here.get(sha256)).not.toBeNull();
  });

  test('a copy that does not match its hash is refused', async () => {
    const blob = memoryBlob();
    const { sha256 } = await lastingStore(disk(), blob).put(snapshot);
    const [path] = [...blob.files.keys()];
    const other = memoryBlob();
    const changed = {
      ...snapshot,
      snapshot: { ...snapshot.snapshot, as_of: '2001-01-01T00:00:00Z' },
    };
    const { sha256: otherSha } = await lastingStore(disk(), other).put(changed);
    blob.files.set(path as string, other.files.get(`snapshots/${otherSha}.json.gz`) as Uint8Array);
    expect(await lastingStore(disk(), blob).get(sha256)).toBeNull();
  });

  test('a read still works when the shared store is down', async () => {
    const down: BlobClient = {
      put: async () => {
        throw new Error('down');
      },
      get: async () => {
        throw new Error('down');
      },
    };
    const store = lastingStore(disk(), down);
    const { sha256 } = await store.put(snapshot);
    expect(await store.get(sha256)).not.toBeNull();
    expect(await lastingStore(disk(), down).get(sha256)).toBeNull();
    expect(await store.get('not a hash')).toBeNull();
  });
});
