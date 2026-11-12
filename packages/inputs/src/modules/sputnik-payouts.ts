// A Sputnik DAO's payouts (payouts/v1, 12 Nov; Elco: "an unopinionated 'payouts from this treasury over period
// x'"), keyless, from its own chain:
//   what:  each proposal that passed (Sputnik runs one on its approving vote, so Approved is paid, Failed is
//          not) and pays someone: a Transfer (its token, receiver and amount), a FunctionCall's ft_transfer
//          actions (the token is the call's receiver), a BountyDone (its bounty's token and amount)
//   when:  the block of the DAO's own transfer, found in the transaction that approved it (FastNEAR's keyless
//          transactions API: the DAO's transactions where it sent a receipt, then those transactions in full).
//          The proposal's bond coming back to its proposer is a transfer too, and isn't a payout: a payout is
//          matched to its proposal's own receiver, token and amount.
//   usd:   DefiLlama's price nearest when it was paid (coins.llama.fi/batchHistorical), named as DefiLlama's
// What isn't found stays null, never a guess.
import type { Payout, Payouts } from '@petal/core';
import type { ResolvedAt } from '@petal/core/types';
import type { Fetch } from '../marks/lists.ts';
import type { RpcPool } from '../rpc/pool.ts';
import type { RawProposal, SputnikRead } from './sputnik-dao.ts';

export const FASTNEAR_TX = 'https://tx.main.fastnear.com/v0';
export const LLAMA_HISTORICAL = 'https://coins.llama.fi/batchHistorical';

/** What a passed proposal pays, as it says it, before its date is found. */
export interface Planned {
  proposal: RawProposal;
  kind: 'Transfer' | 'FunctionCall' | 'BountyDone';
  to: string;
  /** '' for NEAR, else the token's contract */
  token: string;
  raw: string;
}

const b64json = (s: unknown): Record<string, unknown> | null => {
  if (typeof s !== 'string') return null;
  try {
    const v = JSON.parse(Buffer.from(s, 'base64').toString('utf8'));
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};
const isRaw = (x: unknown): x is string => typeof x === 'string' && /^[0-9]+$/.test(x) && x !== '0';
const isAccount = (x: unknown): x is string => typeof x === 'string' && x.length > 1;

/** A bounty, as get_bounty says it: its token ('' for NEAR) and the amount each claim is paid. */
export interface Bounty {
  token: string;
  amount: string;
}

/** Every payout the DAO's passed proposals say they make. */
export function plannedPayouts(read: SputnikRead, bounties: Map<number, Bounty>): Planned[] {
  const out: Planned[] = [];
  for (const p of read.proposals) {
    if (p.status !== 'Approved' || typeof p.kind !== 'object' || !p.kind) continue;
    const k = p.kind as Record<string, Record<string, unknown> | undefined>;
    const t = k.Transfer;
    if (t && isAccount(t.receiver_id) && isRaw(t.amount)) {
      out.push({
        proposal: p,
        kind: 'Transfer',
        to: t.receiver_id,
        token: typeof t.token_id === 'string' ? t.token_id : '',
        raw: t.amount,
      });
    }
    const f = k.FunctionCall;
    if (f && isAccount(f.receiver_id) && Array.isArray(f.actions)) {
      for (const a of f.actions as Array<Record<string, unknown>>) {
        if (a.method_name !== 'ft_transfer') continue;
        const args = b64json(a.args);
        if (args && isAccount(args.receiver_id) && isRaw(args.amount))
          out.push({
            proposal: p,
            kind: 'FunctionCall',
            to: args.receiver_id,
            token: f.receiver_id,
            raw: args.amount,
          });
      }
    }
    const d = k.BountyDone;
    if (d && isAccount(d.receiver_id) && typeof d.bounty_id === 'number') {
      const b = bounties.get(d.bounty_id);
      if (b && isRaw(b.amount))
        out.push({
          proposal: p,
          kind: 'BountyDone',
          to: d.receiver_id,
          token: b.token,
          raw: b.amount,
        });
    }
  }
  return out;
}

/** The bounties the DAO's BountyDone proposals name, as get_bounty says them now; one gone is left out. */
export async function readBounties(
  pool: RpcPool,
  dao: string,
  read: SputnikRead,
  at: ResolvedAt,
): Promise<Map<number, Bounty>> {
  const ids = new Set<number>();
  for (const p of read.proposals) {
    const d =
      typeof p.kind === 'object'
        ? (p.kind as { BountyDone?: { bounty_id?: unknown } }).BountyDone
        : null;
    if (p.status === 'Approved' && typeof d?.bounty_id === 'number') ids.add(d.bounty_id);
  }
  const out = new Map<number, Bounty>();
  for (const id of ids) {
    try {
      const r = await pool.view<{ bounty?: { token?: string; amount?: string } }>(
        dao,
        'get_bounty',
        { id },
        { block_id: at.block_height },
      );
      const b = r.value?.bounty;
      if (b && typeof b.amount === 'string')
        out.set(id, { token: b.token ?? '', amount: b.amount });
    } catch {
      // gone: its payouts are left out
    }
  }
  return out;
}

/** One transfer the DAO itself sent, in the transaction that approved a proposal. */
export interface SentReceipt {
  proposal: number;
  /** '' for NEAR, else the token's contract */
  token: string;
  to: string;
  raw: string;
  at: string;
  tx: string;
  block: number;
}

interface FnAccountTx {
  transaction_hash: string;
  is_predecessor?: boolean;
  is_function_call?: boolean;
}
interface FnReceipt {
  execution_outcome?: {
    block_timestamp?: number;
    block_height?: number;
    outcome?: { status?: unknown };
  };
  receipt?: {
    predecessor_id?: string;
    receiver_id?: string;
    receipt?: { Action?: { actions?: Array<Record<string, Record<string, unknown>>> } };
  };
}
interface FnTx {
  transaction?: { hash?: string };
  receipts?: FnReceipt[];
}

/** How long to wait before asking a keyless API again after it says "too many" or fails: 1 s, doubling. */
export const RETRY_WAITS = [1000, 2000, 4000, 8000, 16000, 32000];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post<T>(
  fetchImpl: Fetch,
  url: string,
  body: unknown,
  waits: readonly number[] = RETRY_WAITS,
): Promise<T | null> {
  for (let i = 0; ; i++) {
    let status = 0;
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) return (await res.json()) as T;
      status = res.status;
    } catch {
      status = 0;
    }
    // asked too often, or the service failed: wait and ask again; anything else is its answer
    const again = status === 0 || status === 429 || status >= 500;
    const ms = waits[i];
    if (!again || ms === undefined) return null;
    await wait(ms);
  }
}

