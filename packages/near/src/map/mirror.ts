// mirror(dir, inner) (T040): a local copy of every map write (shared-map.md, Retention and mirror).
// No retention is promised by FastData, and FastNEAR alone runs the indexer, so Petal keeps what it
// writes. Each write is one file, `<dir>/<seq>-<sha12>.json`, saved *before* the inner write is
// tried (status `pending`), then marked `written` with its tx hash. When the inner write fails the
// record stays `pending`, the caller gets a source_failed error, and the retry job sends it later.
//
// Retries go oldest first and stop at the first failure, so the map ends in the order Petal meant.
// A pending key that a later record also writes is not sent again (the later value wins anyway);
// a record left with nothing to send is marked `superseded`.
//
// One process owns a mirror directory at a time (Petal's server). Lives on disk, never committed.
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalJson, sha256Hex } from '@petal/core';
import type { MapRow } from '@petal/core/types';
import { describe, NearError } from '../errors.ts';
import type { MapReader, MapWriter } from './index.ts';
import { checkWrite } from './limits.ts';

export type MirrorStatus = 'written' | 'pending' | 'superseded';

export interface MirrorRecord {
  petal: 'mirror/v1';
  /** `<seq, 8 digits>-<first 12 hex of sha256(canonical entries)>`; also the file name */
  id: string;
  seq: number;
  status: MirrorStatus;
  /** canonical form of what was asked to be written; null values are tombstones */
  entries: Record<string, unknown>;
  tx_hash: string | null;
  block_height: number | null;
  /** keys actually sent by the write that landed, when a retry sent only some */
  sent_keys?: string[];
  created_at: string;
  updated_at: string;
  attempts: number;
  last_error: string | null;
  /** a transaction sent but not confirmed by FastData; it may still land */
  last_tx_hash?: string | null;
}

export interface RetryReport {
  written: number;
  superseded: number;
  /** still pending after this run */
  pending: number;
  error?: string;
}

export interface MirrorWriter extends MapWriter {
  readonly dir: string;
  /** every record, oldest first */
  records(): Promise<MirrorRecord[]>;
  pending(): Promise<MirrorRecord[]>;
  /** send pending records again, oldest first; stops at the first failure */
  retryPending(): Promise<RetryReport>;
  /** run retryPending every `everyMs` (default 60 s) without keeping the process alive */
  startRetry(everyMs?: number): () => void;
}

const FILE = /^(\d{8})-[0-9a-f]{12}\.json$/;

async function loadAll(dir: string): Promise<MirrorRecord[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  const files = names.filter((n) => FILE.test(n)).sort();
  const out: MirrorRecord[] = [];
  for (const f of files) {
    const rec = JSON.parse(await readFile(join(dir, f), 'utf8')) as MirrorRecord;
    if (rec.petal === 'mirror/v1') out.push(rec);
  }
  return out;
}

async function save(dir: string, rec: MirrorRecord): Promise<void> {
  const path = join(dir, `${rec.id}.json`);
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, `${JSON.stringify(rec, null, 2)}\n`);
  await rename(tmp, path);
}

