// Keyless Ethereum reader (T156): log paging, Multicall3 and a paced RPC pool, on the same pool
// code as NEAR (../rpc/pool.ts).
//
// Endpoints, measured 2026-11-05:
//   tenderly  mainnet.gateway.tenderly.co  the gateway Tenderly's docs name. Old logs over wide
//             ranges (cap 20,000 results per query; the error says which range fits) and old
//             state back to 2016. The docs say public endpoints are rate-limited.
//   drpc      eth.drpc.org                 old state yes, logs only 10,000 blocks at a time, so
//             it backs up state reads and never serves logs.
// Refused when tested: publicnode (403 on old state), BlockPI (5,000 blocks), 1RPC (50 blocks),
// Cloudflare ("too large").
import { InputError } from '../errors.ts';
import {
  type RpcEndpoint,
  RpcError,
  type RpcPool,
  type RpcPoolOptions,
  type RpcPoolStats,
  rpcPool,
} from '../rpc/pool.ts';

export const ETHEREUM_CHAIN = 'eip155:1';

export const EVM_ENDPOINTS: readonly RpcEndpoint[] = [
  { id: 'tenderly', url: 'https://mainnet.gateway.tenderly.co', intervalMs: 250 },
  { id: 'drpc', url: 'https://eth.drpc.org', intervalMs: 400 },
];

/** Multicall3 exists from this block on; Multicall2 before it. */
export const MULTICALL3 = { address: '0xca11bde05977b3631167028862be2a173976ca11', from: 14353601 };
export const MULTICALL2 = { address: '0x5ba1e12693dc8f9c48aad8770482f4739beed696', from: 12336033 };

const AGGREGATE3 = '82ad56cb'; // aggregate3((address,bool,bytes)[])
const TRY_AGGREGATE = 'bce38bd7'; // tryAggregate(bool,(address,bytes)[])

const RANGE_CAP =
  /more than \d+ results|block range|ranges? over|too many (results|logs)|too large/i;

export interface EvmLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}

export interface EvmBlock {
  number: number;
  hash: string;
  timestamp: number;
  /** the block time in whole seconds, ISO 8601 UTC */
  as_of: string;
}

export interface EvmCall {
  to: string;
  data: string;
}

export interface EvmCallResult {
  ok: boolean;
  data: string;
}

export interface EvmReader {
  block(ref: number | 'latest' | 'finalized'): Promise<EvmBlock>;
  /** One eth_call pinned to a block. Reverts are thrown as RpcError. */
  call(to: string, data: string, block: number): Promise<string>;
  /** Many eth_calls at one block, batched through Multicall3, Multicall2 or one by one. */
  multicall(calls: EvmCall[], block: number, batch?: number): Promise<EvmCallResult[]>;
  /** Pages of logs in block order, split until each fits the provider's result cap. */
  logPages(filter: LogFilter, from: number, to: number): AsyncGenerator<EvmLog[]>;
  logs(filter: LogFilter, from: number, to: number): Promise<EvmLog[]>;
  /** The URL that served log reads or state reads, for a snapshot's `sources`. */
  servedBy(kind: 'logs' | 'state'): string;
  stats(): RpcPoolStats;
}

export interface LogFilter {
  address: string;
  /** topic filters as in eth_getLogs */
  topics?: (string | string[] | null)[];
}

export interface EvmReaderOptions {
  endpoints?: readonly RpcEndpoint[];
  fetch?: typeof globalThis.fetch;
  sleep?: RpcPoolOptions['sleep'];
  /** stops a runaway log walk, default 400 eth_getLogs calls */
  maxLogCalls?: number;
}

const hexBlock = (n: number) => `0x${n.toString(16)}`;
const word = (n: number) => n.toString(16).padStart(64, '0');
const padded = (hex: string) => hex.padEnd(Math.ceil(hex.length / 64) * 64, '0');