const succeeded = (s: unknown) =>
  !!s && typeof s === 'object' && ('SuccessValue' in s || 'SuccessReceiptId' in s);

/**
 * The transfers the DAO sent in the transactions that approved its proposals, from FastNEAR's transactions
 * API, keyless: every page of the DAO's transactions, then in full the ones where it sent a receipt from a
 * function call. Each act_proposal VoteApprove names its proposal; each of the DAO's own successful
 * Transfer and ft_transfer receipts in it is a transfer it sent. What FastNEAR doesn't answer is said.
 */
export async function sentByApprovals(
  fetchImpl: Fetch,
  dao: string,
  log: (line: string) => void = () => {},
  waits: readonly number[] = RETRY_WAITS,
): Promise<{ sent: SentReceipt[]; txs: number; read: number; failed: string[] }> {
  const failed: string[] = [];
  const hashes = new Set<string>();
  let txs = 0;
  let resume: string | undefined;
  for (;;) {
    const page = await post<{ account_txs?: FnAccountTx[]; resume_token?: string | null }>(
      fetchImpl,
      `${FASTNEAR_TX}/account`,
      { account_id: dao, ...(resume ? { resume_token: resume } : {}) },
      waits,
    );
    if (!page || !Array.isArray(page.account_txs)) {
      failed.push(`${FASTNEAR_TX}/account ${dao}${resume ? ` from ${resume}` : ''}`);
      break;
    }
    txs += page.account_txs.length;
    for (const t of page.account_txs)
      if (t.is_predecessor && t.is_function_call) hashes.add(t.transaction_hash);
    if (!page.resume_token || page.account_txs.length === 0) break;
    resume = String(page.resume_token);
  }
  log(`${dao}: ${txs} transactions, ${hashes.size} where it sent a receipt`);
  const sent: SentReceipt[] = [];
  const all = [...hashes];
  let read = 0;
  for (let i = 0; i < all.length; i += 20) {
    const part = all.slice(i, i + 20);
    const got = await post<{ transactions?: FnTx[] }>(
      fetchImpl,
      `${FASTNEAR_TX}/transactions`,
      { tx_hashes: part },
      waits,
    );
    if (!got || !Array.isArray(got.transactions)) {
      failed.push(`${FASTNEAR_TX}/transactions (${part.length} of ${dao}'s)`);
      continue;
    }
    for (const t of got.transactions) {
      read++;
      sent.push(...sentIn(t, dao));
    }
  }
  return { sent, txs, read, failed };
}

