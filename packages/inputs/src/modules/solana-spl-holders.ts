// solana-spl-holders (T158): who holds an SPL token at one moment, as wallets (owners), not token
// accounts. The target is a parameter: `mint`, any mint on the classic Token Program. A fixture with
// the same parameter answers first. Otherwise pullSplHolders reads it: one getProgramAccounts call,
// streamed by scanHolders, getTokenSupply before and after, the slot's time and the owner program
// of the top 100 wallets. It reads current state, not history. A scan over 200 MB stops and says so
// unless the offline pull lifts that: a large token's answer is hundreds of MB.
//
// Providers, tested 2026-11-05: the official RPC is documented and answers this call for a mint
// with 404 token accounts in 0.3 s. Its size limit on a large answer was not tested, because a
// TRUMP read is too big to repeat for that. Solana Vibe Station answered TRUMP and MELANIA whole,
// but publishes no terms, so it comes second and a snapshot names whichever one answered.
//
// Check: the wallets sum to getTokenSupply, or the difference is stated. A difference over 1 part
// in 10,000 throws: that is a broken read, not a moving chain.
//
// What this does not hold: labels, launch history, or anything about who controls a wallet.
import { runSignal } from '@petal/core';
import type {
  Holding,
  NetworkDescriptor,
  Params,
  Participant,
  Progress,
  Snapshot,
} from '@petal/core/types';
import { InputError } from '../errors.ts';
import { fromBaseUnits } from '../import/spike.ts';
import type { InputModule } from '../index.ts';
import { type RpcEndpoint, RpcError, type RpcPool, rpcPool } from '../rpc/pool.ts';
import {
  type FoldedHolders,
  foldHolders,
  fromBase58,
  type HolderScan,
  scanHolders,
} from '../solana/holders.ts';
import { dayOf, grouped, plainCapabilities } from './plain.ts';
import { paramModule } from './stored.ts';

export const SOLANA_CHAIN = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
export const SOLANA_OFFICIAL = 'https://api.mainnet-beta.solana.com';
export const SOLANA_VIBE_STATION = 'https://public.rpc.solanavibestation.com/';
/** Helius's RPC (a free key): its key follows in the query and is never written anywhere. */
export const HELIUS_RPC = 'https://mainnet.helius-rpc.com';
export const SPL_MODULE_ID = 'solana-spl-holders';
export const SPL_MODULE_VERSION = 'solana/1';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
/** Wallets kept individually in a snapshot; the rest are folded into rank bands. */
export const SPL_KEEP = 1000;
const OWNER_LOOKUP = 100;
/** A mint's symbol is not on the token account or the mint. */
const UNIT = 'tokens';
const MAX_DIFFERENCE_DIVISOR = 10_000n;
const STREAM_IDLE_MS = 60_000;
/** Where a scan stops unless the caller lifts it: about 30 s of reading on what was measured. */
const SCAN_BYTE_BUDGET = 200_000_000;

const SOLANA_ENDPOINTS: readonly RpcEndpoint[] = [
  { id: 'solana-official', url: SOLANA_OFFICIAL, intervalMs: 500 },
];

/** Tried in order for the holder scan. */
export const HOLDER_SCAN_URLS = [SOLANA_OFFICIAL, SOLANA_VIBE_STATION] as const;

const S = {
  scan: 'spl-token-accounts',
  supply: 'spl-token-supply',
  owners: 'spl-wallet-owner-program',
} as const;

const MINT_PATTERN = '^[1-9A-HJ-NP-Za-km-z]{32,44}$';

/** The mint in a request's parameters. */
export function splMint(params: Params | undefined): string {
  const mint = String(params?.mint ?? '');
  if (!new RegExp(MINT_PATTERN).test(mint))
    throw new InputError('bad_input', 'solana-spl-holders needs a mint address', {
      hint: 'mint: a base58 public key',
    });
  return mint;
}

