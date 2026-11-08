// find_target (T164): from a plain name ("Moloch DAO", "TRUMP", "UNI on Base") or an address to
// candidates, each with its chain, address, source, and the module and parameters that would draw
// it, or why none can. Several stay several, with the evidence that separates them.
//
// A token is a ledger of holdings, and transferability is a property of it. A token with no trading
// pool (Moloch shares, say) is on no market site and is still a token, so market search is one source
// and the chain is another: any EVM address, from a site or from a model's memory, is confirmed by
// asking the chain what it answers (identifyContracts), and the candidate says so.
//
// No target is named in this file. What Petal holds comes from its modules and stored snapshots; the
// rest from public sources, keyless, at most MAX_CALLS calls and TIMEOUT_MS each. A source that is
// down costs its own answer only, and `sources` says who answered.
import { runSignal } from '@petal/core';
import type { IndexRow, Params } from '@petal/core/types';
import {
  ChainDown,
  type ContractIdentity,
  EVM_CHAINS,
  endpointHealth,
  identifyContracts,
  TOKEN_PROGRAM,
} from '@petal/inputs';
import { defineTool, type PetalTool } from '../define.ts';
import type { ToolContext } from '../types.ts';
import { bodyUrl, obj, readable } from './shared.ts';

const TIMEOUT_MS = 4000;
const MAX_CALLS = 5;
const DEFAULT_LIMIT = 6;
const GECKO = 'https://api.geckoterminal.com/api/v2/search/pools';
const JUPITER = 'https://lite-api.jup.ag/tokens/v2/search';
const SNAPSHOT = 'https://hub.snapshot.org/graphql';
/** Rivals below this share of the top candidate's liquidity are shown, but raise no question. */
const RIVAL_LIQUIDITY = 0.01;
/**
 * Measured on TRUMP and MELANIA: 2.8 token accounts per wallet, so about this many holders is the
 * 200 MB where a chat's holder scan stops. An estimate, and only a stored read gets past it.
 */
const SPL_CHAT_HOLDERS = 300_000;

/** The chain vocabulary the sources share: names, GeckoTerminal ids, Snapshot's numeric ids. */
const CHAINS: { id: string; words: string[]; gecko?: string; evm?: string }[] = [
  { id: 'ethereum', words: ['ethereum', 'eth', 'mainnet'], gecko: 'eth', evm: '1' },
  { id: 'base', words: ['base'], gecko: 'base', evm: '8453' },
  { id: 'arbitrum', words: ['arbitrum', 'arb', 'arbitrum one'], gecko: 'arbitrum', evm: '42161' },
  { id: 'solana', words: ['solana', 'sol'], gecko: 'solana' },
  { id: 'optimism', words: ['optimism', 'op'], gecko: 'optimism', evm: '10' },
  { id: 'polygon', words: ['polygon', 'matic'], gecko: 'polygon_pos', evm: '137' },
  { id: 'bsc', words: ['bnb', 'bsc', 'binance'], gecko: 'bsc', evm: '56' },
  { id: 'gnosis', words: ['gnosis', 'xdai'], gecko: 'xdai', evm: '100' },
  { id: 'avalanche', words: ['avalanche', 'avax'], gecko: 'avax', evm: '43114' },
  { id: 'near', words: ['near'] },
];
export const chainByWord = (w: string) =>
  CHAINS.find((c) => c.words.includes(w.trim().toLowerCase()));

/** Words that say what is wanted of a target, not which target. */
const TRAILING = new Set(
  'dao token coin protocol network governance votes voters delegates holders members shares'.split(
    ' ',
  ),
);

export interface Parsed {
  name: string;
  /** the name without "the" and words like "dao": what is searched for */
  core: string;
  chain: string | null;
}

export function parseQuery(query: string, chain?: string): Parsed {
  const q = query.trim();
  const on = /^(.+?)\s+(?:on|in)\s+([a-z0-9 ]+?)\s*$/i.exec(q);
  const named = on?.[2] ? chainByWord(on[2]) : undefined;
  const name = named && on?.[1] ? on[1].trim() : q;
  const words = name.split(/\s+/);
  while (words.length > 1 && TRAILING.has((words.at(-1) as string).toLowerCase())) words.pop();
  if (words.length > 1 && words[0]?.toLowerCase() === 'the') words.shift();
  const asked = chain ? (chainByWord(chain)?.id ?? chain.toLowerCase()) : (named?.id ?? null);
  return { name, core: words.join(' '), chain: asked };
}

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