/** The transfers the DAO sent in one transaction that approved a proposal. */
export function sentIn(t: FnTx, dao: string): SentReceipt[] {
  const receipts = t.receipts ?? [];
  let proposal: number | null = null;
  for (const r of receipts) {
    if (r.receipt?.receiver_id !== dao) continue;
    for (const a of r.receipt.receipt?.Action?.actions ?? []) {
      const fc = a.FunctionCall;
      if (fc?.method_name !== 'act_proposal') continue;
      const args = b64json(fc.args);
      if (args?.action === 'VoteApprove' && typeof args.id === 'number') proposal = args.id;
    }
  }
  if (proposal === null) return [];
  const out: SentReceipt[] = [];
  for (const r of receipts) {
    if (r.receipt?.predecessor_id !== dao || !succeeded(r.execution_outcome?.outcome?.status))
      continue;
    const ts = r.execution_outcome?.block_timestamp;
    const block = r.execution_outcome?.block_height;
    if (typeof ts !== 'number' || typeof block !== 'number') continue;
    const at = new Date(Math.floor(ts / 1e6)).toISOString();
    const base = { proposal, at, tx: t.transaction?.hash ?? '', block };
    const to = r.receipt.receiver_id ?? '';
    for (const a of r.receipt.receipt?.Action?.actions ?? []) {
      if (a.Transfer && isRaw(a.Transfer.deposit))
        out.push({ ...base, token: '', to, raw: a.Transfer.deposit });
      const fc = a.FunctionCall;
      if (fc?.method_name === 'ft_transfer' || fc?.method_name === 'ft_transfer_call') {
        const args = b64json(fc.args);
        if (args && isAccount(args.receiver_id) && isRaw(args.amount))
          out.push({ ...base, token: to, to: args.receiver_id, raw: args.amount });
      }
    }
  }
  return out;
}

/** A token's symbol and decimals, as its ft_metadata says them; NEAR's own are NEAR and 24. */
export async function tokenFacts(
  pool: RpcPool,
  tokens: Iterable<string>,
  at: ResolvedAt,
): Promise<Map<string, { symbol: string | null; decimals: number | null }>> {
  const out = new Map<string, { symbol: string | null; decimals: number | null }>([
    ['', { symbol: 'NEAR', decimals: 24 }],
  ]);
  for (const token of new Set(tokens)) {
    if (out.has(token)) continue;
    try {
      const r = await pool.view<{ symbol?: string; decimals?: number }>(
        token,
        'ft_metadata',
        {},
        { block_id: at.block_height },
      );
      out.set(token, {
        symbol: typeof r.value?.symbol === 'string' ? r.value.symbol : null,
        decimals: typeof r.value?.decimals === 'number' ? r.value.decimals : null,
      });
    } catch {
      out.set(token, { symbol: null, decimals: null });
    }
  }
  return out;
}

const wholeOf = (raw: string, decimals: number) => {
  if (decimals <= 0) return raw;
  const s = raw.padStart(decimals + 1, '0');
  const frac = s.slice(-decimals).replace(/0+$/, '');
  return frac ? `${s.slice(0, -decimals)}.${frac}` : s.slice(0, -decimals);
};

interface LlamaPrices {
  coins?: Record<string, { prices?: Array<{ timestamp: number; price: number }> }>;
}
async function getPrices(fetchImpl: Fetch, url: string): Promise<LlamaPrices | null> {
  try {
    const res = await fetchImpl(url, { headers: { accept: 'application/json' } });
    return res.ok ? ((await res.json()) as LlamaPrices) : null;
  } catch {
    return null;
  }
}

/** DefiLlama's name for a NEAR asset: NEAR through CoinGecko's id, a token by its contract. */
const llamaCoin = (token: string) => (token === '' ? 'coingecko:near' : `near:${token}`);

/**
 * DefiLlama's prices nearest each moment asked, keyless, a few hundred a call; within six hours of it or
 * none. Each answer names DefiLlama and the moment it priced.
 */