/** aggregate3 calldata: every call may fail on its own. */
export function encodeAggregate3(calls: EvmCall[]): string {
  const tuples = calls.map((c) => {
    const data = c.data.slice(2);
    return `${c.to.slice(2).toLowerCase().padStart(64, '0')}${word(1)}${word(0x60)}${word(data.length / 2)}${padded(data)}`;
  });
  return `0x${AGGREGATE3}${word(0x20)}${offsetsAndTuples(tuples)}`;
}

/** tryAggregate calldata, requireSuccess false: the same answer shape as aggregate3. */
export function encodeTryAggregate(calls: EvmCall[]): string {
  const tuples = calls.map((c) => {
    const data = c.data.slice(2);
    return `${c.to.slice(2).toLowerCase().padStart(64, '0')}${word(0x40)}${word(data.length / 2)}${padded(data)}`;
  });
  return `0x${TRY_AGGREGATE}${word(0)}${word(0x40)}${offsetsAndTuples(tuples)}`;
}

function offsetsAndTuples(tuples: string[]): string {
  let offset = tuples.length * 32;
  const offsets = tuples.map((t) => {
    const here = offset;
    offset += t.length / 2;
    return word(here);
  });
  return `${word(tuples.length)}${offsets.join('')}${tuples.join('')}`;
}

/** Decode `(bool success, bytes returnData)[]`. */
export function decodeAggregate(result: string): EvmCallResult[] {
  const d = Buffer.from(result.slice(2), 'hex');
  const int = (at: number) => Number(BigInt(`0x${d.subarray(at, at + 32).toString('hex')}`));
  const n = int(32);
  const out: EvmCallResult[] = [];
  for (let i = 0; i < n; i++) {
    const at = 64 + int(64 + 32 * i);
    const dataAt = at + int(at + 32);
    const length = int(dataAt);
    out.push({
      ok: int(at) === 1,
      data: `0x${d.subarray(dataAt + 32, dataAt + 32 + length).toString('hex')}`,
    });
  }
  return out;
}

