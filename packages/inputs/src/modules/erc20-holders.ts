// erc20-holders (T162): the holders of any ERC-20 token on Ethereum or an L2, chosen by chain and
// token address, plus a declared tail. One code path; only where the list of addresses comes from
// differs (./evm/chains.ts says why by chain):
//   blockscout  the holders pages of an explorer that answers keyless: the true top, any token.
//   window      the default where Blockscout does not answer: the addresses in Transfer logs of
//               the last 7 days. Not every holder: an address that did not move tokens in the
//               window is missing, however much it holds, and the coverage says so.
//   full        every Transfer log, summed per address: every holder. Only with an explicit flag
//               on the offline pull-module.ts, never in a chat. Cost grows with the token's history.
// Either way the amounts in the snapshot are balanceOf at one finalized block, read from the chain.
//
// The check, plainly. Drawn holdings plus the tail equal totalSupply() in every snapshot. Only with
// a full replay is that a real test, because the replayed balances are summed on their own. With
// Blockscout and with a window the tail is what the drawn holdings leave, so the sum cannot fail;
// there the tail is declared as such, and each drawn balance is what the chain answers.
//
// No count of a token's logs exists before reading them, so a window replay stops at a log budget.
//
// No labels: Blockscout shows tags and names; they are not read. Kind says only whether Blockscout
// marks the address as a contract.
import type {
  Holding,
  NetworkDescriptor,
  Params,
  Participant,
  Progress,
  Snapshot,
} from '@petal/core/types';
import { InputError } from '../errors.ts';
import { addressOf, encodeCall, eventTopic, shortAddress, stringAt, wordAt } from '../evm/abi.ts';
import { ETHEREUM, EVM_CHAINS, type EvmChain } from '../evm/chains.ts';
import { type HyperSyncStats, hypersyncLogPages } from '../evm/hypersync.ts';
import { type EvmLog, type EvmReader, evmReader } from '../evm/reader.ts';
import { fromBaseUnits } from '../import/spike.ts';
import type { InputModule } from '../index.ts';
import { dayOf, grouped, percent2, plainCapabilities } from './plain.ts';
import { paramModule } from './stored.ts';

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
export const DEFAULT_WINDOW_DAYS = 7;
/**
 * Where a window replay stops and says so. A chat's tool call has 120 s: about 200,000 logs is
 * under 40 s on a keyless gateway, and 30,000 is one minute's budget on HyperSync's free plan.
 */
export const REPLAY_LOG_BUDGET = { rpc: 200_000, hypersync: 30_000 };
const MAX_WINDOW_ADDRESSES = 20_000;
const MAX_WINDOW_CALLS = 400;

const S = { list: 'erc20-holder-list', state: 'erc20-state' } as const;

export interface HolderTarget {
  chain: EvmChain;
  /** lowercase */
  token: string;
  population: string;
  /** a block before the token's first transfer, default 0 */
  from_block?: number;
}

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
 * is a piece of a total. `count` is how many holders the tail has, or null when that is not known;
 * a group row must carry a number, so then each slice counts as 1. The amounts add up exactly.
 */
export function tailSlices(
  amount: bigint,
  count: number | null,
  floor: bigint,
  max = MAX_SLICES,
): { amount: bigint; count: number }[] {
  if (amount <= 0n) return [];
  const wanted = floor > 0n ? (amount + floor - 1n) / floor : 1n;
  const capped = Number(wanted > BigInt(max) ? BigInt(max) : wanted);
  const slices = Math.max(1, count === null ? capped : Math.min(capped, count || 1));
  const each = amount / BigInt(slices);
  const extra = Number(amount % BigInt(slices));
  const people = Math.floor((count ?? 0) / slices);
  const morePeople = (count ?? 0) % slices;
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
  /** every holder, where the list knows them; null for a window */
  holders_total: number | null;
  /** a window replay: which blocks, and how many addresses with a balance it found */
  window?: { days: number; from_block: number; from_as_of: string; with_balance: number };
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
  /** what the list says the holder has; a window does not know */
  listed?: bigint;
  is_contract?: boolean;
}

