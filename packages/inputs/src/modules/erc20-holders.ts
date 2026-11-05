// erc20-holders (T162): the largest holders of any ERC-20 token on Ethereum or an L2, chosen by
// chain and token address, plus a declared tail. One code path; only where the list comes from
// differs by chain (./evm/chains.ts says why):
//   blockscout  the holders pages of an explorer that answers keyless: seconds, any token.
//   replay      every Transfer log, summed per address: keyless logs where the chain has them,
//               HyperSync and its token where it has none. Cost grows with the token's history.
// Either way the amounts in the snapshot are balanceOf at one finalized block, read from the chain.
//
// The check, plainly. Listed holders plus the tail equal totalSupply() in every snapshot. With a
// replay that is a real test: the replayed balances are summed on their own and compared with
// totalSupply(). With Blockscout the tail is totalSupply() minus the listed holders, so the sum
// holds by construction and cannot fail; what can fail there are Blockscout's own supply and
// balances against the chain, and whether the tail fits under the smallest listed holder.
//
// No labels: Blockscout shows tags and names; they are not read. Kind says only whether Blockscout
// marks the address as a contract.
import type {
  At,
  Holding,
  NetworkDescriptor,
  Params,
  Participant,
  Progress,
  ResolvedAt,
  Snapshot,
} from '@petal/core/types';
import { InputError } from '../errors.ts';
import { addressOf, encodeCall, eventTopic, shortAddress, stringAt, wordAt } from '../evm/abi.ts';
import { ARBITRUM, BASE, ETHEREUM, EVM_CHAINS, type EvmChain } from '../evm/chains.ts';
import { type HyperSyncStats, hypersyncLogPages } from '../evm/hypersync.ts';
import { type EvmLog, type EvmReader, evmReader } from '../evm/reader.ts';
import { fromBaseUnits } from '../import/spike.ts';
import type { InputModule } from '../index.ts';
import { parseAt } from './at.ts';
import { dayOf, grouped, percent2, plainCapabilities } from './plain.ts';
import { storedReads } from './stored.ts';

export const ERC20_HOLDERS_ID = 'erc20-holders';
export const ERC20_HOLDERS_VERSION = 'evm/1';
/** Holders kept by name: as many as a flower can draw. */
export const HOLDERS_KEPT = 300;
const PAGE_SIZE = 50;
const MAX_SLICES = 5000;
const MAX_DIFFERENCE_DIVISOR = 10_000n;
const BLOCKSCOUT_PAUSE_MS = 800;
const BLOCKSCOUT_TIMEOUT_MS = 20_000;
const TRANSFER = eventTopic('Transfer(address,address,uint256)');
const ZERO_TOPIC = `0x${'0'.repeat(64)}`;
/** A read in a chat stops here and says so, instead of walking for minutes. */
const LIVE_LOG_CALLS = 20;
const LIVE_HYPERSYNC_QUERIES = 15;

const S = { list: 'erc20-holder-list', state: 'erc20-state' } as const;

export interface HolderTarget {
  /** the network id */
  id: string;
  /** how the stored data set was listed; default Blockscout where it answers, else a replay */
  list?: 'blockscout' | 'replay';
  chain: EvmChain;
  /** lowercase */
  token: string;
  /** e.g. PEPE holders, Ethereum */
  title: string;
  population: string;
  /** a block before the token's first transfer, default 0 */
  from_block?: number;
}

const stored = (
  chain: EvmChain,
  symbol: string,
  token: string,
  list: 'blockscout' | 'replay',
): HolderTarget => ({
  id: `erc20-holders-${chain.id}-${symbol.toLowerCase()}`,
  list,
  chain,
  token: token.toLowerCase(),
  title: `${symbol} holders, ${chain.name}`,
  population: `erc20-holders-${chain.id}-${token.toLowerCase()}`,
});

export const PEPE_ETHEREUM = stored(
  ETHEREUM,
  'PEPE',
  '0x6982508145454Ce325dDbE47a25d4ec3d2311933',
  'blockscout',
);
export const BANK_ETHEREUM = stored(
  ETHEREUM,
  'BANK',
  '0x2d94AA3e47d9D5024503Ca8491fcE9A2fb4DA198',
  'replay',
);
export const DPX_ARBITRUM = stored(
  ARBITRUM,
  'DPX',
  '0x6C2C06790b3E3E3c38e12Ee22F8183b37a13EE55',
  'replay',
);
export const SEAM_BASE = stored(
  BASE,
  'SEAM',
  '0x1C7a460413dD4e964f96D8dFC56E7223cE88CD85',
  'replay',
);