interface Evidence {
  liquidity_usd?: number;
  volume_24h_usd?: number;
  holders?: number;
  verified?: boolean;
  followers?: number;
  proposals?: number;
  snapshot_space?: string;
}

interface Draw {
  module: string;
  params: Params;
  shows: string;
  stored?: { sha256: string; as_of: string; block_height: number | null };
  note?: string;
}

interface Candidate {
  name: string;
  symbol: string | null;
  kind: 'token' | 'dao' | 'network';
  chain: string;
  address: string | null;
  /** the ledger of holdings it keeps, where known: a token, transferable or not */
  ledger: string | null;
  /** can holdings move by transfer? false for Moloch shares; null when not known */
  transferable: boolean | null;
  /** what the chain itself answered; null when it was not asked */
  confirmed: { by: 'chain'; chain: string; url: string; answered: string[] } | null;
  draw: Draw[];
  cannot_draw: string | null;
  evidence: Evidence;
  sources: { id: string; url: string }[];
}

interface Working extends Candidate {
  /** the name or symbol is exactly what was asked, or Petal holds it */
  exact: boolean;
  /** Jupiter's token program, on Solana */
  program?: string;
  /** why no module can read it, known before the modules are asked */
  blocked?: string;
  /** which function reads delegated votes, when the chain says it has one */
  votes?: string;
  /** the stored snapshot this came from */
  held?: IndexRow;
  /** this chain's endpoints didn't answer: nothing is known about the address there */
  down?: string;
}

interface SourceRow {
  id: string;
  url: string;
  status: 'answered' | 'failed' | 'skipped';
  hits: number;
  ms?: number;
  note?: string;
}

const keyOf = (chain: string, address: string | null, name: string) =>
  `${chain}:${address ? (address.startsWith('0x') ? address.toLowerCase() : address) : name.toLowerCase()}`;

class Lookup {
  calls = 0;
  sources: SourceRow[] = [];
  found = new Map<string, Working>();
  fetcher: typeof globalThis.fetch | null;
  offline: string;
  /** which endpoints look down: this process's own, unless a fetch was injected */
  health: Map<string, number>;
  constructor(fetcher: typeof globalThis.fetch | null, offline: string) {
    this.fetcher = fetcher;
    this.offline = offline;
    this.health = fetcher === globalThis.fetch ? endpointHealth : new Map();
  }

  /** One outbound call, counted and timed. Null when it was skipped or failed. */
  async ask<T>(
    id: string,
    url: string,
    run: (f: typeof globalThis.fetch) => Promise<T>,
    hits: (t: T) => number,
  ): Promise<T | null> {
    if (!this.fetcher) {
      this.sources.push({ id, url, status: 'skipped', hits: 0, note: this.offline });
      return null;
    }
    if (this.calls >= MAX_CALLS) {
      const note = `over the limit of ${MAX_CALLS} calls`;
      this.sources.push({ id, url, status: 'skipped', hits: 0, note });
      return null;
    }
    this.calls++;
    const t0 = Date.now();
    try {
      const out = await run(this.fetcher);
      const row: SourceRow = { id, url, status: 'answered', hits: hits(out) };
      this.sources.push({ ...row, ms: Date.now() - t0 });
      return out;
    } catch (e) {
      const note = (e as Error).message;
      this.sources.push({ id, url, status: 'failed', hits: 0, ms: Date.now() - t0, note });
      return null;
    }
  }

  add(
    c: Partial<Working> & Pick<Working, 'name' | 'kind' | 'chain'>,
    source: Working['sources'][0],
  ) {
    const key = keyOf(c.chain, c.address ?? null, c.name);
    const had = this.found.get(key);
    if (!had) {
      this.found.set(key, {
        symbol: null,
        address: null,
        ledger: null,
        transferable: null,
        confirmed: null,
        draw: [],
        cannot_draw: null,
        evidence: {},
        sources: [source],
        exact: false,
        ...c,
      });
      return;
    }
    had.exact ||= c.exact ?? false;
    had.symbol ??= c.symbol ?? null;
    had.program ??= c.program;
    had.blocked ??= c.blocked;
    had.held ??= c.held;
    had.ledger ??= c.ledger ?? null;
    had.transferable ??= c.transferable ?? null;
    for (const [k, v] of Object.entries(c.evidence ?? {})) {
      const e = had.evidence as Record<string, unknown>;
      e[k] = typeof v === 'number' ? Math.max(Number(e[k] ?? 0), v) : (e[k] ?? v);
    }
    if (!had.sources.some((s) => s.id === source.id)) had.sources.push(source);
  }
}

