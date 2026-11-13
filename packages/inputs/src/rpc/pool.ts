// Keyless NEAR mainnet RPC pool (T034; research R7).
//
// Endpoints in priority order, each paced to what was measured on 2026-11-04:
//   dRPC      near.drpc.org              ~2,700 calls at 2.5/s, no 429s: the workhorse
//   FastNEAR  rpc.mainnet.fastnear.com   ~1 call/s after a burst of ~100; refuses everything
//                                        for 10+ minutes after ~2,000 calls, so it is capped
//   Shitzu    rpc.shitzuapes.xyz         ~1 call/s; 403 without a User-Agent
// plus FastNEAR's archival node, used only for blocks the regular nodes have dropped.
//
// Reads are pinned: `query` and `block` need `finality: "final"` or a fixed `block_id`
// (never optimistic). A 429 pauses that endpoint (Retry-After, else 30 s and growing) and the
// call moves to the next one; 5xx, timeouts and broken answers move on too. When every
// endpoint has failed, the error names each one and why. A JSON-RPC handler error (unknown
// account, unknown block, a contract error) is an answer, not an outage: it is thrown as
// RpcError at once.
import { runSignal } from '@petal/core';
import { InputError, type SourceFailure } from '../errors.ts';

export const USER_AGENT = 'petal/0.1 (NEAR hackathon; keyless public reads; +https://petal)';

export interface RpcEndpoint {
  /** short name used in errors, stats and snapshot sources, e.g. drpc */
  id: string;
  url: string;
  /** minimum milliseconds between two calls to this endpoint */
  intervalMs: number;
  /** calls allowed in this process before the endpoint is skipped */
  cap?: number;
  /** endpoints with the same group share one cap (FastNEAR live and archival) */
  group?: string;
  headers?: Record<string, string>;
  /** serves old blocks; used only for calls that ask for archival */
  archival?: boolean;
}

export const DEFAULT_ENDPOINTS: readonly RpcEndpoint[] = [
  { id: 'drpc', url: 'https://near.drpc.org', intervalMs: 400 },
  {
    id: 'fastnear',
    url: 'https://rpc.mainnet.fastnear.com',
    intervalMs: 1000,
    cap: 1200,
    group: 'fastnear',
  },
  {
    id: 'shitzu',
    url: 'https://rpc.shitzuapes.xyz',
    intervalMs: 1000,
    headers: { 'User-Agent': USER_AGENT },
  },
  {
    id: 'fastnear-archival',
    url: 'https://archival-rpc.mainnet.fastnear.com',
    intervalMs: 1000,
    cap: 1200,
    group: 'fastnear',
    archival: true,
  },
];

/** `finality: "final"` or a fixed block (height or hash). */
export type BlockRef = { finality: 'final' } | { block_id: number | string };

export interface BlockInfo {
  height: number;
  hash: string;
  /** nanoseconds since the epoch, exact */
  timestamp_ns: bigint;
  /** the block time in whole seconds, ISO 8601 UTC */
  as_of: string;
}

export interface CallResult<T> {
  result: T;
  endpoint: RpcEndpoint;
}

export interface ViewResult<T> {
  value: T;
  block_height: number;
  block_hash: string;
  endpoint: RpcEndpoint;
}

export interface CallOptions {
  /** send only to archival endpoints */
  archival?: boolean;
}

export interface RpcPoolStats {
  calls: Record<string, number>;
  http_429: Record<string, number>;
  failures: Record<string, number>;
}

export interface RpcPool {
  readonly endpoints: readonly RpcEndpoint[];
  /** One JSON-RPC call. Returns `result`; throws RpcError (an answer) or InputError (no answer). */
  call<T = unknown>(method: string, params: unknown, opts?: CallOptions): Promise<CallResult<T>>;
  /** A block header. */
  block(ref: BlockRef, opts?: CallOptions): Promise<BlockInfo & { endpoint: RpcEndpoint }>;
  /** A view call (`query` call_function), JSON in and out. */
  view<T = unknown>(
    accountId: string,
    method: string,
    args: unknown,
    ref: BlockRef,
    opts?: CallOptions,
  ): Promise<ViewResult<T>>;
  /** `Rpc` from @petal/near/auth: any `query`, at `finality: "final"` unless a block is given. */
  query<T = unknown>(params: Record<string, unknown>): Promise<T>;
  stats(): RpcPoolStats;
}