const capabilities = (unit: string, label: string) =>
  plainCapabilities({
    measure: { id: 'token_balance', unit, label },
    sources: [S.state],
    kind: {
      meaning: 'contract when Blockscout marks the address as one; unknown otherwise',
      sources: [S.list],
    },
    identity: { meaning: 'anonymous: names and tags are not read', sources: [S.list] },
  });

export function holdersDescriptor(t: HolderTarget): NetworkDescriptor {
  const symbol = t.title.split(' ')[0] ?? 'token';
  return {
    id: t.id,
    chain: t.chain.caip2,
    population: t.population,
    kind: 'other',
    title: t.title,
    description: `The largest holders of ${symbol} on ${t.chain.name} at one block, read from the chain, plus a declared tail. Balances only: no votes, no names.`,
    params: {},
    capabilities: capabilities(symbol, `${symbol} balance`),
    live: false,
    cost: {
      calls: 0,
      seconds: 0,
      note: 'stored: served from the fixture. pullErc20Holders reads it again; cost depends on the chain and the token.',
    },
    sources: [
      { id: S.list, kind: 'api', url: t.chain.blockscout ?? t.chain.endpoints[0]?.url ?? '' },
      { id: S.state, kind: 'chain', url: t.chain.endpoints[0]?.url ?? '' },
    ],
  };
}

/** Running state of a Transfer replay: balance per address (lowercase, no zero address). */
export interface TransferReplay {
  balances: Map<string, bigint>;
  logs: number;
  /** logs that are not an ERC-20 Transfer: another topic count or data length */
  skipped: number;
}

export const newTransferReplay = (): TransferReplay => ({
  balances: new Map(),
  logs: 0,
  skipped: 0,
});

/** Apply one page. Order does not matter: each log only adds and subtracts. */
export function applyTransfers(r: TransferReplay, page: EvmLog[]): TransferReplay {
  for (const l of page) {
    const [, from, to] = l.topics;
    if (!from || !to || l.topics.length !== 3 || l.data.length !== 66) {
      r.skipped++;
      continue;
    }
    const value = BigInt(l.data);
    if (from !== ZERO_TOPIC) {
      const a = addressOf(from);
      r.balances.set(a, (r.balances.get(a) ?? 0n) - value);
    }
    if (to !== ZERO_TOPIC) {
      const a = addressOf(to);
      r.balances.set(a, (r.balances.get(a) ?? 0n) + value);
    }
    r.logs++;
  }
  return r;
}

/**
 * The tail as equal slices, each no larger than `floor` where that takes at most `max` slices, so
 * a slice does not outrank the listed holders. Nothing is known about the holders in a slice: it
 * is a piece of a total. The amounts and counts add up exactly.
 */
export function tailSlices(
  amount: bigint,
  count: number,
  floor: bigint,
  max = MAX_SLICES,
): { amount: bigint; count: number }[] {
  if (amount <= 0n) return [];
  const wanted = floor > 0n ? (amount + floor - 1n) / floor : 1n;
  const slices = Math.max(
    1,
    Math.min(Number(wanted > BigInt(max) ? BigInt(max) : wanted), count || 1),
  );
  const each = amount / BigInt(slices);
  const extra = Number(amount % BigInt(slices));
  const people = Math.floor(count / slices);
  const morePeople = count % slices;
  return Array.from({ length: slices }, (_, i) => ({
    amount: each + (i < extra ? 1n : 0n),
    count: Math.max(1, people + (i < morePeople ? 1 : 0)),
  }));
}

/** symbol() answers a string, or bytes32 on some old tokens. */
export function tokenText(data: string): string {
  if (data.length === 66)
    return Buffer.from(data.slice(2), 'hex').toString('utf8').replace(/\0+$/, '');
  return stringAt(data, 0);
}

