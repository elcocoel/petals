// HyperSync as a source of logs: the fallback where a chain has no keyless route to wide logs.
// It needs ENVIO_API_TOKEN. The token goes in one request header and nowhere else: not in errors,
// progress, snapshots or recordings.
//
// The free plan allows 15 queries a minute, and one query returns about 2,000 logs, so about
// 30,000 logs a minute. The server answers 429 until its window resets; this waits for that.
import { InputError } from '../errors.ts';
import type { EvmChain } from './chains.ts';
import type { EvmLog, LogFilter } from './reader.ts';

export interface HyperSyncStats {
  queries: number;
  rate_limit_waits: number;
}

export interface HyperSyncOptions {
  token: string;
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
  /** stops a walk that would take too long, e.g. in a chat */
  maxQueries?: number;
  stats?: HyperSyncStats;
}

interface RawLog {
  block_number?: number;
  log_index?: number;
  topic0?: string;
  topic1?: string;
  topic2?: string;
  topic3?: string;
  data?: string;
}

const MAX_RETRIES = 3;
const QUERY_TIMEOUT_MS = 120_000;

const failed = (chain: EvmChain, what: string, hint?: string) =>
  new InputError('source_failed', `HyperSync on ${chain.name}: ${what}`, hint ? { hint } : {});

/** Pages of logs from `from` to `to`, both inclusive. Inside a page they are in block order. */
export async function* hypersyncLogPages(
  chain: EvmChain,
  filter: LogFilter,
  from: number,
  to: number,
  opts: HyperSyncOptions,
): AsyncGenerator<EvmLog[]> {
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const stats = opts.stats ?? { queries: 0, rate_limit_waits: 0 };
  const topics = (filter.topics ?? []).map((t) => (t === null ? [] : Array.isArray(t) ? t : [t]));
  let next = from;
  let retries = 0;
  while (next <= to) {
    if (opts.maxQueries !== undefined && stats.queries >= opts.maxQueries)
      throw failed(
        chain,
        `stopped after ${opts.maxQueries} queries at block ${next}`,
        'too many logs for one read; pull it as a stored snapshot',
      );
    stats.queries++;
    let res: Response;
    try {
      res = await doFetch(`${chain.hypersync}/query`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${opts.token}`,
        },
        body: JSON.stringify({
          from_block: next,
          to_block: to + 1, // exclusive
          logs: [{ address: [filter.address], topics }],
          field_selection: {
            log: ['block_number', 'log_index', 'topic0', 'topic1', 'topic2', 'topic3', 'data'],
          },
          max_num_logs: 100_000,
        }),
        signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
      });
    } catch {
      if (++retries > MAX_RETRIES) throw failed(chain, `no answer at block ${next}`);
      await sleep(2000 * retries);
      continue;
    }
    if (res.status === 429) {
      stats.rate_limit_waits++;
      const reset = Number(res.headers.get('x-ratelimit-reset'));
      await sleep(((reset > 0 ? reset : 30) + 1) * 1000);
      continue;
    }
    if (res.status === 401 || res.status === 403)
      throw failed(chain, `the token was refused (HTTP ${res.status})`, 'check ENVIO_API_TOKEN');
    if (!res.ok) {
      if (++retries > MAX_RETRIES) throw failed(chain, `HTTP ${res.status}`);
      await sleep(2000 * retries);
      continue;
    }
    retries = 0;
    const body = (await res.json()) as {
      data?: { logs?: RawLog[] }[];
      next_block?: number;
    };
    if (typeof body.next_block !== 'number' || body.next_block <= next)
      throw failed(chain, `the walk did not advance past block ${next}`);
    const page = (body.data ?? []).flatMap((d) => d.logs ?? []);
    yield page.map((l) => ({
      address: filter.address,
      topics: [l.topic0, l.topic1, l.topic2, l.topic3].filter((t): t is string => Boolean(t)),
      data: l.data ?? '0x',
      blockNumber: `0x${(l.block_number ?? 0).toString(16)}`,
      logIndex: `0x${(l.log_index ?? 0).toString(16)}`,
      transactionHash: '',
    }));
    next = body.next_block;
  }
}