export interface RpcPoolOptions {
  endpoints?: readonly RpcEndpoint[];
  fetch?: typeof globalThis.fetch;
  /** default: a real timer */
  sleep?: (ms: number) => Promise<void>;
  /** default: Date.now */
  now?: () => number;
  /** per request, default 10 s; a view call normally answers in under 1 s */
  timeoutMs?: number;
  /** passes over the endpoint list before giving up, default 2 */
  rounds?: number;
  /** the longest the pool waits for a paused endpoint before giving up, default 30 s */
  maxWaitMs?: number;
  /**
   * JSON-RPC errors outside NEAR's list that are still a real answer, thrown as RpcError at once
   * instead of moving on to the next endpoint (an EVM range cap, a revert).
   */
  isAnswer?: (error: Record<string, unknown>) => boolean;
  /** names the chain in the "no endpoint answered" hint, default NEAR */
  chainName?: string;
}

/** A JSON-RPC error answer, e.g. UNKNOWN_BLOCK or a contract error. */
export class RpcError extends Error {
  /** the cause name, e.g. UNKNOWN_BLOCK, UNKNOWN_ACCOUNT, CONTRACT_EXECUTION_ERROR */
  readonly cause_name: string;
  readonly endpoint: string;
  readonly data: unknown;
  constructor(causeName: string, message: string, endpoint: string, data: unknown) {
    super(`${endpoint}: ${causeName}: ${message}`);
    this.name = 'RpcError';
    this.cause_name = causeName;
    this.endpoint = endpoint;
    this.data = data;
  }
}

/** JSON-RPC errors that are a real answer from a healthy node. */
const DEFINITIVE = new Set([
  'UNKNOWN_BLOCK',
  'GARBAGE_COLLECTED_BLOCK',
  'UNKNOWN_ACCOUNT',
  'INVALID_ACCOUNT',
  'NO_CONTRACT_CODE',
  'UNKNOWN_ACCESS_KEY',
  'UNAVAILABLE_SHARD',
  'NO_SYNCED_BLOCKS',
  'CONTRACT_EXECUTION_ERROR',
  'TOO_LARGE_CONTRACT_STATE',
  'UNKNOWN_CHUNK',
  'UNKNOWN_EPOCH',
  'PARSE_ERROR',
  'REQUEST_VALIDATION_ERROR',
]);

/** Block timestamp (ns) → ISO 8601 in whole seconds, the format snapshots use. */
export function nsToIso(ns: bigint | string | number): string {
  const ms = BigInt(ns) / 1_000_000n;
  const s = new Date(Number(ms - (ms % 1000n))).toISOString();
  return s.replace(/\.\d{3}Z$/, 'Z');
}