function toBlock(b: { number: string; hash: string; timestamp: string }): EvmBlock {
  const timestamp = Number.parseInt(b.timestamp, 16);
  return {
    number: Number.parseInt(b.number, 16),
    hash: b.hash,
    timestamp,
    as_of: new Date(timestamp * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
}

const failed = (what: string) =>
  new InputError('source_failed', `Ethereum read failed: ${what}`, {
    hint: 'the public Ethereum RPC endpoints did not answer as expected; try again later',
  });

export function evmReader(opts: EvmReaderOptions = {}): EvmReader {
  const endpoints = opts.endpoints ?? EVM_ENDPOINTS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxLogCalls = opts.maxLogCalls ?? 400;
  const common: RpcPoolOptions = {
    chainName: 'Ethereum',
    timeoutMs: 120_000,
    rounds: 3,
    maxWaitMs: 60_000,
    isAnswer: (e) =>
      RANGE_CAP.test(`${String(e.message)} ${String(e.data)}`) ||
      /execution reverted/i.test(String(e.message)),
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
    ...(opts.sleep ? { sleep: opts.sleep } : {}),
  };
  // State reads may fail over. Log reads stay on the first endpoint: the next one's range cap
  // would turn one outage into thousands of tiny queries.
  const state: RpcPool = rpcPool({ ...common, endpoints });
  const logsPool: RpcPool = rpcPool({ ...common, endpoints: endpoints.slice(0, 1) });
  const served = { logs: new Set<string>(), state: new Set<string>() };

  async function stateCall<T>(method: string, params: unknown): Promise<T> {
    const { result, endpoint } = await state.call<T>(method, params);
    served.state.add(endpoint.url);
    return result;
  }

  /** A node sometimes answers an old-state call with no data: ask again before believing it. */
  async function callWithData(to: string, data: string, block: number): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      const r = await stateCall<string | null>('eth_call', [{ to, data }, hexBlock(block)]);
      if (typeof r === 'string' && r !== '0x') return r;
      if (attempt === 2) return '0x';
      await sleep(500 * (attempt + 1));
    }
  }

  const reader: EvmReader = {
    async block(ref) {
      const tag = typeof ref === 'number' ? hexBlock(ref) : ref;
      const b = await stateCall<Parameters<typeof toBlock>[0] | null>('eth_getBlockByNumber', [
        tag,
        false,
      ]);
      if (!b) throw failed(`no block ${String(ref)}`);
      return toBlock(b);
    },

    call: (to, data, block) => callWithData(to, data, block),

    async multicall(calls, block, batch = 400) {
      const out: EvmCallResult[] = [];
      if (block < MULTICALL2.from) {
        for (const c of calls) {
          const data = await callWithData(c.to, c.data, block);
          out.push({ ok: data !== '0x', data });
        }
        return out;
      }
      const useThree = block >= MULTICALL3.from;
      const target = useThree ? MULTICALL3.address : MULTICALL2.address;
      for (let i = 0; i < calls.length; i += batch) {
        const part = calls.slice(i, i + batch);
        const data = useThree ? encodeAggregate3(part) : encodeTryAggregate(part);
        const r = await callWithData(target, data, block);
        if (r === '0x') throw failed(`multicall at block ${block} returned no data`);
        const decoded = decodeAggregate(r);
        if (decoded.length !== part.length)
          throw failed(`multicall answered ${decoded.length} of ${part.length} calls`);
        out.push(...decoded);
      }
      return out;
    },

    async *logPages(filter, from, to) {
      const stack: [number, number][] = [[from, to]];
      let calls = 0;
      while (stack.length > 0) {
        const [a, b] = stack.pop() as [number, number];
        if (++calls > maxLogCalls)
          throw failed(`log walk over ${maxLogCalls} calls at blocks ${a} to ${b}`);
        const query = {
          address: filter.address,
          ...(filter.topics ? { topics: filter.topics } : {}),
          fromBlock: hexBlock(a),
          toBlock: hexBlock(b),
        };
        try {
          const { result, endpoint } = await logsPool.call<EvmLog[]>('eth_getLogs', [query]);
          served.logs.add(endpoint.url);
          yield [...result].sort(
            (x, y) =>
              Number.parseInt(x.blockNumber, 16) - Number.parseInt(y.blockNumber, 16) ||
              Number.parseInt(x.logIndex, 16) - Number.parseInt(y.logIndex, 16),
          );
        } catch (e) {
          if (!(e instanceof RpcError) || !RANGE_CAP.test(e.message)) throw e;
          if (a === b) throw failed(`block ${a} alone holds more logs than one query returns`);
          // Tenderly says which range fits; otherwise halve.
          const hinted = /block range \[0x[0-9a-f]+, (0x[0-9a-f]+)\]/i.exec(e.message)?.[1];
          const fits = hinted ? Number.parseInt(hinted, 16) : Math.floor((a + b) / 2);
          const mid = Math.min(Math.max(fits, a), b - 1);
          stack.push([mid + 1, b], [a, mid]);
        }
      }
    },

    async logs(filter, from, to) {
      const out: EvmLog[] = [];
      for await (const page of reader.logPages(filter, from, to)) out.push(...page);
      return out;
    },

    servedBy(kind) {
      const urls = [...served[kind]];
      return urls.length > 0
        ? urls.join(' + ')
        : ((kind === 'logs' ? endpoints.slice(0, 1) : endpoints)[0]?.url ?? '');
    },

    stats() {
      const merged: RpcPoolStats = { calls: {}, http_429: {}, failures: {} };
      for (const s of [state.stats(), logsPool.stats()])
        for (const k of ['calls', 'http_429', 'failures'] as const)
          for (const [id, n] of Object.entries(s[k])) merged[k][id] = (merged[k][id] ?? 0) + n;
      return merged;
    },
  };
  return reader;
}