const getJson = async <T>(f: typeof globalThis.fetch, url: string, init?: RequestInit) => {
  const res = await f(url, {
    ...init,
    headers: {
      accept: 'application/json',
      'user-agent': 'petal/0.1 (keyless public reads)',
      ...init?.headers,
    },
    signal: runSignal(AbortSignal.timeout(TIMEOUT_MS)),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
};

const exactly = (core: string, ...names: (string | null | undefined)[]) =>
  names.some((n) => n?.trim().toLowerCase() === core.toLowerCase());
const chainOfGecko = (network: string) =>
  CHAINS.find((c) => c.gecko === network)?.id ?? network.replaceAll('_', '-');

// --- GeckoTerminal: tokens in trading pools, with liquidity and volume

type GeckoAnswer = {
  data?: {
    id: string;
    attributes: { reserve_in_usd?: string; volume_usd?: { h24?: string } };
    relationships: {
      base_token?: { data?: { id: string } };
      quote_token?: { data?: { id: string } };
    };
  }[];
  included?: { id: string; attributes: { address: string; name?: string; symbol?: string } }[];
};

async function fromGecko(l: Lookup, p: Parsed): Promise<void> {
  const network = p.chain ? CHAINS.find((c) => c.id === p.chain)?.gecko : undefined;
  const qs = new URLSearchParams({ query: p.core, include: 'base_token,quote_token' });
  if (network) qs.set('network', network);
  const url = `${GECKO}?${qs}`;
  const out = await l.ask(
    'geckoterminal',
    url,
    (f) => getJson<GeckoAnswer>(f, url),
    (g) => g.data?.length ?? 0,
  );
  const tokens = new Map((out?.included ?? []).map((t) => [t.id, t.attributes]));
  // Pools add up to what a token trades in, as far as this page shows; the first is its largest.
  const seen = new Map<string, { liquidity: number; volume: number; pool: string }>();
  for (const pool of out?.data ?? []) {
    for (const side of ['base_token', 'quote_token'] as const) {
      const id = pool.relationships[side]?.data?.id;
      const t = id ? tokens.get(id) : undefined;
      if (!id || !t || !exactly(p.core, t.symbol, t.name)) continue;
      const had = seen.get(id) ?? {
        liquidity: 0,
        volume: 0,
        pool: pool.id.slice(pool.id.lastIndexOf('_') + 1),
      };
      had.liquidity += Number(pool.attributes.reserve_in_usd ?? 0);
      had.volume += Number(pool.attributes.volume_usd?.h24 ?? 0);
      seen.set(id, had);
    }
  }
  for (const [id, v] of seen) {
    const t = tokens.get(id);
    if (!t) continue;
    const net = id.slice(0, id.lastIndexOf('_'));
    l.add(
      {
        name: t.name ?? t.symbol ?? t.address,
        symbol: t.symbol ?? null,
        kind: 'token',
        chain: chainOfGecko(net),
        address: t.address,
        exact: true,
        evidence: { liquidity_usd: Math.round(v.liquidity), volume_24h_usd: Math.round(v.volume) },
      },
      { id: 'geckoterminal', url: `https://www.geckoterminal.com/${net}/pools/${v.pool}` },
    );
  }
}

// --- Jupiter: Solana tokens, with holders and the token program

type JupiterToken = {
  id: string;
  name?: string;
  symbol?: string;
  holderCount?: number;
  liquidity?: number;
  isVerified?: boolean;
  tokenProgram?: string;
};

async function fromJupiter(l: Lookup, core: string, byMint: boolean): Promise<void> {
  const url = `${JUPITER}?${new URLSearchParams({ query: core })}`;
  const out = await l.ask(
    'jupiter',
    url,
    (f) => getJson<JupiterToken[]>(f, url),
    (j) => j.length,
  );
  for (const t of out ?? []) {
    if (!(byMint ? t.id === core : exactly(core, t.symbol, t.name))) continue;
    l.add(
      {
        name: t.name ?? t.symbol ?? t.id,
        symbol: t.symbol ?? null,
        kind: 'token',
        chain: 'solana',
        address: t.id,
        ledger: 'spl',
        transferable: true,
        exact: true,
        ...(t.tokenProgram ? { program: t.tokenProgram } : {}),
        evidence: {
          ...(t.liquidity !== undefined ? { liquidity_usd: Math.round(t.liquidity) } : {}),
          ...(t.holderCount !== undefined ? { holders: t.holderCount } : {}),
          ...(t.isVerified !== undefined ? { verified: t.isVerified } : {}),
        },
      },
      { id: 'jupiter', url: `https://jup.ag/tokens/${t.id}` },
    );
  }
}

// --- Snapshot: DAOs by name, and the token or contract their votes are counted on

type SnapshotStrategy = { name: string; network?: string; params?: Record<string, unknown> };
type SnapshotAnswer = {
  data?: {
    ranking?: {
      items?: {
        id: string;
        name: string;
        network: string;
        symbol?: string;
        followersCount?: number;
        proposalsCount?: number;
        verified?: boolean;
        flagged?: boolean;
        strategies?: SnapshotStrategy[];
      }[];
    };
  };
};

const SPACES =
  'query($q:String!){ranking(first:5,where:{search:$q}){items{id name network symbol followersCount proposalsCount verified flagged strategies{name network params}}}}';

/** The contracts a space counts votes on, nested delegation strategies included. */
function addressesIn(list: SnapshotStrategy[], fallback: string) {
  const out: { name: string; chain: string; address: string }[] = [];
  for (const s of list) {
    const inner = s.params?.strategies;
    if (Array.isArray(inner))
      out.push(...addressesIn(inner as SnapshotStrategy[], s.network ?? fallback));
    const a = s.params?.address;
    if (typeof a === 'string' && EVM_ADDRESS.test(a))
      out.push({ name: s.name, chain: s.network ?? fallback, address: a.toLowerCase() });
  }
  return out;
}

async function fromSnapshot(l: Lookup, p: Parsed): Promise<void> {
  const out = await l.ask(
    'snapshot',
    SNAPSHOT,
    (f) =>
      getJson<SnapshotAnswer>(f, SNAPSHOT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: SPACES, variables: { q: p.core } }),
      }),
    (s) => s.data?.ranking?.items?.length ?? 0,
  );
  for (const s of out?.data?.ranking?.items ?? []) {
    if (s.flagged) continue;
    const exact = exactly(p.core, s.name, s.symbol, s.id.replace(/\.eth$/, ''));
    if (!exact && !s.verified && (s.followersCount ?? 0) < 10) continue;
    const source = { id: 'snapshot', url: `https://snapshot.box/#/s:${s.id}` };
    const evidence: Evidence = {
      snapshot_space: s.id,
      followers: s.followersCount ?? 0,
      proposals: s.proposalsCount ?? 0,
      ...(s.verified ? { verified: true } : {}),
    };
    const contracts = addressesIn(s.strategies ?? [], s.network);
    for (const c of contracts.slice(0, 2)) {
      const chain = CHAINS.find((x) => x.evm === c.chain)?.id ?? `chain ${c.chain}`;
      if (p.chain && chain !== p.chain) continue;
      l.add(
        {
          name: s.name,
          symbol: s.symbol ?? null,
          kind: 'token',
          chain,
          address: c.address,
          exact,
          evidence,
        },
        source,
      );
    }
    if (contracts.length === 0)
      l.add(
        {
          name: s.name,
          symbol: s.symbol ?? null,
          kind: 'dao',
          chain: CHAINS.find((x) => x.evm === s.network)?.id ?? `chain ${s.network}`,
          exact,
          evidence,
          blocked:
            'its Snapshot votes count no token or contract Petal could read (a ticket or a list of addresses, say)',
        },
        source,
      );
  }
}