function checkPinned(method: string, params: unknown): void {
  if (method !== 'query' && method !== 'block') return;
  const p = (params ?? {}) as Record<string, unknown>;
  const hasBlock = p.block_id !== undefined && p.block_id !== null;
  if (p.finality === 'final' && !hasBlock) return;
  if (hasBlock && p.finality === undefined) return;
  throw new TypeError(
    `rpc ${method}: reads must use finality "final" or a fixed block_id (got ${JSON.stringify({ finality: p.finality, block_id: p.block_id })})`,
  );
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * A node that hangs is left alone for this long. Otherwise every call of a read waits out the full
 * timeout before moving on, and a 16-call read takes minutes while the next node is healthy.
 */
export const HANG_PAUSE_MS = 30_000;

/**
 * Endpoints that couldn't be reached, across this process: URL to the time to stop believing that. A
 * pool or a quick ask tries the others first, instead of waiting out a dead connection on every call.
 * An injected fetch gets its own map, so one test's outage isn't another's.
 */
export const endpointHealth = new Map<string, number>();

type Attempt =
  | { ok: true; result: unknown }
  | { ok: false; reason: string; rate_limited?: boolean; retry_after_ms?: number };

export function rpcPool(opts: RpcPoolOptions = {}): RpcPool {
  const endpoints = opts.endpoints ?? DEFAULT_ENDPOINTS;
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const sleep = opts.sleep ?? realSleep;
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const rounds = opts.rounds ?? 2;
  const maxWaitMs = opts.maxWaitMs ?? 30_000;
  const health = opts.fetch ? new Map<string, number>() : endpointHealth;

  const nextSlot = new Map<string, number>();
  const pausedUntil = new Map<string, number>();
  const strikes429 = new Map<string, number>();
  const used = new Map<string, number>(); // per cap group
  const stats: RpcPoolStats = { calls: {}, http_429: {}, failures: {} };
  const bump = (k: keyof RpcPoolStats, id: string) => {
    stats[k][id] = (stats[k][id] ?? 0) + 1;
  };
  const groupOf = (e: RpcEndpoint) => e.group ?? e.id;
  const overCap = (e: RpcEndpoint) => e.cap !== undefined && (used.get(groupOf(e)) ?? 0) >= e.cap;

  /** Wait for this endpoint's next slot, then claim it (synchronously, so callers queue). */
  async function pace(e: RpcEndpoint): Promise<void> {
    const t = Math.max(now(), nextSlot.get(e.id) ?? 0, pausedUntil.get(e.id) ?? 0);
    nextSlot.set(e.id, t + e.intervalMs);
    const wait = t - now();
    if (wait > 0) await sleep(wait);
  }

  async function attempt(e: RpcEndpoint, body: string): Promise<Attempt> {
    await pace(e);
    used.set(groupOf(e), (used.get(groupOf(e)) ?? 0) + 1);
    bump('calls', e.id);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(e.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
          ...e.headers,
        },
        body,
        signal: runSignal(ctrl.signal),
      });
    } catch (err) {
      clearTimeout(timer);
      health.set(e.url, now() + HANG_PAUSE_MS);
      if (!ctrl.signal.aborted) return { ok: false, reason: String(err) };
      pausedUntil.set(e.id, now() + HANG_PAUSE_MS);
      return { ok: false, reason: `timed out after ${timeoutMs} ms` };
    }
    try {
      if (res.status === 429) {
        const header = Number(res.headers.get('retry-after'));
        const strikes = (strikes429.get(e.id) ?? 0) + 1;
        strikes429.set(e.id, strikes);
        const retry_after_ms = header > 0 ? header * 1000 : 30_000 * strikes;
        pausedUntil.set(e.id, now() + retry_after_ms);
        bump('http_429', e.id);
        return { ok: false, reason: 'HTTP 429 rate limited', rate_limited: true, retry_after_ms };
      }
      // Some nodes send a JSON-RPC error with a 4xx/5xx status: a definitive one is still an answer.
      let json: { result?: unknown; error?: Record<string, unknown> } | undefined;
      try {
        json = (await res.json()) as typeof json;
      } catch {
        json = undefined;
      }
      if (json?.error) {
        const cause = (json.error.cause as { name?: string } | undefined)?.name;
        const name = cause ?? (json.error.name as string | undefined) ?? 'RPC_ERROR';
        if (DEFINITIVE.has(name) || opts.isAnswer?.(json.error)) {
          strikes429.delete(e.id);
          const info = json.error.cause as { info?: unknown } | undefined;
          const message = String(json.error.data ?? json.error.message ?? name);
          throw new RpcError(name, message, e.id, info?.info ?? json.error.data);
        }
        const status = res.ok ? '' : `HTTP ${res.status}, `;
        return {
          ok: false,
          reason: `${status}JSON-RPC ${name}: ${String(json.error.message ?? '')}`,
        };
      }
      if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
      if (json === undefined || json === null) return { ok: false, reason: 'answer is not JSON' };
      strikes429.delete(e.id);
      if (!('result' in json)) return { ok: false, reason: 'answer has no result' };
      return { ok: true, result: json.result };
    } finally {
      clearTimeout(timer);
    }
  }

  async function call<T>(method: string, params: unknown, o: CallOptions = {}) {
    checkPinned(method, params);
    const candidates = endpoints.filter((e) => Boolean(e.archival) === Boolean(o.archival));
    if (candidates.length === 0)
      throw new InputError(
        'source_failed',
        `rpc ${method}: no ${o.archival ? 'archival ' : ''}endpoint configured`,
      );
    const body = JSON.stringify({ jsonrpc: '2.0', id: 'petal', method, params });
    const failures: SourceFailure[] = [];
    let allRateLimited = true;
    let retryAfterMs = 0;

    for (let round = 0; round < rounds; round++) {
      const usable = candidates.filter((e) => !overCap(e));
      if (usable.length === 0) break;
      // Endpoints that are not paused first, in priority order; then paused ones, soonest first.
      const t = now();
      const until = (e: RpcEndpoint) =>
        Math.max(pausedUntil.get(e.id) ?? 0, health.get(e.url) ?? 0);
      const ready = usable.filter((e) => until(e) <= t);
      const paused = usable.filter((e) => until(e) > t).sort((a, b) => until(a) - until(b));
      for (const e of [...ready, ...paused]) {
        const wait = (pausedUntil.get(e.id) ?? 0) - now();
        if (wait > maxWaitMs) {
          failures.push({
            endpoint: e.id,
            url: e.url,
            reason: `paused for ${Math.ceil(wait / 1000)} s after a 429`,
          });
          retryAfterMs = Math.max(retryAfterMs, wait);
          continue;
        }
        if (overCap(e)) continue;
        const r = await attempt(e, body);
        if (r.ok) return { result: r.result as T, endpoint: e };
        bump('failures', e.id);
        failures.push({ endpoint: e.id, url: e.url, reason: r.reason });
        if (r.rate_limited) retryAfterMs = Math.max(retryAfterMs, r.retry_after_ms ?? 0);
        else allRateLimited = false;
      }
      if (round < rounds - 1) await sleep(1000 * (round + 1));
    }
    for (const e of candidates)
      if (overCap(e) && !failures.some((f) => f.endpoint === e.id))
        failures.push({
          endpoint: e.id,
          url: e.url,
          reason: `call cap of ${e.cap} reached in this process`,
        });

    const names = [...new Set(failures.map((f) => f.endpoint))];
    const detail = failures.map((f) => `${f.endpoint} (${f.url}): ${f.reason}`).join('; ');
    if (allRateLimited && retryAfterMs > 0)
      throw new InputError(
        'rate_limited',
        `rpc ${method}: every endpoint is rate limiting: ${detail}`,
        {
          hint: 'try again later; a stored snapshot can be reused meanwhile',
          retry_after_s: Math.ceil(retryAfterMs / 1000),
          failures,
        },
      );
    throw new InputError(
      'source_failed',
      `rpc ${method} failed on ${names.join(', ')}: ${detail}`,
      {
        hint: `the public ${opts.chainName ?? 'NEAR'} RPC endpoints did not answer; try again later`,
        failures,
      },
    );
  }

  const pool: RpcPool = {
    endpoints,
    call,
    async block(ref, o) {
      const { result, endpoint } = await call<{
        header: { height: number; hash: string; timestamp_nanosec?: string; timestamp: number };
      }>('block', ref, o);
      const h = result.header;
      const ns = BigInt(h.timestamp_nanosec ?? h.timestamp);
      return { height: h.height, hash: h.hash, timestamp_ns: ns, as_of: nsToIso(ns), endpoint };
    },
    async view<T>(
      accountId: string,
      method: string,
      args: unknown,
      ref: BlockRef,
      o?: CallOptions,
    ) {
      const params = {
        request_type: 'call_function',
        account_id: accountId,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args ?? {})).toString('base64'),
        ...ref,
      };
      const { result, endpoint } = await call<{
        result?: number[];
        error?: string;
        block_height: number;
        block_hash: string;
      }>('query', params, o);
      if (result.error !== undefined || !Array.isArray(result.result))
        throw new RpcError(
          'CONTRACT_EXECUTION_ERROR',
          `${accountId}.${method}: ${result.error ?? 'no result'}`,
          endpoint.id,
          result,
        );
      const text = Buffer.from(result.result).toString('utf8');
      return {
        value: (text ? JSON.parse(text) : null) as T,
        block_height: result.block_height,
        block_hash: result.block_hash,
        endpoint,
      };
    },
    async query<T>(params: Record<string, unknown>) {
      const pinned =
        params.block_id !== undefined || params.finality !== undefined
          ? params
          : { ...params, finality: 'final' };
      return (await call<T>('query', pinned)).result;
    },
    stats: () => ({
      calls: { ...stats.calls },
      http_429: { ...stats.http_429 },
      failures: { ...stats.failures },
    }),
  };
  return pool;
}

let shared: RpcPool | undefined;
/** The process-wide pool on the default endpoints, created on first use (no network at import). */
export function defaultPool(): RpcPool {
  shared ??= rpcPool();
  return shared;
}