export interface HoldersChecks {
  block: number;
  list: 'blockscout' | 'replay';
  holders_total: number;
  listed: number;
  listed_sum_raw: string;
  tail_raw: string;
  total_supply_raw: string;
  /** listed plus tail minus totalSupply: zero, by construction with Blockscout */
  drawn_vs_supply_raw: string;
  /** replay: the replayed balances summed on their own, minus totalSupply */
  replay_vs_supply_raw?: string;
  logs?: number;
  /** listed holders whose balanceOf differs from what the list said */
  balance_differences: number;
  balance_difference_raw: string;
  /** Blockscout's total supply minus totalSupply */
  source_supply_difference_raw?: string;
  /** holders no slice outranks */
  slices: number;
  no_slice_outranks: number;
  hypersync?: HyperSyncStats;
  /** RPC calls per endpoint */
  rpc_calls: Record<string, number>;
}

interface ListedHolder {
  address: string;
  /** what the list says the holder has */
  listed: bigint;
  is_contract?: boolean;
}

interface HolderList {
  source: 'blockscout' | 'replay';
  holders: ListedHolder[];
  total: number;
  /** the tail's own sum, when the source knows it */
  sum?: bigint;
  logs?: number;
  source_supply?: bigint;
  url: string;
  method: string;
  kind: 'api' | 'chain';
}

export interface PullHoldersOptions {
  reader?: EvmReader;
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
  /** the token for HyperSync; only asked for where a chain has no keyless logs */
  hypersyncToken?: string;
  hypersyncFetch?: typeof globalThis.fetch;
  /** force a list source; default: Blockscout where it answers, otherwise a replay */
  list?: 'blockscout' | 'replay';
  block?: number;
  keep?: number;
  maxLogCalls?: number;
  maxQueries?: number;
  onProgress?: Progress;
}

const refused = (chain: EvmChain, status: number) =>
  new InputError('cannot_read', `Blockscout on ${chain.name} answered HTTP ${status}`, {
    hint: 'its keyless pages refuse this client; use a replay of Transfer logs',
  });

async function listFromBlockscout(
  chain: EvmChain,
  token: string,
  keep: number,
  opts: PullHoldersOptions,
): Promise<HolderList> {
  const base = chain.blockscout;
  if (!base) throw new InputError('cannot_read', `${chain.name} has no keyless holders API`);
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const get = async (url: string): Promise<Record<string, unknown>> => {
    let res: Response;
    try {
      res = await doFetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'petal/0.1 (keyless public reads)' },
        signal: AbortSignal.timeout(BLOCKSCOUT_TIMEOUT_MS),
      });
    } catch (e) {
      throw new InputError(
        'source_failed',
        `Blockscout on ${chain.name} did not answer: ${(e as Error).message}`,
        { hint: 'try again later, or read a stored snapshot' },
      );
    }
    if (!res.ok) throw refused(chain, res.status);
    return (await res.json()) as Record<string, unknown>;
  };

  const info = await get(`${base}/api/v2/tokens/${token}`);
  const holders: ListedHolder[] = [];
  let next: Record<string, unknown> | null = null;
  while (holders.length < keep) {
    await sleep(BLOCKSCOUT_PAUSE_MS);
    const query: string = next
      ? `?${new URLSearchParams(Object.entries(next).map(([k, v]): [string, string] => [k, String(v)])).toString()}`
      : '';
    const page = (await get(`${base}/api/v2/tokens/${token}/holders${query}`)) as {
      items?: { address?: { hash?: string; is_contract?: boolean }; value?: string }[];
      next_page_params?: Record<string, unknown> | null;
    };
    for (const row of page.items ?? []) {
      if (!row.address?.hash || row.value === undefined) continue;
      holders.push({
        address: row.address.hash.toLowerCase(),
        listed: BigInt(row.value),
        is_contract: row.address.is_contract === true,
      });
    }
    opts.onProgress?.({ stage: 'fetching', message: `${holders.length} holders listed` });
    next = page.next_page_params ?? null;
    if (!next || (page.items ?? []).length === 0) break;
  }
  const supply = info.total_supply;
  return {
    source: 'blockscout',
    holders: holders.slice(0, keep),
    total: Number(info.holders_count ?? info.holders ?? holders.length),
    ...(typeof supply === 'string' ? { source_supply: BigInt(supply) } : {}),
    url: base,
    method: `Blockscout /api/v2/tokens/${token}/holders, ${PAGE_SIZE} rows a page: who, and the holder count; read after the block, not pinned to it`,
    kind: 'api',
  };
}

