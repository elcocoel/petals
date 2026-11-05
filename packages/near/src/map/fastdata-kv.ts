// The FastData KV HTTP API, as far as Petal uses it (shared-map.md, Reading). Shapes checked against
// recorded responses (packages/near/test/fixtures/fastdata/, 2026-11-04):
//   POST /v0/latest/{receiver}/{writer}  { key | key_prefix, limit 1–200, page_token, include_metadata }
//   POST /v0/latest/{receiver}           the same, every writer
//   POST /v0/history/{receiver}/{writer} { key, include_metadata, limit }, newest first
//   → { entries: KvRow[], page_token? }; a missing key gives entries: []
// Rows carry block_timestamp in nanoseconds; MapRow carries milliseconds.
import { canonicalJson, runSignal } from '@petal/core';
import type { MapRow } from '@petal/core/types';
import { describe, NearError } from '../errors.ts';
import { KV_URLS } from '../network.ts';

export { KV_URLS };

/** The largest page FastData serves. */
export const KV_PAGE_MAX = 200;

/** One row as FastData returns it (metadata fields only with include_metadata). */
export interface KvRow {
  predecessor_id: string;
  current_account_id: string;
  block_height: number;
  block_timestamp: number;
  key: string;
  value: unknown;
  tx_hash?: string;
  receipt_id?: string;
  signer_id?: string;
  action_index?: number;
}

export interface KvPage {
  entries: KvRow[];
  page_token?: string;
}

export interface KvDeps {
  fetch?: typeof fetch;
  /** sent as a Bearer token only if set; default FASTNEAR_API_KEY, read on every call */
  apiKey?: string;
  /** default KV_URLS[network] */
  baseUrl?: string;
  /** per request; default 10 s */
  timeoutMs?: number;
  /** rows asked per page; default and maximum 200 */
  pageSize?: number;
}

export interface KvClient {
  readonly baseUrl: string;
  post(path: string, body: Record<string, unknown>): Promise<KvPage>;
}

export function kvClient(network: 'testnet' | 'mainnet', deps: KvDeps = {}): KvClient {
  const baseUrl = (deps.baseUrl ?? KV_URLS[network]).replace(/\/+$/, '');
  return {
    baseUrl,
    async post(path, body) {
      const doFetch = deps.fetch ?? globalThis.fetch;
      const apiKey = deps.apiKey ?? process.env.FASTNEAR_API_KEY;
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (apiKey) headers.authorization = `Bearer ${apiKey}`;
      let res: Response;
      try {
        res = await doFetch(`${baseUrl}${path}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: runSignal(AbortSignal.timeout(deps.timeoutMs ?? 10_000)),
        });
      } catch (e) {
        throw new NearError('source_failed', `FastData ${path}: ${describe(e)}`, { cause: e });
      }
      const text = await res.text();
      if (res.status === 429) {
        const retry = Number(res.headers.get('retry-after'));
        throw new NearError('rate_limited', `FastData ${path}: HTTP 429`, {
          ...(Number.isFinite(retry) && retry > 0 ? { retry_after_s: retry } : {}),
        });
      }
      if (!res.ok)
        throw new NearError(
          'source_failed',
          `FastData ${path}: HTTP ${res.status} ${text.slice(0, 200)}`,
        );
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new NearError('source_failed', `FastData ${path}: not JSON`);
      }
      const page = json as KvPage;
      if (typeof page !== 'object' || page === null || !Array.isArray(page.entries))
        throw new NearError('source_failed', `FastData ${path}: no entries array`);
      return page;
    },
  };
}

export const seg = (s: string) => encodeURIComponent(s);

/** FastData block_timestamp (ns) → ms. Values already in ms pass through. */
export function toMillis(ts: number): number {
  return ts > 1e15 ? Math.floor(ts / 1e6) : ts;
}

/**
 * A KV row as a MapRow, or null for a tombstone or a row Petal cannot use. The value is handed back
 * re-canonicalised (RFC 8785): FastData re-serialises what it stores, so only the canonical form of
 * the parsed value may be hashed, never the bytes on the wire.
 */
export function toMapRow(r: KvRow): MapRow | null {
  if (r.value === null || r.value === undefined) return null;
  if (typeof r.tx_hash !== 'string') return null; // asked with include_metadata; refuse rows without
  let value: unknown;
  try {
    value = JSON.parse(canonicalJson(r.value));
  } catch {
    return null;
  }
  return {
    key: r.key,
    value,
    writer: r.predecessor_id,
    receiver: r.current_account_id,
    tx_hash: r.tx_hash,
    block_height: r.block_height,
    block_timestamp: toMillis(r.block_timestamp),
  };
}