interface HolderList {
  source: 'blockscout' | 'replay';
  holders: ListedHolder[];
  /** every holder, when the source knows them */
  total: number | null;
  window?: { days: number; from_block: number; from_as_of: string };
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
  /** a replay's window, default 7 days */
  windowDays?: number;
  /** read every Transfer log there is. Offline only (pull-module.ts --full), never in a chat */
  full?: boolean;
  /** overrides REPLAY_LOG_BUDGET */
  maxLogs?: number;
  maxLogCalls?: number;
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
  const full = opts.full === true;
  const days = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const from = full
    ? (target.from_block ?? 0)
    : Math.max(0, block - Math.ceil((days * 86_400) / chain.block_seconds));
  const useHyperSync = !chain.wide_logs && Boolean(opts.hypersyncToken);
  const offline = 'read the whole history offline with pull-module.ts --full, never in a chat';
  if (full && !chain.wide_logs && !useHyperSync)
    throw new InputError(
      'cannot_read',
      `${chain.name} has no keyless route to a token's whole history: Blockscout answers 403 and no keyless endpoint serves wide logs`,
      { hint: 'pull it with ENVIO_API_TOKEN set (HyperSync), or read a stored snapshot' },
    );
  // The one size known before reading: how many calls a narrow endpoint needs for this range.
  const chunkCalls = chain.log_chunk_blocks
    ? Math.ceil((block - from + 1) / chain.log_chunk_blocks)
    : 0;
  if (!full && !useHyperSync && chunkCalls > MAX_WINDOW_CALLS)
    throw new InputError(
      'cannot_read',
      `${days} days on ${chain.name} is ${grouped(chunkCalls)} keyless log calls, over the limit of ${MAX_WINDOW_CALLS}`,
      { hint: 'ask for a shorter window_days, or set ENVIO_API_TOKEN (HyperSync)' },
    );
  const pages = useHyperSync
    ? hypersyncLogPages(chain, filter, from, block, {
        token: opts.hypersyncToken as string,
        stats,
        ...(opts.hypersyncFetch ? { fetch: opts.hypersyncFetch } : {}),
        ...(opts.sleep ? { sleep: opts.sleep } : {}),
      })
    : reader.logPages(filter, from, block);
  const budget =
    opts.maxLogs ?? (useHyperSync ? REPLAY_LOG_BUDGET.hypersync : REPLAY_LOG_BUDGET.rpc);
  const replay = newTransferReplay();
  let shown = 0;
  for await (const page of pages) {
    applyTransfers(replay, page);
    if (!full && replay.logs > budget)
      throw new InputError(
        'cannot_read',
        `${token} on ${chain.name} has more than ${grouped(budget)} Transfer logs in the last ${days} days: stopped there, with ${grouped(replay.logs)} read`,
        { hint: `ask for a shorter window_days, or ${offline}` },
      );
    if (replay.logs - shown >= 50_000) {
      shown = replay.logs;
      opts.onProgress?.({
        stage: 'fetching',
        message: `${grouped(replay.logs)} logs, ${grouped(replay.balances.size)} addresses`,
      });
    }
  }
  const route = useHyperSync
    ? `HyperSync with an Envio API token (not keyless): Transfer logs of ${token}`
    : `eth_getLogs on ${token}: Transfer logs`;
  const where = {
    url: useHyperSync ? chain.hypersync : reader.servedBy('logs'),
    kind: (useHyperSync ? 'api' : 'chain') as 'api' | 'chain',
  };
  if (!full) {
    if (replay.balances.size > MAX_WINDOW_ADDRESSES)
      throw new InputError(
        'cannot_read',
        `${grouped(replay.balances.size)} addresses moved ${token} on ${chain.name} in the last ${days} days, over the limit of ${grouped(MAX_WINDOW_ADDRESSES)}`,
        { hint: `ask for a shorter window_days, or ${offline}` },
      );
    const start = await reader.block(from);
    return {
      source: 'replay',
      holders: [...replay.balances.keys()].sort().map((address) => ({ address })),
      total: null,
      logs: replay.logs,
      window: { days, from_block: from, from_as_of: start.as_of },
      method: `${route} of the last ${days} days, for the addresses in them`,
      ...where,
    };
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
    method: `${route}, every one up to the block, summed per address`,
    ...where,
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
  const asked = opts.list;
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
  const withBalance = list.holders
    .map((h, i) => {
      const a = answers[i];
      if (!a?.ok) checkFailed(target, `balanceOf(${h.address}) failed`);
      return { ...h, amount: wordAt(a.data, 0) };
    })
    .filter((r) => r.amount > 0n)
    .sort((x, y) =>
      x.amount > y.amount ? -1 : x.amount < y.amount ? 1 : x.address < y.address ? -1 : 1,
    );
  const rows = withBalance.slice(0, keep);
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

  const tailHolders = list.total === null ? null : Math.max(0, list.total - rows.length);
  const smallest = rows.at(-1)?.amount ?? 0n;
  // The tail is everyone smaller than the smallest listed holder, so it must fit under it. Twice
  // over, because a list that is not pinned to the block can be off by what moved since. A window
  // makes no such claim: its holders are the active ones, not the top.
  if (tailHolders !== null && tail > 0n && tail > BigInt(tailHolders || 1) * smallest * 2n)
    checkFailed(
      target,
      `${tail} is left over for ${tailHolders} holders smaller than ${smallest}: the list is not the top`,
    );

  let differences = 0;
  let differenceSum = 0n;
  for (const r of rows)
    if (r.listed !== undefined && r.listed !== r.amount) {
      differences++;
      differenceSum += r.listed > r.amount ? r.listed - r.amount : r.amount - r.listed;
    }
  // A window's tail is not read at all, so it stays one row: nothing to slice it by, and a petal
  // saying how much was not read is the honest picture.
  const sliceRows = list.window
    ? tail > 0n
      ? [{ amount: tail, count: 1 }]
      : []
    : tailSlices(tail, tailHolders, smallest);
  const largestSlice = sliceRows[0]?.amount ?? 0n;
  const noSliceOutranks = rows.filter((r) => r.amount >= largestSlice).length;
  const checks: HoldersChecks = {
    block: at.number,
    list: list.source,
    holders_total: list.total,
    ...(list.window ? { window: { ...list.window, with_balance: withBalance.length } } : {}),
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
    const id = list.window ? 'group:not-read' : `group:tail-${i + 1}`;
    participants.push({
      id,
      label: list.window
        ? 'supply not read'
        : `part ${i + 1} of ${sliceRows.length} of the other holders`,
      kind: 'group',
      identity: null,
      count: slice.count,
      source: S.list,
      detail: { slice: i + 1, of: sliceRows.length },
    });
    holdings.push(hold(id, slice.amount));
  });