async function listFromReplay(
  target: Pick<HolderTarget, 'chain' | 'token' | 'from_block'>,
  reader: EvmReader,
  block: number,
  keep: number,
  opts: PullHoldersOptions,
  stats: HyperSyncStats,
): Promise<HolderList> {
  const { chain, token } = target;
  const filter = { address: token, topics: [TRANSFER] };
  const from = target.from_block ?? 0;
  const useRpc = chain.wide_logs;
  if (!useRpc && !opts.hypersyncToken)
    throw new InputError(
      'cannot_read',
      `${chain.name} has no keyless route to a token's holders: Blockscout answers 403 and no keyless endpoint serves wide logs`,
      { hint: 'pull it with ENVIO_API_TOKEN set (HyperSync), or read a stored snapshot' },
    );
  const pages = useRpc
    ? reader.logPages(filter, from, block)
    : hypersyncLogPages(chain, filter, from, block, {
        token: opts.hypersyncToken as string,
        stats,
        ...(opts.hypersyncFetch ? { fetch: opts.hypersyncFetch } : {}),
        ...(opts.sleep ? { sleep: opts.sleep } : {}),
        ...(opts.maxQueries !== undefined ? { maxQueries: opts.maxQueries } : {}),
      });
  const replay = newTransferReplay();
  let shown = 0;
  for await (const page of pages) {
    applyTransfers(replay, page);
    if (replay.logs - shown >= 50_000) {
      shown = replay.logs;
      opts.onProgress?.({
        stage: 'fetching',
        message: `${grouped(replay.logs)} logs, ${grouped(replay.balances.size)} addresses`,
      });
    }
  }
  const positive = [...replay.balances.entries()].filter(([, v]) => v > 0n);
  const top = positive
    .sort(([a, x], [b, y]) => (x > y ? -1 : x < y ? 1 : a < b ? -1 : 1))
    .slice(0, keep)
    .map(([address, listed]) => ({ address, listed }));
  return {
    source: 'replay',
    holders: top,
    total: positive.length,
    sum: positive.reduce((a, [, v]) => a + v, 0n),
    logs: replay.logs,
    url: useRpc ? reader.servedBy('logs') : chain.hypersync,
    method: useRpc
      ? `eth_getLogs on ${token}: every Transfer up to the block, summed per address`
      : `HyperSync with an Envio API token (not keyless): every Transfer of ${token} up to the block, summed per address`,
    kind: useRpc ? 'chain' : 'api',
  };
}

function checkFailed(target: { chain: EvmChain; token: string }, what: string): never {
  throw new InputError('source_failed', `${target.token} on ${target.chain.name}: ${what}`);
}