// --- What Petal holds: modules and stored snapshots

async function storedRows(ctx: ToolContext): Promise<IndexRow[]> {
  return ctx.store.list().catch(() => []);
}

function stopWords(core: string) {
  return core
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && w !== 'the' && w !== 'and');
}

async function fromPetal(l: Lookup, ctx: ToolContext, p: Parsed, rows: IndexRow[]): Promise<void> {
  const words = stopWords(p.core);
  if (words.length === 0) return;
  for (const m of Object.values(ctx.modules)) {
    const d = m.descriptor;
    const text = `${d.id} ${d.title}`.toLowerCase();
    if (!words.every((w) => text.includes(w))) continue;
    const needsTarget = Object.values(d.params).some((s) => s.required);
    const chain = d.chain.startsWith('near:') ? 'near' : d.chain;
    const source = { id: 'petal-modules', url: d.sources?.[0]?.url ?? '' };
    if (!needsTarget) {
      if (!p.chain || p.chain === chain)
        l.add({ name: d.title, kind: 'network', chain, exact: true }, source);
      continue;
    }
    if (d.kind !== 'dao') continue;
    for (const r of rows.filter((x) => x.network === d.id && x.params)) {
      const chainId = (r.params as Params).chain ?? 'ethereum';
      const address = (r.params as Params).dao ?? (r.params as Params).token ?? null;
      if (!address || (p.chain && p.chain !== chainId)) continue;
      l.add(
        {
          name: d.title,
          kind: 'token',
          chain: chainId,
          address,
          ledger: d.id.startsWith('moloch') ? d.id : 'erc20',
          exact: true,
          held: r,
        },
        { id: 'petal-store', url: bodyUrl(ctx, r.sha256) },
      );
    }
  }
}