export const SPL_DESCRIPTOR: NetworkDescriptor = {
  id: SPL_MODULE_ID,
  chain: SOLANA_CHAIN,
  population: 'spl-holders',
  kind: 'other',
  title: 'SPL token holders',
  description:
    'Wallets holding an SPL token on Solana at one moment, read from the chain. Holdings only: no votes, no names, no launch history. Give the mint address.',
  params: {
    mint: {
      required: true,
      description: 'the token mint address',
      pattern: MINT_PATTERN,
      example: '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN',
    },
  },
  capabilities: plainCapabilities({
    measure: { id: 'token_balance', unit: 'tokens', label: 'token balance' },
    sources: [S.scan],
    kind: {
      meaning:
        'contract when a program owns the address (read for the top 100 wallets), unknown otherwise',
      sources: [S.owners],
    },
    identity: {
      meaning: 'anonymous: no source read here names a wallet',
      sources: [S.scan],
    },
  }),
  live: true,
  cost: {
    calls: 6,
    seconds: 5,
    note: 'a read of current state, not history. About 6 keyless calls; the holder scan grows with the token, and stops at 200 MB.',
  },
  sources: [
    { id: S.scan, kind: 'chain', url: SOLANA_OFFICIAL },
    { id: S.supply, kind: 'chain', url: SOLANA_OFFICIAL },
    { id: S.owners, kind: 'chain', url: SOLANA_OFFICIAL },
  ],
};

interface Supply {
  slot: number;
  amount: bigint;
  decimals: number;
}

export interface SplChecks {
  slot: number;
  token_accounts: number;
  nonzero_accounts: number;
  wallets: number;
  sum_raw: string;
  supply_before_raw: string;
  supply_before_slot: number;
  supply_after_raw: string;
  supply_after_slot: number;
  /** sum minus the supply read nearest to the scan; zero when they agree */
  difference_raw: string;
}

/** A holder answer stored earlier, instead of asking an endpoint again. */
export interface StoredScan {
  body: AsyncIterable<Uint8Array>;
  url: string;
  /** where the stored answer is */
  imported_from: string;
  /** a supply read taken before the stored answer */
  supply_before: Supply;
}

export interface PullSplOptions {
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
  /** endpoints for the holder scan, default HOLDER_SCAN_URLS */
  scanUrls?: readonly string[];
  stored?: StoredScan;
  keep?: number;
  /** the size where a scan stops, default 200 MB. Offline pulls lift it */
  maxBytes?: number;
  /** Helius's key: its paged token accounts (DAS getTokenAccounts) are read first */
  heliusKey?: string;
  onProgress?: Progress;
}

function pool(opts: PullSplOptions): RpcPool {
  return rpcPool({
    endpoints: SOLANA_ENDPOINTS,
    chainName: 'Solana',
    rounds: 3,
    isAnswer: (e) => /skipped|not available|long-term storage/i.test(String(e.message)),
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
    ...(opts.sleep ? { sleep: opts.sleep } : {}),
  });
}

/** The request body scanHolders expects an answer to. */
export function holderScanRequest(mint: string): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 'petal',
    method: 'getProgramAccounts',
    params: [
      TOKEN_PROGRAM,
      {
        commitment: 'finalized',
        encoding: 'base64',
        dataSlice: { offset: 32, length: 40 },
        filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: mint } }],
        withContext: true,
      },
    ],
  });
}

/**
 * Every token account of the mint from Helius's DAS getTokenAccounts, page by page by its cursor, kept as a
 * running total per owner like the scan. Read over several calls, so it isn't pinned to one slot: the slot
 * is the one Helius had indexed when the first page was read.
 */