/** Read the snapshot and check it. Throws when a check fails; a small difference is stated. */
export async function pullErc20Holders(
  target: HolderTarget,
  opts: PullHoldersOptions = {},
): Promise<{ snapshot: Snapshot; checks: HoldersChecks }> {
  const { chain, token } = target;
  const keep = opts.keep ?? HOLDERS_KEPT;
  const reader =
    opts.reader ??
    evmReader({
      chain,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
      ...(opts.sleep ? { sleep: opts.sleep } : {}),
      ...(opts.maxLogCalls !== undefined ? { maxLogCalls: opts.maxLogCalls } : {}),
    });
  const say = (message: string) => opts.onProgress?.({ stage: 'fetching', message });

  const at = await reader.block(opts.block ?? 'finalized');
  const facts = await reader.multicall(
    ['symbol()', 'decimals()', 'totalSupply()'].map((sig) => ({
      to: token,
      data: encodeCall(sig),
    })),
    at.number,
  );
  const [symbolAnswer, decimalsAnswer, supplyAnswer] = facts;
  if (!symbolAnswer?.ok || !decimalsAnswer?.ok || !supplyAnswer?.ok || supplyAnswer.data === '0x')
    throw new InputError(
      'cannot_read',
      `${token} on ${chain.name} does not answer as an ERC-20: symbol(), decimals() or totalSupply() failed`,
      { hint: 'check the chain and the token address' },
    );
  const symbol = tokenText(symbolAnswer.data);
  const decimals = Number(wordAt(decimalsAnswer.data, 0));
  const supply = wordAt(supplyAnswer.data, 0);

  say(`listing the holders of ${symbol} on ${chain.name}`);
  const hypersync: HyperSyncStats = { queries: 0, rate_limit_waits: 0 };
  const asked = opts.list ?? target.list;
  const source = asked ?? (chain.blockscout ? 'blockscout' : 'replay');
  const replayList = () => listFromReplay(target, reader, at.number, keep, opts, hypersync);
  let list: HolderList;
  if (source === 'replay') list = await replayList();
  else {
    try {
      list = await listFromBlockscout(chain, token, keep, opts);
    } catch (e) {
      // Blockscout has refused or dropped this client before. Unless it was asked for by name, a
      // replay can still answer for a token with a short history.
      if (asked || !(e instanceof InputError)) throw e;
      say(`${e.message}; reading the Transfer logs instead`);
      list = await replayList();
    }
  }

  say(`reading balanceOf for ${list.holders.length} holders at block ${at.number}`);
  const answers = await reader.multicall(
    list.holders.map((h) => ({
      to: token,
      data: encodeCall('balanceOf(address)', h.address),
    })),
    at.number,
  );
  const rows = list.holders
    .map((h, i) => {
      const a = answers[i];
      if (!a?.ok) checkFailed(target, `balanceOf(${h.address}) failed`);
      return { ...h, amount: wordAt(a.data, 0) };
    })
    .filter((r) => r.amount > 0n)
    .sort((x, y) =>
      x.amount > y.amount ? -1 : x.amount < y.amount ? 1 : x.address < y.address ? -1 : 1,
    );
  const listedSum = rows.reduce((a, r) => a + r.amount, 0n);
  const tail = supply - listedSum;
  if (tail < 0n)
    checkFailed(target, `the listed holders hold ${listedSum}, over totalSupply() ${supply}`);
  const replayDifference = list.sum !== undefined ? list.sum - supply : undefined;
  if (
    replayDifference !== undefined &&
    (replayDifference < 0n ? -replayDifference : replayDifference) * MAX_DIFFERENCE_DIVISOR > supply
  )
    checkFailed(target, `the replay sums to ${list.sum}, totalSupply() is ${supply}`);

  const tailHolders = Math.max(0, list.total - rows.length);
  const smallest = rows.at(-1)?.amount ?? 0n;
  // The tail is everyone smaller than the smallest listed holder, so it must fit under it. Twice
  // over, because a list that is not pinned to the block can be off by what moved since.
  if (tail > 0n && tail > BigInt(tailHolders || 1) * smallest * 2n)
    checkFailed(
      target,
      `${tail} is left over for ${tailHolders} holders smaller than ${smallest}: the list is not the top`,
    );

  let differences = 0;
  let differenceSum = 0n;
  for (const r of rows)
    if (r.listed !== r.amount) {
      differences++;
      differenceSum += r.listed > r.amount ? r.listed - r.amount : r.amount - r.listed;
    }
  const sliceRows = tailSlices(tail, tailHolders, smallest);
  const largestSlice = sliceRows[0]?.amount ?? 0n;
  const noSliceOutranks = rows.filter((r) => r.amount >= largestSlice).length;
  const checks: HoldersChecks = {
    block: at.number,
    list: list.source,
    holders_total: list.total,
    listed: rows.length,
    listed_sum_raw: listedSum.toString(),
    tail_raw: tail.toString(),
    total_supply_raw: supply.toString(),
    drawn_vs_supply_raw: (listedSum + tail - supply).toString(),
    ...(replayDifference !== undefined
      ? { replay_vs_supply_raw: replayDifference.toString() }
      : {}),
    ...(list.logs !== undefined ? { logs: list.logs } : {}),
    balance_differences: differences,
    balance_difference_raw: differenceSum.toString(),
    ...(list.source_supply !== undefined
      ? { source_supply_difference_raw: (list.source_supply - supply).toString() }
      : {}),
    slices: sliceRows.length,
    no_slice_outranks: noSliceOutranks,
    ...(hypersync.queries > 0 ? { hypersync } : {}),
    rpc_calls: reader.stats().calls,
  };

  const amountText = (n: bigint) => fromBaseUnits(n, decimals);
  const participants: Participant[] = [];
  const holdings: Holding[] = [];
  const hold = (id: string, raw: bigint): Holding => ({
    participant: id,
    asset: token,
    measure: 'token_balance',
    amount: amountText(raw),
    amount_raw: raw.toString(),
    unit: symbol,
    as_of: at.as_of,
    source: S.state,
  });
  for (const r of rows) {
    participants.push({
      id: r.address,
      label: shortAddress(r.address),
      kind: r.is_contract ? 'contract' : 'unknown',
      identity: null,
      source: S.list,
    });
    holdings.push(hold(r.address, r.amount));
  }
  sliceRows.forEach((slice, i) => {
    const id = `group:tail-${i + 1}`;
    participants.push({
      id,
      label: `part ${i + 1} of ${sliceRows.length} of the other holders`,
      kind: 'group',
      identity: null,
      count: slice.count,
      source: S.list,
      detail: { slice: i + 1, of: sliceRows.length },
    });
    holdings.push(hold(id, slice.amount));
  });

  const percent = supply > 0n ? percent2(tail, supply) : '0.00';
  const provenance =
    list.source === 'blockscout'
      ? `Who: the ${rows.length} largest of ${grouped(list.total)} holders on Blockscout, read after this block and not pinned to it, so this is not a final snapshot. ` +
        `Check: listed holders plus the tail equal totalSupply() by construction, because the tail is what the listed holders leave. Independent of that: Blockscout's total supply differs from totalSupply() by ${amountText(list.source_supply !== undefined ? (list.source_supply > supply ? list.source_supply - supply : supply - list.source_supply) : 0n)}, and balanceOf differs from Blockscout's figure for ${differences} of ${rows.length} holders, by ${amountText(differenceSum)} in all. `
      : `Who: every Transfer log up to this block, ${grouped(list.logs ?? 0)} logs, summed per address: ${grouped(list.total)} holders. ` +
        `Check: the replayed balances sum to ${amountText(list.sum ?? 0n)}, ${replayDifference === 0n ? 'equal to' : `${amountText((replayDifference ?? 0n) < 0n ? -(replayDifference ?? 0n) : (replayDifference ?? 0n))} ${(replayDifference ?? 0n) > 0n ? 'above' : 'below'}`} totalSupply(), and balanceOf differs from the replay for ${differences} of ${rows.length} listed holders. `;
  const sources: Snapshot['sources'] = [
    {
      id: S.list,
      kind: list.kind,
      url: list.url,
      method: list.method,
      fetched_at: at.as_of,
      block_height: at.number,
    },
    {
      id: S.state,
      kind: 'chain',
      url: reader.servedBy('state'),
      method:
        'balanceOf(address), totalSupply(), decimals() and symbol() through Multicall3, pinned to the block',
      fetched_at: at.as_of,
      block_height: at.number,
    },
  ];
  const total = amountText(supply);
  const snapshot: Snapshot = {
    petal: 'snapshot/v1',
    network: {
      id: target.id,
      chain: chain.caip2,
      population: target.population,
      title: target.title,
      description: `The largest holders of ${symbol} on ${chain.name} at one block, read from the chain, plus a declared tail. Balances only: no votes, no names.`,
      params: { chain: chain.id, token },
    },
    snapshot: {
      as_of: at.as_of,
      block_height: at.number,
      block_hash: at.hash,
      final: list.source === 'replay',
    },
    coverage: {
      participants_total: list.total,
      participants_included: list.total,
      amount_total: total,
      amount_included: total,
      unit: symbol,
      measure: 'token_balance',
      ...(sliceRows.length > 0
        ? {
            grouped: [
              {
                rule: `the other ${grouped(tailHolders)} holders are stored as ${grouped(sliceRows.length)} equal slices of their total, none larger than the holder ranked ${grouped(noSliceOutranks)}. A slice is a piece of a total and describes no real holder`,
                rows_folded: tailHolders,
                amount: amountText(tail),
              },
            ],
          }
        : {}),
      note:
        `Balances of ${symbol} on ${chain.name} at block ${grouped(at.number)} (${dayOf(at.as_of)}): balanceOf for the listed holders, totalSupply() for the whole. ` +
        provenance +
        `The tail is ${amountText(tail)} ${symbol}, ${percent}% of totalSupply(). ` +
        'No labels: nothing here names an address. Kind says only whether the list marks it as a contract. ' +
        'Not known: who controls an address, whether one holds for many people (an exchange, a pool), or whether many belong to one. These are balances, not votes.',
    },
    sources,
    participants,
    holdings,
    relationships: [],
    events: [],
    module: { id: ERC20_HOLDERS_ID, version: ERC20_HOLDERS_VERSION },
  };
  return { snapshot, checks };
}

