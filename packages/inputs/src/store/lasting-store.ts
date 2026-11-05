// A store that outlives one server. On a host, each function has its own throwaway disk, so a
// snapshot read by the API is gone by the time the flower's page asks for it. Every snapshot written
// also goes to a shared blob store, and one missing here is fetched from there and checked against
// its hash. Data gathered once is kept, for everyone (constitution IV).
import { promisify } from 'node:util';
import { gunzip as gunzipCb, gzip as gzipCb } from 'node:zlib';
import { runSignal } from '@petal/core';
import type { Snapshot } from '@petal/core/types';
import type { SnapshotStore } from '../index.ts';
import { encodeSnapshot } from './file-store.ts';

const gzip = promisify(gzipCb);
const gunzip = promisify(gunzipCb);

export interface BlobClient {
  put(path: string, body: Uint8Array): Promise<void>;
  /** null when there is no such file */
  get(path: string): Promise<Uint8Array | null>;
}

const pathOf = (sha256: string) => `snapshots/${sha256}.json.gz`;

export function lastingStore(local: SnapshotStore, blob: BlobClient): SnapshotStore {
  return {
    ...local,
    async get(sha256) {
      const here = await local.get(sha256);
      if (here || !/^[0-9a-f]{64}$/.test(sha256)) return here;
      let body: Uint8Array | null;
      try {
        body = await blob.get(pathOf(sha256));
      } catch {
        return null;
      }
      if (!body) return null;
      const s = JSON.parse((await gunzip(body)).toString('utf8')) as Snapshot;
      // Content-addressed: what came back must be what was asked for.
      if (encodeSnapshot(s).sha256 !== sha256) return null;
      await local.put(s);
      return s;
    },
    async put(s) {
      const stored = await local.put(s);
      try {
        await blob.put(
          pathOf(stored.sha256),
          await gzip(encodeSnapshot(s).canonical, { level: 9 }),
        );
      } catch (e) {
        // A read must not fail because the shared copy did; this server still has it.
        console.warn(`lastingStore: ${stored.sha256} kept here only: ${(e as Error).message}`);
      }
      return stored;
    },
  };
}

/** Vercel Blob, loaded only when a token is set. Snapshots are public chain data. */
export function vercelBlob(token: string): BlobClient {
  return {
    async put(path, body) {
      const { put } = await import('@vercel/blob');
      await put(path, Buffer.from(body), {
        access: 'public',
        token,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/gzip',
      });
    },
    async get(path) {
      const { head, BlobNotFoundError } = await import('@vercel/blob');
      try {
        const { url } = await head(path, { token });
        const res = await fetch(url, { signal: runSignal() });
        return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
      } catch (e) {
        if (e instanceof BlobNotFoundError) return null;
        throw e;
      }
    },
  };
}