// --- The chain confirms

/**
 * Ask each chain about its best candidate, all at once, each through whichever of its endpoints
 * answers. A chain that doesn't answer is down, which says nothing about the address.
 */
async function confirmOnChain(l: Lookup, ranked: Working[]): Promise<void> {
  const byChain = new Map<string, Working[]>();
  for (const c of ranked)
    if (c.address?.startsWith('0x') && EVM_CHAINS[c.chain])
      byChain.set(c.chain, [...(byChain.get(c.chain) ?? []), c]);
  await Promise.all(
    [...byChain].map(async ([chainId, list]) => {
      const chain = EVM_CHAINS[chainId];
      if (!chain) return;
      const part = list.slice(0, 1);
      let why: string | undefined;
      const ids = await l.ask(
        `chain:${chainId}`,
        chain.endpoints[0]?.url ?? '',
        (f) =>
          identifyContracts(
            chain,
            part.map((c) => c.address as string),
            { fetch: f, timeoutMs: TIMEOUT_MS, health: l.health },
          ).catch((e: unknown) => {
            if (e instanceof ChainDown) why = e.message;
            throw e;
          }),
        (x) => x.filter((i) => i.ledger).length,
      );
      if (!ids) {
        for (const c of part) if (why) c.down = why;
        return;
      }
      part.forEach((c, i) => {
        const id = ids[i] as ContractIdentity;
        applyIdentity(c, id, chainId, id.served_by);
      });
    }),
  );
}

function applyIdentity(c: Working, id: ContractIdentity, chain: string, url: string) {
  c.confirmed = { by: 'chain', chain, url, answered: id.answered };
  c.ledger = id.ledger;
  c.transferable = id.transferable;
  c.symbol ??= id.symbol;
  if (c.name.toLowerCase() === c.address) c.name = id.symbol ?? id.ledger ?? c.name;
  if (id.votes) c.votes = id.votes;
  if (!id.ledger)
    c.blocked ??= `${chain} does not confirm it: this address answers no token or share calls there`;
  else if (id.ledger === 'moloch-v2')
    c.blocked ??=
      'the chain says Moloch v2. Its shares are a token too, but moloch-v1 reads only v1 contracts';
  else if (id.ledger === 'other')
    c.blocked ??=
      'it answers totalSupply and balanceOf but not decimals, so it is not an ERC-20 (an NFT collection, perhaps); no module reads that yet';
}

// --- Which module draws it

function storedFor(rows: IndexRow[], module: string, want: Params): IndexRow | undefined {
  return rows
    .filter(
      (r) =>
        r.network === module &&
        Object.entries(want).every(
          ([k, v]) => (r.params as Params | undefined)?.[k]?.toLowerCase() === v.toLowerCase(),
        ),
    )
    .sort((a, b) => (b.block_height ?? 0) - (a.block_height ?? 0))[0];
}