export function mirror(dir: string, inner: MapWriter): MirrorWriter {
  let tail: Promise<unknown> = Promise.resolve();
  /** one operation at a time, in order: writes and retries never interleave */
  const queue = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };
  let nextSeq: number | null = null;
  const now = () => new Date().toISOString();

  async function create(entries: Record<string, unknown>): Promise<MirrorRecord> {
    await mkdir(dir, { recursive: true });
    if (nextSeq === null) {
      const all = await loadAll(dir);
      nextSeq = all.length ? Math.max(...all.map((r) => r.seq)) + 1 : 1;
    }
    const canonical = canonicalJson(entries);
    const seq = nextSeq++;
    const t = now();
    const rec: MirrorRecord = {
      petal: 'mirror/v1',
      id: `${String(seq).padStart(8, '0')}-${sha256Hex(canonical).slice(0, 12)}`,
      seq,
      status: 'pending',
      entries: JSON.parse(canonical) as Record<string, unknown>,
      tx_hash: null,
      block_height: null,
      created_at: t,
      updated_at: t,
      attempts: 0,
      last_error: null,
    };
    await save(dir, rec);
    return rec;
  }

  async function failed(rec: MirrorRecord, e: unknown): Promise<MirrorRecord> {
    const next: MirrorRecord = {
      ...rec,
      attempts: rec.attempts + 1,
      last_error: describe(e),
      last_tx_hash: (e as { tx_hash?: string }).tx_hash ?? null,
      updated_at: now(),
    };
    await save(dir, next);
    return next;
  }

  async function retryPending(): Promise<RetryReport> {
    const all = await loadAll(dir);
    const report: RetryReport = { written: 0, superseded: 0, pending: 0 };
    for (let i = 0; i < all.length; i++) {
      const rec = all[i] as MirrorRecord;
      if (rec.status !== 'pending') continue;
      const later = new Set(all.slice(i + 1).flatMap((r) => Object.keys(r.entries)));
      const keys = Object.keys(rec.entries).filter((k) => !later.has(k));
      if (keys.length === 0) {
        await save(dir, { ...rec, status: 'superseded', updated_at: now() });
        report.superseded++;
        continue;
      }
      const subset = Object.fromEntries(keys.map((k) => [k, rec.entries[k]]));
      try {
        const tx = await inner.write(subset);
        await save(dir, {
          ...rec,
          status: 'written',
          tx_hash: tx.tx_hash,
          block_height: tx.block_height,
          ...(keys.length < Object.keys(rec.entries).length ? { sent_keys: keys } : {}),
          attempts: rec.attempts + 1,
          last_error: null,
          updated_at: now(),
        });
        report.written++;
      } catch (e) {
        await failed(rec, e);
        report.pending = all.slice(i).filter((r) => r.status === 'pending').length;
        report.error = describe(e);
        return report;
      }
    }
    return report;
  }

  return {
    dir,
    async write(entries) {
      checkWrite(entries); // refuse what can never be sent, before mirroring it
      return queue(async () => {
        const rec = await create(entries);
        try {
          const tx = await inner.write(entries);
          await save(dir, {
            ...rec,
            status: 'written',
            tx_hash: tx.tx_hash,
            block_height: tx.block_height,
            attempts: 1,
            updated_at: now(),
          });
          return tx;
        } catch (e) {
          const kept = await failed(rec, e);
          const code = e instanceof NearError ? e.code : 'source_failed';
          throw new NearError(code, describe(e), {
            hint: `kept in the local mirror as pending (${kept.id}); the retry job sends it again`,
            ...(kept.last_tx_hash ? { tx_hash: kept.last_tx_hash } : {}),
            cause: e,
          });
        }
      });
    },
    records: () => queue(() => loadAll(dir)),
    pending: () => queue(async () => (await loadAll(dir)).filter((r) => r.status === 'pending')),
    retryPending: () => queue(retryPending),
    startRetry(everyMs = 60_000) {
      let running = false;
      const timer = setInterval(() => {
        if (running) return;
        running = true;
        queue(retryPending)
          .catch(() => undefined)
          .finally(() => {
            running = false;
          });
      }, everyMs);
      timer.unref?.();
      return () => clearInterval(timer);
    },
  };
}

/**
 * The mirror read as a map, for when the KV API is unreachable (the gallery says so). Rows are what
 * Petal meant to write as `writer`, latest record wins; pending rows have tx_hash "" and
 * block_height 0, so nobody mistakes them for chain evidence.
 */
export function mirrorReader(dir: string, opts: { writer: string; receiver: string }): MapReader {
  async function rows(): Promise<Map<string, MapRow>> {
    const out = new Map<string, MapRow>();
    for (const rec of await loadAll(dir)) {
      const landed = rec.status === 'written';
      for (const [key, value] of Object.entries(rec.entries)) {
        if (landed && rec.sent_keys && !rec.sent_keys.includes(key)) continue;
        out.set(key, {
          key,
          value,
          writer: opts.writer,
          receiver: opts.receiver,
          tx_hash: landed ? (rec.tx_hash ?? '') : '',
          block_height: landed ? (rec.block_height ?? 0) : 0,
          block_timestamp: Date.parse(rec.updated_at),
        });
      }
    }
    return out;
  }
  return {
    async latest(prefix, o = {}) {
      if (o.writers && !o.writers.includes(opts.writer)) return [];
      const out = [...(await rows()).values()]
        .filter((r) => r.key.startsWith(prefix) && r.value !== null)
        .sort((a, b) => (a.key < b.key ? -1 : 1));
      return o.limit === undefined ? out : out.slice(0, Math.max(0, o.limit));
    },
    async get(key, writer) {
      if (writer !== opts.writer) return null;
      const r = (await rows()).get(key);
      return r && r.value !== null ? r : null;
    },
  };
}
