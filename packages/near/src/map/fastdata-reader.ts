// fastDataReader (T038): the shared map read from FastData KV (shared-map.md, Reading).
// Anyone can write under the receiver, so `latest` reads one writer at a time: there is no
// multi-writer filter, so it makes one call per trusted writer and follows page_token until it is
// absent. Tombstones (null) are skipped. Values come back re-canonicalised (toMapRow).
import type { MapRow } from '@petal/core/types';
import { NearError } from '../errors.ts';
import { KV_PAGE_MAX, type KvClient, type KvDeps, kvClient, seg, toMapRow } from './fastdata-kv.ts';
import type { MapReader } from './index.ts';

/** A guard against a server that keeps handing out page tokens: 2,000 pages of 200 rows. */
const MAX_PAGES = 2000;

const byWriterThenKey = (a: MapRow, b: MapRow) =>
  a.writer === b.writer
    ? a.key < b.key
      ? -1
      : a.key > b.key
        ? 1
        : 0
    : a.writer < b.writer
      ? -1
      : 1;

async function readPrefix(
  kv: KvClient,
  pageSize: number,
  path: string,
  prefix: string,
  receiver: string,
  writer: string | undefined,
  limit: number,
): Promise<MapRow[]> {
  const rows: MapRow[] = [];
  const seen = new Set<string>();
  let token: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const body: Record<string, unknown> = {
      key_prefix: prefix,
      limit: Math.min(pageSize, Math.max(1, limit - rows.length)),
      include_metadata: true,
    };
    if (token) body.page_token = token;
    const res = await kv.post(path, body);
    for (const r of res.entries) {
      if (r.current_account_id !== receiver || !r.key.startsWith(prefix)) continue;
      if (writer !== undefined && r.predecessor_id !== writer) continue;
      const row = toMapRow(r);
      if (row) rows.push(row);
    }
    token = res.page_token || undefined;
    if (!token || rows.length >= limit || seen.has(token)) return rows;
    seen.add(token);
  }
  throw new NearError('source_failed', `FastData ${path}: more than ${MAX_PAGES} pages`);
}

export function fastDataReader(
  cfg: { network: 'testnet' | 'mainnet'; receiver: string },
  deps: KvDeps = {},
): MapReader {
  const kv = kvClient(cfg.network, deps);
  const pageSize = Math.min(KV_PAGE_MAX, Math.max(1, deps.pageSize ?? KV_PAGE_MAX));
  const receiver = cfg.receiver;
  return {
    async latest(prefix, opts = {}) {
      const limit = opts.limit ?? Number.POSITIVE_INFINITY;
      if (!(limit > 0)) return [];
      if (opts.writers && opts.writers.length === 0) return [];
      const reads = opts.writers
        ? [...new Set(opts.writers)].map((w) =>
            readPrefix(
              kv,
              pageSize,
              `/v0/latest/${seg(receiver)}/${seg(w)}`,
              prefix,
              receiver,
              w,
              limit,
            ),
          )
        : [
            readPrefix(
              kv,
              pageSize,
              `/v0/latest/${seg(receiver)}`,
              prefix,
              receiver,
              undefined,
              limit,
            ),
          ];
      const rows = (await Promise.all(reads)).flat().sort(byWriterThenKey);
      return Number.isFinite(limit) ? rows.slice(0, limit) : rows;
    },

    async get(key, writer) {
      const res = await kv.post(`/v0/latest/${seg(receiver)}/${seg(writer)}`, {
        key,
        include_metadata: true,
      });
      const r = res.entries.find(
        (e) => e.key === key && e.predecessor_id === writer && e.current_account_id === receiver,
      );
      return r ? toMapRow(r) : null;
    },
  };
}