/** A stored token. `fixtures` is the folder holding index.json. */
export function erc20HoldersStored(t: HolderTarget, opts: { fixtures?: string } = {}): InputModule {
  const reads = storedReads(t.id, opts);
  return {
    descriptor: holdersDescriptor(t),
    resolveAt: (at) => reads.resolveAt(at),
    fetch: (at, _params, onProgress) => reads.fetch(at, onProgress),
  };
}

const TOKEN_PATTERN = '^0x[0-9a-fA-F]{40}$';

export function liveTarget(params: Params | undefined): HolderTarget {
  const chain = EVM_CHAINS[String(params?.chain)];
  const token = String(params?.token ?? '').toLowerCase();
  if (!chain || !new RegExp(TOKEN_PATTERN).test(token))
    throw new InputError('bad_input', 'erc20-holders needs a chain and a token address', {
      hint: `chain: ${Object.keys(EVM_CHAINS).join(', ')}; token: 0x and 40 hex digits`,
    });
  return {
    id: ERC20_HOLDERS_ID,
    chain,
    token,
    title: 'ERC-20 holders',
    // not the stored targets' population: a stored data set carries another network id
    population: `erc20-token-${chain.id}-${token}`,
  };
}

export const ERC20_HOLDERS_DESCRIPTOR: NetworkDescriptor = {
  id: ERC20_HOLDERS_ID,
  chain: ETHEREUM.caip2,
  population: 'erc20-holders',
  kind: 'other',
  title: 'ERC-20 holders, any token',
  description:
    'The largest holders of any ERC-20 token on Ethereum, Base or Arbitrum, chosen by chain and token address, read now. Ethereum answers in seconds for any token. Arbitrum only for a token with a short history. Base only with an Envio token, and only a short history.',
  params: {
    chain: {
      required: true,
      description: 'ethereum, base or arbitrum',
      pattern: '^(ethereum|base|arbitrum)$',
      example: 'ethereum',
    },
    token: {
      required: true,
      description: 'the token contract address',
      pattern: TOKEN_PATTERN,
      example: PEPE_ETHEREUM.token,
    },
  },
  capabilities: capabilities('token', 'token balance'),
  live: true,
  cost: {
    calls: 10,
    seconds: 8,
    note: 'Ethereum, any token: about 10 keyless calls in about 8 s. Arbitrum: 2 calls per 20,000 Transfer logs, stopped at 20 calls. Base: HyperSync with a token, 15 queries a minute, about 2,000 logs a query, stopped at 15 queries.',
  },
  sources: [
    { id: S.list, kind: 'api', url: ETHEREUM.blockscout ?? '' },
    { id: S.state, kind: 'chain', url: ETHEREUM.endpoints[0]?.url ?? '' },
  ],
};