  const percent = supply > 0n ? percent2(tail, supply) : '0.00';
  const w = list.window;
  const provenance = w
    ? `Who: only addresses in a Transfer log between block ${grouped(w.from_block)} (${w.from_as_of}) and this block, the last ${w.days} days: ${grouped(list.logs ?? 0)} logs, ${grouped(withBalance.length)} addresses with a balance, the largest ${rows.length} drawn. This is not every holder: an address that did not move tokens in the window is missing, however much it holds, so the largest holders may not be here. ` +
      `Check: drawn holdings plus the tail equal totalSupply() by construction, and each drawn amount is what balanceOf answers at this block. The tail is totalSupply() minus the drawn holdings: it was not read, it is not attributed to anyone, and how many addresses hold it is not known. `
    : list.source === 'blockscout'
      ? `Who: the ${rows.length} largest of ${grouped(list.total ?? 0)} holders on Blockscout, read after this block and not pinned to it, so this is not a final snapshot. ` +
        `Check: listed holders plus the tail equal totalSupply() by construction, because the tail is what the listed holders leave. Independent of that: Blockscout's total supply differs from totalSupply() by ${amountText(list.source_supply !== undefined ? (list.source_supply > supply ? list.source_supply - supply : supply - list.source_supply) : 0n)}, and balanceOf differs from Blockscout's figure for ${differences} of ${rows.length} holders, by ${amountText(differenceSum)} in all. `
      : `Who: every Transfer log up to this block, ${grouped(list.logs ?? 0)} logs, summed per address: ${grouped(list.total ?? 0)} holders. ` +
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
      id: ERC20_HOLDERS_ID,
      chain: chain.caip2,
      population: target.population,
      title: `${symbol} ${w ? 'active holders' : 'holders'}, ${chain.name}`,
      description: w
        ? `Addresses that moved ${symbol} on ${chain.name} in the last ${w.days} days and what they hold, read from the chain. Not every holder: the rest of the supply is not attributed.`
        : `The largest holders of ${symbol} on ${chain.name} at one block, read from the chain, plus a declared tail. Balances only: no votes, no names.`,
      params: {
        chain: chain.id,
        token,
        window_days: opts.full ? 'full' : String(w?.days ?? opts.windowDays ?? DEFAULT_WINDOW_DAYS),
      },
    },
    snapshot: {
      as_of: at.as_of,
      block_height: at.number,
      block_hash: at.hash,
      // Blockscout's list is not pinned to the block; everything in a replay is.
      final: list.source === 'replay',
    },
    coverage: {
      participants_total: list.total ?? withBalance.length,
      participants_included: list.total ?? rows.length,
      amount_total: total,
      amount_included: w ? amountText(listedSum) : total,
      unit: symbol,
      measure: 'token_balance',
      ...(sliceRows.length > 0
        ? {
            grouped: [
              {
                rule: w
                  ? 'totalSupply() minus the drawn holdings was not read and is one row. It describes no real holder, and it counts as 1 only because a group row must carry a number'
                  : `the other ${grouped(tailHolders ?? 0)} holders are stored as ${grouped(sliceRows.length)} equal slices of their total, none larger than the holder ranked ${grouped(noSliceOutranks)}. A slice is a piece of a total and describes no real holder`,
                rows_folded: tailHolders ?? 0,
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

const TOKEN_PATTERN = '^0x[0-9a-fA-F]{40}$';

// 1 to 30 days, or "full": only a stored fixture can answer that, a live read refuses it.
const WINDOW_PATTERN = '^([1-9]|[12][0-9]|30|full)$';

const windowOf = (params: Params | undefined): string =>
  params?.window_days ?? String(DEFAULT_WINDOW_DAYS);

export function holdersTarget(params: Params | undefined): HolderTarget {
  const chain = EVM_CHAINS[String(params?.chain)];
  const token = String(params?.token ?? '').toLowerCase();
  if (!chain || !new RegExp(TOKEN_PATTERN).test(token))
    throw new InputError('bad_input', 'erc20-holders needs a chain and a token address', {
      hint: `chain: ${Object.keys(EVM_CHAINS).join(', ')}; token: 0x and 40 hex digits`,
    });
  const window = windowOf(params);
  return {
    chain,
    token,
    population: `erc20-token-${chain.id}-${token}-${window === 'full' ? 'full' : `${window}d`}`,
  };
}

export const ERC20_HOLDERS_DESCRIPTOR: NetworkDescriptor = {
  id: ERC20_HOLDERS_ID,
  chain: ETHEREUM.caip2,
  population: 'erc20-holders',
  kind: 'other',
  title: 'ERC-20 holders, any token',
  description:
    'Holders of any ERC-20 token on Ethereum, Base or Arbitrum, chosen by chain and token address, read now. Where Blockscout answers: the largest holders. Otherwise only the addresses that moved the token in the last window_days, default 7, and the rest of the supply is not attributed.',
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
      example: '0x6982508145454ce325ddbe47a25d4ec3d2311933',
    },
    window_days: {
      required: false,
      description:
        'days of Transfer logs to read where a replay is used, 1 to 30, default 7; "full" only finds a stored whole-history read',
      pattern: WINDOW_PATTERN,
      example: '7',
      default: '7',
    },
  },
  capabilities: capabilities('token', 'token balance'),
  live: true,
  cost: {
    calls: 10,
    seconds: 8,
    note: 'Ethereum through Blockscout: about 10 keyless calls in about 8 s. A week of logs: a few keyless calls on Arbitrum and Ethereum; on Base 303 keyless calls in about 80 s, or a few HyperSync queries with a token. Stops at 200,000 logs (30,000 on HyperSync) and says so.',
  },
  sources: [
    { id: S.list, kind: 'api', url: ETHEREUM.blockscout ?? '' },
    { id: S.state, kind: 'chain', url: ETHEREUM.endpoints[0]?.url ?? '' },
  ],
};

/** Any token, read now. `fixtures` is the folder holding index.json (default: this repo's). */
export function erc20Holders(
  opts: {
    fixtures?: string;
    fetch?: typeof globalThis.fetch;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): InputModule {
  return paramModule({
    descriptor: ERC20_HOLDERS_DESCRIPTOR,
    keyFor: (params) => {
      const t = holdersTarget(params);
      return { chain: t.chain.caip2, population: t.population };
    },
    pinnable: false,
    head: async (params) => {
      const b = await evmReader({
        chain: holdersTarget(params).chain,
        ...(opts.fetch ? { fetch: opts.fetch } : {}),
        ...(opts.sleep ? { sleep: opts.sleep } : {}),
      }).block('finalized');
      return { block_height: b.number, as_of: b.as_of };
    },
    pull: async (at, params, onProgress) => {
      if (windowOf(params) === 'full')
        throw new InputError('cannot_read', 'no stored whole-history read of this token', {
          hint: 'a whole history is an offline pull (pull-module.ts --full), never in a chat; or leave out window_days',
        });
      const token = process.env.ENVIO_API_TOKEN;
      const { snapshot } = await pullErc20Holders(holdersTarget(params), {
        block: at.block_height,
        windowDays: Number(windowOf(params)),
        ...(token ? { hypersyncToken: token } : {}),
        ...(opts.fetch ? { fetch: opts.fetch } : {}),
        ...(opts.sleep ? { sleep: opts.sleep } : {}),
        ...(onProgress ? { onProgress } : {}),
      });
      return snapshot;
    },
    ...(opts.fixtures ? { fixtures: opts.fixtures } : {}),
  });
}