async function scanFromHelius(
  mint: string,
  key: string,
  opts: PullSplOptions,
): Promise<{ scan: HolderScan; url: string }> {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const maxBytes = opts.maxBytes ?? SCAN_BYTE_BUDGET;
  const wallets = new Map<string, bigint>();
  let slot: number | null = null;
  let tokenAccounts = 0;
  let nonzero = 0;
  let bytes = 0;
  let cursor: string | undefined;
  for (;;) {
    let text: string;
    try {
      const res = await doFetch(`${HELIUS_RPC}/?api-key=${key}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'petal',
          method: 'getTokenAccounts',
          params: { mint, limit: 1000, ...(cursor ? { cursor } : {}) },
        }),
        signal: runSignal(AbortSignal.timeout(STREAM_IDLE_MS)),
      });
      if (!res.ok) throw new InputError('source_failed', `Helius answered HTTP ${res.status}`);
      text = await res.text();
    } catch (e) {
      if (e instanceof InputError) throw e;
      throw new InputError('source_failed', `Helius did not answer: ${(e as Error).name}`);
    }
    bytes += text.length;
    if (bytes > maxBytes)
      throw new InputError(
        'cannot_read',
        `the holder list of ${mint} is over ${maxBytes / 1_000_000} MB: stopped there`,
        { hint: 'read it offline with pull-module.ts --full, never in a chat' },
      );
    // amounts can pass 2^53: read them as text
    const body = JSON.parse(text.replace(/"amount":(\d+)/g, '"amount":"$1"')) as {
      result?: {
        last_indexed_slot?: number;
        cursor?: string | null;
        token_accounts?: { owner?: string; amount?: string }[];
      };
      error?: { message?: string };
    };
    if (body.error || !body.result)
      throw new InputError(
        'source_failed',
        `Helius refused the token accounts of ${mint}: ${body.error?.message ?? 'no result'}`,
      );
    slot ??= body.result.last_indexed_slot ?? null;
    const page = body.result.token_accounts ?? [];
    for (const a of page) {
      tokenAccounts++;
      const raw = a.amount && /^[0-9]+$/.test(a.amount) ? BigInt(a.amount) : 0n;
      const owner = a.owner ? fromBase58(a.owner) : null;
      if (raw === 0n || !owner) continue;
      nonzero++;
      const k = owner.toString('latin1');
      wallets.set(k, (wallets.get(k) ?? 0n) + raw);
    }
    opts.onProgress?.({
      stage: 'fetching',
      message: `${tokenAccounts} token accounts through Helius`,
    });
    cursor = body.result.cursor || undefined;
    if (!cursor || page.length === 0) break;
  }
  if (slot === null) throw new InputError('source_failed', `Helius gave no slot for ${mint}`);
  return {
    scan: { slot, token_accounts: tokenAccounts, nonzero_accounts: nonzero, bytes, wallets },
    url: HELIUS_RPC,
  };
}

/** Stream the holder scan from the first endpoint that answers it whole. */
async function scanFromEndpoints(
  mint: string,
  opts: PullSplOptions,
): Promise<{ scan: HolderScan; url: string }> {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const failures: string[] = [];
  const maxBytes = opts.maxBytes ?? SCAN_BYTE_BUDGET;
  for (const url of opts.scanUrls ?? HOLDER_SCAN_URLS) {
    const ctrl = new AbortController();
    let tooLarge = false;
    let idle = setTimeout(() => ctrl.abort(), STREAM_IDLE_MS);
    try {
      opts.onProgress?.({ stage: 'fetching', message: `scanning holders through ${url}` });
      const res = await doFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'petal/0.1 (keyless reads)' },
        body: holderScanRequest(mint),
        signal: runSignal(ctrl.signal),
      });
      if (!res.ok || !res.body) {
        failures.push(`${url}: HTTP ${res.status}`);
        continue;
      }
      const scan = await scanHolders(res.body as AsyncIterable<Uint8Array>, (bytes) => {
        clearTimeout(idle);
        idle = setTimeout(() => ctrl.abort(), STREAM_IDLE_MS);
        if (bytes > maxBytes) {
          tooLarge = true;
          ctrl.abort();
          throw new Error('over the size budget');
        }
      });
      return { scan, url };
    } catch (e) {
      if (tooLarge)
        throw new InputError(
          'cannot_read',
          `the holder list of ${mint} is over ${maxBytes / 1_000_000} MB: stopped there`,
          { hint: 'read it offline with pull-module.ts --full, never in a chat' },
        );
      failures.push(`${url}: ${(e as Error).message}`);
    } finally {
      clearTimeout(idle);
    }
  }
  throw new InputError('source_failed', `no endpoint returned every holder of ${mint}`, {
    hint: failures.join('; '),
  });
}

async function readSupply(rpc: RpcPool, mint: string): Promise<Supply> {
  const { result } = await rpc.call<{
    context: { slot: number };
    value: { amount: string; decimals: number };
  }>('getTokenSupply', [mint, { commitment: 'finalized' }]);
  return {
    slot: result.context.slot,
    amount: BigInt(result.value.amount),
    decimals: result.value.decimals,
  };
}

/** The slot's time, or the next produced slot's when this one was skipped. */
async function slotTime(rpc: RpcPool, slot: number): Promise<string> {
  for (let s = slot; s < slot + 6; s++) {
    try {
      const { result } = await rpc.call<number | null>('getBlockTime', [s]);
      if (typeof result === 'number')
        return new Date(result * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    } catch (e) {
      if (!(e instanceof RpcError)) throw e;
    }
  }
  throw new InputError('source_failed', `no block time near Solana slot ${slot}`);
}

/** Which program owns each wallet: `null` when no account exists at the address. */
async function ownerPrograms(
  rpc: RpcPool,
  addresses: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (let i = 0; i < addresses.length; i += OWNER_LOOKUP) {
    const part = addresses.slice(i, i + OWNER_LOOKUP);
    const { result } = await rpc.call<{ value: ({ owner: string } | null)[] }>(
      'getMultipleAccounts',
      [part, { commitment: 'finalized', encoding: 'base64', dataSlice: { offset: 0, length: 0 } }],
    );
    part.forEach((a, j) => {
      out.set(a, result.value[j]?.owner ?? null);
    });
  }
  return out;
}

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

function differenceSentence(
  sum: bigint,
  near: Supply,
  far: Supply,
  decimals: number,
  symbol: string,
) {
  const diff = sum - near.amount;
  const read = (x: Supply) =>
    `getTokenSupply read ${fromBaseUnits(x.amount, decimals)} at slot ${grouped(x.slot)}`;
  const reads =
    near.amount === far.amount
      ? read(near)
      : `${read(near)} and ${fromBaseUnits(far.amount, decimals)} at slot ${grouped(far.slot)}`;
  if (diff === 0n)
    return `Check: the wallets sum to ${fromBaseUnits(sum, decimals)} ${symbol}, equal to the supply: ${reads}.`;
  const abs = diff < 0n ? -diff : diff;
  return (
    `Check: the wallets sum to ${fromBaseUnits(sum, decimals)} ${symbol}, ${fromBaseUnits(abs, decimals)} ${diff > 0n ? 'above' : 'below'} the supply: ${reads}. ` +
    'The cause is not established; this scan is one call over many accounts and is not shown to be atomic.'
  );
}

/** Read every holder of a token and build its snapshot. Throws when the check fails. */
export async function pullSplHolders(
  mint: string,
  opts: PullSplOptions = {},
): Promise<{ snapshot: Snapshot; checks: SplChecks }> {
  const rpc = pool(opts);
  const say = (message: string) => opts.onProgress?.({ stage: 'fetching', message });
  const keep = opts.keep ?? SPL_KEEP;

  const { result: mintAccount } = await rpc.call<{ value: { owner: string } | null }>(
    'getAccountInfo',
    [mint, { commitment: 'finalized', encoding: 'base64', dataSlice: { offset: 0, length: 0 } }],
  );
  if (mintAccount.value?.owner !== TOKEN_PROGRAM)
    throw new InputError(
      'cannot_read',
      `${mint} is not a mint of the classic Token Program (owner ${mintAccount.value?.owner ?? 'none'})`,
      { hint: 'Token-2022 mints are not read by this module yet' },
    );

  const before = opts.stored?.supply_before ?? (await readSupply(rpc, mint));
  const helius = async () => {
    if (!opts.heliusKey) return null;
    try {
      return await scanFromHelius(mint, opts.heliusKey, opts);
    } catch (e) {
      if (!(e instanceof InputError) || e.code === 'cannot_read') throw e;
      say(`${e.message}; scanning through the public endpoints instead`);
      return null;
    }
  };
  const { scan, url } = opts.stored
    ? { scan: await scanHolders(opts.stored.body), url: opts.stored.url }
    : ((await helius()) ?? (await scanFromEndpoints(mint, opts)));
  const paged = url === HELIUS_RPC;
  const after = await readSupply(rpc, mint);
  say(
    `${grouped(scan.token_accounts)} token accounts, ${grouped(scan.wallets.size)} wallets at slot ${grouped(scan.slot)}`,
  );

  const folded: FoldedHolders = foldHolders(scan.wallets, keep);
  // Done with the raw map: only the kept wallets are needed from here.
  const walletCount = scan.wallets.size;
  scan.wallets.clear();

  const decimals = after.decimals;
  const near =
    Math.abs(before.slot - scan.slot) <= Math.abs(after.slot - scan.slot) ? before : after;
  const far = near === before ? after : before;
  const difference = folded.total - near.amount;
  const checks: SplChecks = {
    slot: scan.slot,
    token_accounts: scan.token_accounts,
    nonzero_accounts: scan.nonzero_accounts,
    wallets: walletCount,
    sum_raw: folded.total.toString(),
    supply_before_raw: before.amount.toString(),
    supply_before_slot: before.slot,
    supply_after_raw: after.amount.toString(),
    supply_after_slot: after.slot,
    difference_raw: difference.toString(),
  };
  const off = difference < 0n ? -difference : difference;
  if (off * MAX_DIFFERENCE_DIVISOR > near.amount)
    throw new InputError(
      'source_failed',
      `${mint}: the wallets sum to ${folded.total}, the supply is ${near.amount}: too far apart to be a moving chain`,
    );

  const asOf = await slotTime(rpc, scan.slot);
  say(`reading the owner program of the top ${Math.min(OWNER_LOOKUP, folded.top.length)} wallets`);
  const owners = await ownerPrograms(
    rpc,
    folded.top.slice(0, OWNER_LOOKUP).map((w) => w.address),
  );

  const participants: Participant[] = [];
  const holdings: Holding[] = [];
  const hold = (id: string, raw: bigint): Holding => ({
    participant: id,
    asset: mint,
    measure: 'token_balance',
    amount: fromBaseUnits(raw, decimals),
    amount_raw: raw.toString(),
    unit: UNIT,
    as_of: asOf,
    source: S.scan,
  });
  for (const w of folded.top) {
    const program = owners.get(w.address);
    const owned = typeof program === 'string' && program !== SYSTEM_PROGRAM;
    participants.push({
      id: w.address,
      label: short(w.address),
      kind: owned ? 'contract' : 'unknown',
      identity: null,
      source: owners.has(w.address) ? S.owners : S.scan,
      detail: { address: w.address, ...(program ? { owner_program: program } : {}) },
    });
    holdings.push(hold(w.address, w.amount));
  }
  for (const b of folded.bands) {
    const id = `group:rank-${b.from}-${b.to}`;
    participants.push({
      id,
      label: `wallets ranked ${grouped(b.from)} to ${grouped(b.to)}`,
      kind: 'group',
      identity: null,
      count: b.to - b.from + 1,
      source: S.scan,
      detail: { rank_from: b.from, rank_to: b.to },
    });
    holdings.push(hold(id, b.amount));
  }

  const total = fromBaseUnits(folded.total, decimals);
  const sources: Snapshot['sources'] = [
    {
      id: S.scan,
      kind: 'chain',
      url,
      method: paged
        ? `Helius's getTokenAccounts (DAS) for the mint, page by page by its cursor: each account's owner and amount, read after slot ${grouped(scan.slot)} and not pinned to it`
        : `getProgramAccounts on the Token Program, mint filter, owner and amount only${opts.stored ? ', from a stored answer of the same call' : ''}`,
      fetched_at: asOf,
      block_height: scan.slot,
    },
    {
      id: S.supply,
      kind: 'chain',
      url: SOLANA_OFFICIAL,
      method: 'getTokenSupply before and after the scan; getBlockTime for the date',
      fetched_at: asOf,
      block_height: after.slot,
    },
    {
      id: S.owners,
      kind: 'chain',
      url: SOLANA_OFFICIAL,
      method: `getMultipleAccounts: the program that owns each of the top ${OWNER_LOOKUP} wallets`,
      fetched_at: asOf,
    },
  ];
  const snapshot: Snapshot = {
    petal: 'snapshot/v1',
    network: {
      id: SPL_MODULE_ID,
      chain: SOLANA_CHAIN,
      population: `spl-holders-${mint}`,
      title: `SPL holders ${short(mint)}`,
      description: SPL_DESCRIPTOR.description,
      params: { mint },
    },
    snapshot: { as_of: asOf, block_height: scan.slot, final: !paged },
    coverage: {
      participants_total: walletCount,
      participants_included: walletCount,
      amount_total: total,
      amount_included: total,
      unit: UNIT,
      measure: 'token_balance',
      ...(folded.bands.length > 0
        ? {
            grouped: [
              {
                rule: `wallets below rank ${grouped(keep)} are folded into ${grouped(folded.bands.length)} rank bands, each no larger than the smallest individual wallet, so a band never outranks a wallet`,
                rows_folded: folded.folded_wallets,
                amount: fromBaseUnits(folded.folded_amount, decimals),
              },
            ],
          }
        : {}),
      note:
        `Balances at Solana slot ${grouped(scan.slot)} (${dayOf(asOf)}); block_height here is the slot. ` +
        `Participants are wallets, the owners of token accounts: ${grouped(scan.token_accounts)} token accounts, ${grouped(scan.nonzero_accounts)} with a balance, ${grouped(walletCount)} wallets. ` +
        `${differenceSentence(folded.total, near, far, decimals, UNIT)} ` +
        'One moment only: no launch history, because no keyless source gives holdings at a past date, so launch-day holdings and early buyers are not shown. ' +
        'No labels: nothing here names a wallet or ties one to a person or a company. Kind says only whether a program owns the address, read for the top 100 wallets. ' +
        'Not known: who controls a wallet, whether one wallet holds for many people, or whether many wallets belong to one. These are balances, not votes.',
    },
    sources,
    participants,
    holdings,
    relationships: [],
    events: [],
    module: {
      id: SPL_MODULE_ID,
      version: SPL_MODULE_VERSION,
      ...(opts.stored ? { imported_from: opts.stored.imported_from } : {}),
    },
  };
  return { snapshot, checks };
}

/** Any SPL mint. `fixtures` is the folder holding index.json (default: this repo's). */
export function solanaSplHolders(
  opts: { fixtures?: string; fetch?: typeof globalThis.fetch } = {},
): InputModule {
  const { fixtures, ...pullOpts } = opts;
  return paramModule({
    descriptor: SPL_DESCRIPTOR,
    keyFor: (params) => ({ chain: SOLANA_CHAIN, population: `spl-holders-${splMint(params)}` }),
    pinnable: false,
    head: async () => {
      const rpc = pool(pullOpts);
      const { result: slot } = await rpc.call<number>('getSlot', [{ commitment: 'finalized' }]);
      return { block_height: slot, as_of: await slotTime(rpc, slot) };
    },
    pull: async (_at, params, onProgress) => {
      const helius = process.env.HELIUS_API_KEY?.trim();
      const { snapshot } = await pullSplHolders(splMint(params), {
        ...pullOpts,
        ...(helius ? { heliusKey: helius } : {}),
        ...(onProgress ? { onProgress } : {}),
      });
      return snapshot;
    },
    ...(fixtures ? { fixtures } : {}),
  });
}