export async function pastPrices(
  fetchImpl: Fetch,
  asks: Array<{ token: string; at: string }>,
): Promise<{
  priceOf: (token: string, at: string) => { price: number; at: string; ref: string } | null;
  failed: string[];
}> {
  const failed: string[] = [];
  const found = new Map<string, { price: number; at: string; ref: string }>();
  const byCoin = new Map<string, Set<number>>();
  for (const a of asks) {
    const coin = llamaCoin(a.token);
    const s = byCoin.get(coin) ?? new Set<number>();
    s.add(Math.floor(Date.parse(a.at) / 1000));
    byCoin.set(coin, s);
  }
  // a few hundred moments a call keeps the address short
  const parts: Array<Record<string, number[]>> = [];
  let part: Record<string, number[]> = {};
  let n = 0;
  for (const [coin, ts] of byCoin)
    for (const t of ts) {
      const list = part[coin] ?? [];
      list.push(t);
      part[coin] = list;
      n++;
      if (n >= 200) {
        parts.push(part);
        part = {};
        n = 0;
      }
    }
  if (n) parts.push(part);
  for (const coins of parts) {
    const url = `${LLAMA_HISTORICAL}?coins=${encodeURIComponent(JSON.stringify(coins))}&searchWidth=6h`;
    const body = await getPrices(fetchImpl, url);
    if (!body?.coins) {
      failed.push(`${LLAMA_HISTORICAL} (${Object.keys(coins).length} coins)`);
      continue;
    }
    for (const [coin, asked] of Object.entries(coins)) {
      const prices = body.coins[coin]?.prices ?? [];
      for (const t of asked) {
        const near = prices.reduce<{ timestamp: number; price: number } | null>(
          (a, p) => (!a || Math.abs(p.timestamp - t) < Math.abs(a.timestamp - t) ? p : a),
          null,
        );
        if (near && Math.abs(near.timestamp - t) <= 6 * 3600 && near.price > 0)
          found.set(`${coin}@${t}`, {
            price: near.price,
            at: new Date(near.timestamp * 1000).toISOString(),
            ref: `${coin} at ${near.timestamp} (${LLAMA_HISTORICAL})`,
          });
      }
    }
  }
  return {
    priceOf: (token, at) =>
      found.get(`${llamaCoin(token)}@${Math.floor(Date.parse(at) / 1000)}`) ?? null,
    failed,
  };
}

const nsToIso = (ns: string) => new Date(Number(BigInt(ns) / 1_000_000n)).toISOString();

/**
 * The DAO's payouts as payouts/v1: each passed proposal's payment, dated by the DAO's own transfer that
 * matches it (receiver, token and amount) in the transaction that approved it, priced on that day.
 */
export function sputnikPayouts(a: {
  about: string;
  dao: string;
  planned: Planned[];
  sent: SentReceipt[];
  facts: Map<string, { symbol: string | null; decimals: number | null }>;
  priceOf: (token: string, at: string) => { price: number; at: string; ref: string } | null;
  at: ResolvedAt;
  ref: string;
  readAt: string;
}): Payouts {
  const sentBy = new Map<number, SentReceipt[]>();
  for (const s of a.sent) sentBy.set(s.proposal, [...(sentBy.get(s.proposal) ?? []), s]);
  const used = new Set<SentReceipt>();
  const payouts: Payout[] = a.planned.map((p) => {
    const match = (sentBy.get(p.proposal.id) ?? []).find(
      (s) => !used.has(s) && s.to === p.to && s.token === p.token && s.raw === p.raw,
    );
    if (match) used.add(match);
    const facts = a.facts.get(p.token) ?? { symbol: null, decimals: null };
    const amount = facts.decimals === null ? null : wholeOf(p.raw, facts.decimals);
    const price = match && amount !== null ? a.priceOf(p.token, match.at) : null;
    return {
      from: `near:mainnet:${a.dao}`,
      to: `near:mainnet:${p.to}`,
      asset: {
        id: p.token === '' ? 'NEAR' : `near:mainnet:${p.token}`,
        symbol: facts.symbol,
        decimals: facts.decimals,
      },
      amount,
      raw: p.raw,
      when: match?.at ?? null,
      proposal: {
        id: String(p.proposal.id),
        kind: p.kind,
        ref: `proposal:near:mainnet:${a.dao}:${p.proposal.id}`,
        at: nsToIso(p.proposal.submission_time),
      },
      usd:
        price && amount !== null
          ? {
              usd: (Number(amount) * price.price).toFixed(2),
              price: price.price,
              source: 'defillama',
              ref: price.ref,
              at: price.at,
            }
          : null,
      evidence: match
        ? {
            tx: match.tx,
            block: match.block,
            ref: `the DAO's own transfer in ${match.tx} (${FASTNEAR_TX}/transactions)`,
          }
        : null,
    };
  });
  return {
    petal: 'payouts/v1',
    about: a.about,
    source: {
      kind: 'sputnik',
      contract: `near:mainnet:${a.dao}`,
      ref: a.ref,
      at: a.at.as_of,
    },
    payouts,
    read_at: a.readAt,
  };
}