function drawing(
  rows: IndexRow[],
  module: string,
  params: Params,
  shows: string,
  note?: string,
): Draw {
  const row = storedFor(rows, module, params);
  return {
    module,
    params: row ? (row.params as Params) : params,
    shows,
    ...(row
      ? { stored: { sha256: row.sha256, as_of: row.as_of, block_height: row.block_height } }
      : {}),
    ...(note && !row ? { note } : {}),
  };
}

function plan(c: Working, ctx: ToolContext, rows: IndexRow[]): void {
  const has = (m: string) => Boolean(ctx.modules[m]);
  const reads = () => `Petal reads tokens on ${[...Object.keys(EVM_CHAINS), 'solana'].join(', ')}.`;
  const out: Draw[] = [];
  if (c.kind === 'network') {
    const d = Object.values(ctx.modules).find((m) => m.descriptor.title === c.name)?.descriptor;
    if (d) out.push(drawing(rows, d.id, {}, d.title));
  } else if (c.held) {
    out.push(drawing(rows, c.held.network, c.held.params as Params, 'what Petal has stored'));
  } else if (c.blocked) {
    // said below
  } else if (c.chain === 'solana' && c.address) {
    const stored = storedFor(rows, 'solana-spl-holders', { mint: c.address });
    if (c.program && c.program !== TOKEN_PROGRAM)
      c.blocked =
        'a Token-2022 mint: solana-spl-holders reads the classic Token Program only, so far';
    else if (!stored && (c.evidence.holders ?? 0) > SPL_CHAT_HOLDERS)
      c.blocked = `about ${c.evidence.holders} holders: a chat's holder scan stops at 200 MB, about ${SPL_CHAT_HOLDERS} holders, and nothing is stored for this mint yet. An offline read could store it (pull-module.ts --full)`;
    else if (has('solana-spl-holders'))
      out.push(
        drawing(rows, 'solana-spl-holders', { mint: c.address }, 'wallets and what they hold'),
      );
  } else if (c.address?.startsWith('0x') && EVM_CHAINS[c.chain]) {
    const chain = EVM_CHAINS[c.chain];
    if (!c.confirmed) {
      c.blocked = c.down
        ? `not checked, because ${c.down}. That says nothing about this address, and nothing is drawn unconfirmed: try again in a moment`
        : `not confirmed: ${c.chain} was not asked in this lookup, and nothing is drawn unconfirmed. Call find_target with this address and chain`;
    } else if (c.ledger === 'moloch-v1') {
      if (has('moloch-v1'))
        out.push(
          drawing(
            rows,
            'moloch-v1',
            { dao: c.address, chain: c.chain },
            'members and their shares',
          ),
        );
    } else {
      const narrow = chain && !chain.wide_logs && !process.env.ENVIO_API_TOKEN;
      const params: Params = {
        chain: c.chain,
        token: c.address,
        ...(narrow ? { window_days: '1' } : {}),
      };
      const note = narrow
        ? `one day of logs: a week on ${chain.name} is about 300 keyless calls and most of a chat's time; window_days asks for more`
        : chain && !chain.blockscout
          ? 'every holder if the token is quiet enough to read whole; otherwise the last 7 days, and the result says which'
          : undefined;
      if (has('erc20-holders'))
        out.push(drawing(rows, 'erc20-holders', params, 'addresses and their balances', note));
      if (c.votes && has('erc20-votes'))
        out.push(
          drawing(
            rows,
            'erc20-votes',
            { token: c.address, chain: c.chain },
            `delegates and their votes (${c.votes})`,
          ),
        );
    }
  } else if (c.address) {
    c.blocked = `Petal can't read ${c.chain} yet. ${reads()}`;
  } else {
    c.blocked = `no address to read. ${reads()}`;
  }
  c.draw = out;
  c.cannot_draw = out.length > 0 ? null : (c.blocked ?? `no module reads this yet. ${reads()}`);
}

/** Listed in a pool, with nothing traded and no holders known: on the list, not a rival. */
const noTrade = (c: Working) =>
  c.evidence.volume_24h_usd === 0 && c.evidence.holders === undefined && !c.held;

/** A Snapshot space few follow, with no market behind it, raises no question. */
const weakSpace = (c: Working) =>
  c.evidence.liquidity_usd === undefined &&
  !c.held &&
  !c.evidence.verified &&
  (c.evidence.followers ?? 0) < 100;