/** Any token, read now. Only "latest": the holder lists have no history. */
export function erc20HoldersLive(
  opts: { fetch?: typeof globalThis.fetch; sleep?: (ms: number) => Promise<void> } = {},
): InputModule {
  return {
    descriptor: ERC20_HOLDERS_DESCRIPTOR,
    keyFor: (params) => {
      const t = liveTarget(params);
      return { chain: t.chain.caip2, population: t.population };
    },
    async resolveAt(at: At, params?: Params): Promise<ResolvedAt> {
      const t = liveTarget(params);
      if (parseAt(at).kind !== 'latest')
        throw new InputError(
          'cannot_read',
          'erc20-holders reads the latest block only: the holder lists have no history',
          { hint: 'ask for "latest"' },
        );
      const b = await evmReader({
        chain: t.chain,
        ...(opts.fetch ? { fetch: opts.fetch } : {}),
        ...(opts.sleep ? { sleep: opts.sleep } : {}),
      }).block('finalized');
      return { block_height: b.number, as_of: b.as_of };
    },
    async fetch(at, params, onProgress) {
      const target = liveTarget(params);
      const token = process.env.ENVIO_API_TOKEN;
      const { snapshot } = await pullErc20Holders(target, {
        block: at.block_height,
        maxLogCalls: LIVE_LOG_CALLS,
        maxQueries: LIVE_HYPERSYNC_QUERIES,
        ...(token ? { hypersyncToken: token } : {}),
        ...(opts.fetch ? { fetch: opts.fetch } : {}),
        ...(opts.sleep ? { sleep: opts.sleep } : {}),
        ...(onProgress ? { onProgress } : {}),
      });
      return snapshot;
    },
  };
}