function score(c: Working, asked: string | null): number {
  const log = (n: number | undefined) => Math.log10(1 + (n ?? 0));
  return (
    (asked && c.chain === asked ? 100 : 0) +
    (c.exact ? 20 : 0) +
    (c.draw[0]?.stored ? 8 : 0) +
    (c.ledger && c.confirmed ? 5 : 0) +
    (noTrade(c) ? -15 : 0) +
    log(c.evidence.liquidity_usd) +
    log(c.evidence.volume_24h_usd) +
    log(c.evidence.holders) +
    log(c.evidence.followers) +
    (c.evidence.verified ? 2 : 0)
  );
}

/** What this lookup found and what didn't answer, and how a draw goes. It tells no one to give up. */
function nextStep(
  ctx: ToolContext,
  p: Parsed,
  shown: Working[],
  l: Lookup,
  rivals: number,
  noDao: boolean,
): string {
  const answered = l.sources.filter((s) => s.status === 'answered').map((s) => s.id);
  const failed = l.sources.filter((s) => s.status === 'failed').map((s) => s.id);
  const down = failed.length
    ? ` Did not answer: ${failed.join(', ')}, which says nothing about what they would have said.`
    : '';
  const checked = `Checked: ${answered.join(', ') || 'nothing'}.${down}`;
  const open = `Not tried here: read_chain on an address, read_page on a page, search for a name.`;
  if (shown.length === 0)
    return `Nothing in these sources answers to "${p.core}"${p.chain ? ` on ${p.chain}` : ''}. ${checked} This lookup knows only these lists and Petal's own modules (${readable(ctx)}), so that isn't the same as not existing. ${open}`;
  if (noDao)
    return `No DAO answers to "${p.core}" in these sources, and what's listed only shares the name, so it isn't the DAO. ${checked} A DAO with no trading pool and no Snapshot space isn't in these lists. ${open}`;
  if (rivals > 0)
    return `Different things carry this name, and the evidence listed is what separates them. None was picked: naming one is for the person. ${checked}`;
  if (shown.every((c) => c.draw.length === 0))
    return `Found, and no module can draw it: cannot_draw says why for each. ${checked} ${open}`;
  if (shown[0]?.draw.length === 0)
    return `The best match can't be drawn (its cannot_draw says why), and others listed can. ${checked} ${open}`;
  const also = shown.length > 1 ? ' Others are listed, and may fit better.' : '';
  return `One clear match, first in the list, with its chain and address, and whether Petal already holds it (stored).${also} ${checked} A new read and drawing take a plain yes or no before starting a new read. After a yes, read it: draw[0], or the entry of draw the question asks for, with module as network and params as params in get_snapshot.`;
}

export function makeFindTarget(
  deps: { fetch?: typeof globalThis.fetch } = {},
): PetalTool<{ query: string; chain?: string; limit?: number }, object> {
  const source = obj(['id', 'url'], { id: { type: 'string' }, url: { type: 'string' } });
  return defineTool({
    name: 'find_target',
    onTheirMachine: true,
    title: 'Find a target',
    description:
      'From plain words (a network, a DAO, a token name or ticker, "UNI on Base") or an address, to candidates: chain, address, the ledger it keeps, whether the chain confirmed it, the module and params that draw it (draw) or why none can (cannot_draw), the evidence that separates look-alikes, and sources. Use it first when a person names something. If you remember an address, pass it here so the chain confirms it. A token is a ledger of holdings, transferable or not.',
    input: obj(
      ['query'],
      {
        query: { type: 'string', minLength: 1, description: 'the name, ticker or address' },
        chain: { type: 'string', description: 'a chain, when the person named one' },
        limit: { type: 'integer', minimum: 1, maximum: 12, default: DEFAULT_LIMIT },
      },
      { additionalProperties: false },
    ),
    output: obj(['query', 'chain', 'candidates', 'more', 'ambiguous', 'next', 'sources', 'calls'], {
      query: { type: 'string' },
      chain: { type: ['string', 'null'] },
      candidates: {
        type: 'array',
        items: obj(
          [
            'name',
            'kind',
            'chain',
            'address',
            'ledger',
            'transferable',
            'confirmed',
            'draw',
            'cannot_draw',
            'evidence',
            'sources',
          ],
          {
            name: { type: 'string' },
            symbol: { type: ['string', 'null'] },
            kind: { enum: ['token', 'dao', 'network'] },
            chain: { type: 'string' },
            address: { type: ['string', 'null'] },
            ledger: { type: ['string', 'null'] },
            transferable: { type: ['boolean', 'null'] },
            confirmed: { type: ['object', 'null'] },
            draw: { type: 'array', items: { type: 'object' } },
            cannot_draw: { type: ['string', 'null'] },
            evidence: { type: 'object' },
            sources: { type: 'array', items: source },
          },
        ),
      },
      more: { type: 'integer' },
      ambiguous: { type: 'boolean' },
      next: { type: 'string' },
      sources: { type: 'array', items: { type: 'object' } },
      calls: { type: 'integer' },
    }),
    annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
    async run({ query, chain, limit = DEFAULT_LIMIT }, ctx) {
      const p = parseQuery(query, chain);
      const fetcher = deps.fetch ?? (ctx.config.fake ? null : globalThis.fetch);
      const l = new Lookup(fetcher, 'offline: fake mode');
      const rows = await storedRows(ctx);

      if (EVM_ADDRESS.test(p.core)) {
        const chains = p.chain ? [p.chain] : Object.keys(EVM_CHAINS);
        for (const c of chains)
          l.add(
            { name: p.core, kind: 'token', chain: c, address: p.core.toLowerCase(), exact: true },
            { id: `chain:${c}`, url: EVM_CHAINS[c]?.endpoints[0]?.url ?? '' },
          );
      } else if (MINT.test(p.core)) {
        await fromJupiter(l, p.core, true);
      } else {
        await fromPetal(l, ctx, p, rows);
        const solana = !p.chain || p.chain === 'solana';
        await Promise.all([
          fromGecko(l, p),
          ...(solana ? [fromJupiter(l, p.core, false)] : []),
          ...(p.chain === 'solana' ? [] : [fromSnapshot(l, p)]),
        ]);
      }

      const byEvidence = [...l.found.values()].sort(
        (a, b) => score(b, p.chain) - score(a, p.chain),
      );
      await confirmOnChain(l, byEvidence);
      // An address given by hand stays only where the chain knows it. A chain that was down says
      // nothing, so it's only worth a line when no chain knows it: `sources` names it either way.
      let all = byEvidence;
      if (EVM_ADDRESS.test(p.core)) {
        const known = all.some((c) => c.confirmed?.answered.length);
        all = all.filter((c) => (c.confirmed ? c.confirmed.answered.length : !known));
      }
      for (const c of all) plan(c, ctx, rows);
      all.sort((a, b) => score(b, p.chain) - score(a, p.chain));

      const top = all.find((c) => c.exact);
      const named = (c: Working) => `${c.name}|${c.symbol}`.toLowerCase();
      const askedDao = /\bdao\b/i.test(p.name);
      // Asked for a DAO, and only market tokens carry the name: that is not a clear match.
      const noDao =
        askedDao &&
        !all.some((c) => c.exact && (c.evidence.snapshot_space !== undefined || c.held));
      const rivals = all.filter(
        (c) =>
          c !== top &&
          c.exact &&
          // the same name and symbol on another chain: one asset, not a look-alike to choose from
          named(c) !== (top ? named(top) : '') &&
          // someone asking for a DAO is not asking about a market token no DAO votes with
          !(askedDao && c.evidence.snapshot_space === undefined && !c.held) &&
          !noTrade(c) &&
          !(top?.evidence.liquidity_usd !== undefined && weakSpace(c)) &&
          (top?.evidence.liquidity_usd === undefined ||
            c.evidence.liquidity_usd === undefined ||
            c.evidence.liquidity_usd >= top.evidence.liquidity_usd * RIVAL_LIQUIDITY),
      ).length;
      const shown = all.slice(0, limit);
      return {
        query,
        chain: p.chain,
        candidates: shown.map(
          ({ exact: _e, program: _p, blocked: _b, votes: _v, down: _d, ...c }) => c,
        ),
        more: all.length - shown.length,
        ambiguous: rivals > 0 || (noDao && shown.length > 0),
        next: nextStep(ctx, p, shown, l, rivals, noDao),
        sources: l.sources,
        calls: l.calls,
      };
    },
  });
}

export const findTarget = makeFindTarget();
