// look_up (T390): one place to ask "what do we know about this?", with any word: a name, an address, an
// account, a ticker, a flower id. It reports, it doesn't steer: each item says how it's known, and an
// unknown word gives an empty answer that says what was searched and what was down. Never an error on a
// guess.
//
//   flowers   on the map and in the fixtures, each with its link
//   stored    reads Petal holds, with their dates
//   accounts  where an address or account id is a participant in a stored read: its share and rank
//   chain     for an EVM address: contract or account on each chain, from read_chain's first look
//   listed    what goes by that name in market and DAO lists, through find_target's searching
//
// Nothing here is new reading: it builds on find_target, read_chain, the relations index and the
// figures, and find_target stays as it is (merging them is Stage 2).
import { computeFigures } from '@petal/core';
import type { IndexRow, Snapshot } from '@petal/core/types';
import { defineTool, type PetalTool } from '../define.ts';
import { isToolError } from '../errors.ts';
import type { ToolContext } from '../types.ts';
import { makeFindTarget, parseQuery } from './find.ts';
import { allFlowers, type Found, summaryOf } from './flowers.ts';
import { makeReadChain } from './read-chain.ts';
import { accountGroupsTool } from './relations.ts';
import { defaultMeasure, descriptorOf, findSnapshot, obj } from './shared.ts';

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** A named NEAR account (alice.near, astro-stakers.poolv1.near) or an implicit one (64 hex). */
const NEAR_ACCOUNT =
  /^(?:(?:[a-z0-9]+[-_])*[a-z0-9]+\.)+(?:near|tg|testnet|aurora|sweat)$|^[0-9a-f]{64}$/;
/** chain:address, as account_groups takes it (eip155:1:0x…, near:mainnet:alice.near). */
const CAIP_ACCOUNT = /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}:\S+$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const FLOWER_ID = /^[0-9a-f]{24}$/;
const SHA = /^[0-9a-f]{64}$/;

const MAX_LISTED = 5;
const MAX_ACCOUNT_READS = 6;

/** How an item is known (design/tools.md): the chain said so, a read on a date, a list says so, a guess. */
type Known = 'verified' | 'stored' | 'listed' | 'inferred';

interface Searched {
  id: string;
  status: 'answered' | 'down' | 'skipped';
  note?: string;
}

type Json = Record<string, unknown>;

// --- Words

const SMALL = new Set(['the', 'and', 'of', 'on', 'in', 'a', 'an', 's']);

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !SMALL.has(w));
}

/** Every word asked is the start of a word in the text: "validator" finds "validators", "near" not "linear". */
function matches(asked: string[], text: string): boolean {
  if (asked.length === 0) return false;
  const have = wordsOf(text);
  return asked.every((w) => have.some((h) => h.startsWith(w)));
}

// --- What kind of word it is

type Shape = 'evm' | 'near' | 'caip' | 'base58' | 'flower' | 'sha' | 'name';

function shapeOf(q: string): Shape {
  if (EVM_ADDRESS.test(q)) return 'evm';
  if (FLOWER_ID.test(q)) return 'flower';
  if (SHA.test(q)) return 'sha';
  if (CAIP_ACCOUNT.test(q)) return 'caip';
  if (NEAR_ACCOUNT.test(q)) return 'near';
  if (BASE58.test(q) && /\d/.test(q) && /[A-Z]/.test(q)) return 'base58';
  return 'name';
}

const isAccount = (s: Shape) => s === 'evm' || s === 'near' || s === 'caip' || s === 'base58';

// --- Stored reads

function titleOf(ctx: ToolContext, row: IndexRow): string {
  return ctx.modules[row.network]?.descriptor.title ?? row.network;
}

function storedRow(ctx: ToolContext, row: IndexRow) {
  return {
    network: row.network,
    title: titleOf(ctx, row),
    ...(row.params && Object.keys(row.params).length ? { params: row.params } : {}),
    sha256: row.sha256,
    as_of: row.as_of,
    block_height: row.block_height,
    known: 'stored' as Known,
  };
}

const rowText = (ctx: ToolContext, row: IndexRow) =>
  `${row.network} ${titleOf(ctx, row)} ${Object.values(row.params ?? {}).join(' ')}`;

// --- Accounts

interface AccountRow {
  account: string;
  role: 'holder' | 'delegator' | 'backed';
  in: string;
  network: string;
  sha256: string;
  as_of: string;
  known: Known;
  measure?: string;
  unit?: string;
  amount?: string;
  share?: number;
  rank?: number;
  of?: number;
  accounts?: number;
  /** what the read says it calls itself, and how that's known (self-declared, say) */
  identity?: { name: string; status: string };
}

/** The name a participant goes by in a read, never more than it says: a self-declared name stays so. */
function identityOf(s: Snapshot, id: string): { identity?: { name: string; status: string } } {
  const i = s.participants.find((p) => p.id === id)?.identity;
  return i?.name ? { identity: { name: i.name, status: i.status } } : {};
}

/** Its share and rank by the measure a flower of this read uses, when it holds any of it. */
function asHolder(
  ctx: ToolContext,
  s: Snapshot,
  sha256: string,
  ids: Set<string>,
): AccountRow | null {
  const measure = defaultMeasure(s, descriptorOf(ctx, s));
  if (!measure) return null;
  let f: ReturnType<typeof computeFigures>;
  try {
    f = computeFigures(s, { measure, petals: Number.MAX_SAFE_INTEGER });
  } catch {
    return null;
  }
  const row = f.shares.find((x) => ids.has(x.id.toLowerCase()));
  if (!row) return null;
  return {
    account: row.id,
    role: 'holder',
    in: s.network.title,
    network: s.network.id,
    sha256,
    as_of: s.snapshot.as_of,
    known: 'stored',
    measure: f.measure,
    unit: f.unit,
    amount: row.amount,
    share: row.share,
    rank: row.rank,
    of: f.participants_included,
    ...identityOf(s, row.id),
  };
}

/**
 * Where this account is a participant in what's stored. The relations index says which reads it is in
 * (by exact address, cheap); each of those is then read for its share and rank by the measure a flower
 * of it uses, since the index may have chosen another (near-validators: pool_contract_stake).
 */
async function accountsOf(
  ctx: ToolContext,
  query: string,
): Promise<{ rows: AccountRow[]; searched: Searched }> {
  const out = (await accountGroupsTool.run({ account: query, limit: 50 }, ctx)) as Json;
  if (isToolError(out))
    return { rows: [], searched: { id: 'accounts', status: 'down', note: out.error.message } };
  const groups = (out.groups ?? []) as Json[];
  const anchors = (out.anchor_of ?? []) as Json[];
  const ids = new Set(
    ((out.accounts ?? []) as string[]).map((a) => a.slice(a.lastIndexOf(':') + 1).toLowerCase()),
  );
  ids.add(query.slice(query.lastIndexOf(':') + 1).toLowerCase());
  const rows: AccountRow[] = [];
  const shas = [
    ...new Set(
      [
        ...groups.map((g) => (g.group as Json).snapshot_sha256),
        ...anchors.map((a) => a.snapshot_sha256),
      ].filter((x): x is string => typeof x === 'string'),
    ),
  ].slice(0, MAX_ACCOUNT_READS);
  const held = new Set<string>();
  for (const sha of shas) {
    const s = await findSnapshot(ctx, sha).catch(() => null);
    const r = s ? asHolder(ctx, s, sha, ids) : null;
    if (r) {
      rows.push(r);
      held.add(sha);
    }
  }
  for (const g of groups) {
    const group = g.group as Json;
    const sha = group.snapshot_sha256 as string;
    // its own share in a read already given above says the same thing twice
    if (held.has(sha) && group.kind === 'holdings') continue;
    const match = (g.match as Json | undefined)?.status;
    rows.push({
      account: String(g.account),
      role: group.kind === 'delegators' ? 'delegator' : 'holder',
      in: String(group.title),
      network: String(group.module),
      sha256: sha,
      as_of: String(group.as_of),
      known: match === 'inferred' ? 'inferred' : 'stored',
      measure: String(group.measure),
      unit: String(group.unit),
      amount: String(g.amount),
      share: Number(g.share),
      rank: Number(g.rank),
    });
  }
  for (const a of anchors) {
    const coverage = (a.coverage ?? {}) as Json;
    rows.push({
      account: query,
      role: 'backed',
      in: String(a.title),
      network: String(a.module),
      sha256: String(a.snapshot_sha256),
      as_of: String(a.as_of),
      known: 'stored',
      unit: String(a.unit),
      ...(typeof coverage.members_total === 'number' ? { accounts: coverage.members_total } : {}),
    });
  }
  return { rows, searched: { id: 'accounts', status: 'answered' } };
}

// --- The chain, for an EVM address

function chainRows(read: Json[]): { rows: Json[]; searched: Searched[] } {
  const rows: Json[] = [];
  const searched: Searched[] = [];
  for (const r of read) {
    const chain = String(r.chain);
    if (r.status !== 'answered') {
      searched.push({
        id: `chain:${chain}`,
        status: r.status === 'offline' ? 'skipped' : 'down',
        ...(r.note ? { note: String(r.note) } : {}),
      });
      continue;
    }
    searched.push({ id: `chain:${chain}`, status: 'answered' });
    const said = ((r.calls ?? []) as Json[])
      .filter((c) => c.ok)
      .map((c) => [String(c.fn).replace(/\(.*$/, ''), c.in_units ?? c.value] as const);
    const source = r.verified_source as Json | null | undefined;
    rows.push({
      chain,
      kind: r.kind,
      known: 'verified' as Known,
      ...(r.kind === 'account'
        ? { native_balance: r.native_balance, transactions_sent: r.transactions_sent }
        : {}),
      ...(r.delegates_code_to ? { delegates_code_to: r.delegates_code_to } : {}),
      ...(said.length ? { answers: Object.fromEntries(said) } : {}),
      ...(source?.name ? { verified_source: source.name } : {}),
      ...(r.proxy_of ? { proxy_of: r.proxy_of } : {}),
    });
  }
  return { rows, searched };
}

// --- Market and DAO lists, through find_target's searching

function listedRow(c: Json) {
  const sources = ((c.sources ?? []) as Json[]).map((s) => String(s.id));
  const confirmed = c.confirmed as Json | null;
  const known: Known = (confirmed?.answered as unknown[] | undefined)?.length
    ? 'verified'
    : sources.includes('petal-store') || ((c.draw ?? []) as Json[]).some((d) => d.stored)
      ? 'stored'
      : 'listed';
  return {
    name: c.name,
    symbol: c.symbol ?? null,
    kind: c.kind,
    chain: c.chain,
    address: c.address,
    ledger: c.ledger,
    transferable: c.transferable,
    known,
    listed_by: sources,
    draw: ((c.draw ?? []) as Json[]).map((d) => ({
      module: d.module,
      params: d.params,
      ...(d.stored ? { stored: d.stored } : {}),
      ...(d.note ? { note: d.note } : {}),
    })),
    cannot_draw: c.cannot_draw ?? null,
    evidence: c.evidence ?? {},
  };
}

const SOURCE_STATUS: Record<string, Searched['status']> = {
  answered: 'answered',
  failed: 'down',
  skipped: 'skipped',
};

// --- Saying it

const PLACES: Record<string, string> = {
  flowers: 'flowers',
  stored: 'stored reads',
  accounts: 'accounts in stored reads',
  chain: 'the chains',
  list: 'market and DAO lists',
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function sayIt(
  query: string,
  shape: Shape,
  found: { flowers: number; stored: number; accounts: number; listed: number },
  chain: Json[],
  searched: Searched[],
): string {
  const parts: string[] = [];
  // Models put an invented host in front of a relative link ("https://petal.example/f/…").
  if (found.flowers)
    parts.push(
      `${plural(found.flowers, 'flower')}, each with its view_url: a working link, to give exactly as it is, with nothing in front`,
    );
  if (found.stored) parts.push(plural(found.stored, 'stored read'));
  if (found.accounts)
    parts.push(`the account in ${plural(found.accounts, 'place')} in stored reads`);
  const accountOn = chain.filter((c) => c.kind === 'account').map((c) => c.chain);
  const contractOn = chain.filter((c) => c.kind === 'contract').map((c) => c.chain);
  if (accountOn.length)
    parts.push(`an account with no code on ${accountOn.join(', ')}, as the chain says now`);
  if (contractOn.length) parts.push(`a contract on ${contractOn.join(', ')}`);
  if (found.listed)
    parts.push(
      `${plural(found.listed, 'thing')} by that name in market and DAO lists, unconfirmed unless known says verified`,
    );
  const down = searched.filter((s) => s.status === 'down').map((s) => s.id);
  const downNote = down.length
    ? ` Did not answer: ${down.join(', ')}, which says nothing about "${query}".`
    : '';
  const kinds = searched.filter((s) => s.status !== 'skipped').map((s) => s.id.replace(/:.*$/, ''));
  const looked = `Looked in: ${[...new Set(kinds)].map((k) => PLACES[k] ?? k).join(', ') || 'nothing'}.`;
  if (parts.length === 0) {
    const where = isAccount(shape)
      ? 'No stored read has this account, and no chain Petal reads said anything about it.'
      : `Nothing Petal holds or lists answers to "${query}".`;
    return `${where} ${looked}${downNote} That isn't the same as not existing: search and read_page look further, and read_chain reads any address.`;
  }
  return `Found ${parts.join('; ')}. ${looked}${downNote}`;
}

// --- The tool

export function makeLookUp(
  deps: { fetch?: typeof globalThis.fetch } = {},
): PetalTool<{ query: string; chain?: string }, object> {
  const findTarget = makeFindTarget(deps);
  const readChain = makeReadChain(deps);
  const KNOWN = { enum: ['verified', 'stored', 'listed', 'inferred'] };
  const ROWS = { type: 'array', items: { type: 'object' } };
  return defineTool({
    name: 'look_up',
    title: 'Look up',
    description:
      "What Petal knows about any word (a name, ticker, address, account): flowers with view_url, stored reads with dates, accounts in them, what the chain says of an address, and what market and DAO lists name, each marked how it's known. Never fails on a guess.",
    input: obj(
      ['query'],
      {
        query: { type: 'string', minLength: 1, maxLength: 200 },
        chain: { type: 'string', description: 'a chain, when the person named one' },
      },
      { additionalProperties: false },
    ),
    output: obj(['query', 'says', 'flowers', 'stored', 'accounts', 'chain', 'listed', 'searched'], {
      query: { type: 'string' },
      says: { type: 'string' },
      flowers: {
        type: 'array',
        items: obj(['id', 'title', 'network', 'as_of', 'where', 'view_url', 'known'], {
          id: { type: 'string' },
          title: { type: 'string' },
          network: { type: 'string' },
          as_of: { type: 'string' },
          where: { enum: ['map', 'fixture'] },
          view_url: { type: 'string' },
          known: KNOWN,
        }),
      },
      stored: {
        type: 'array',
        items: obj(['network', 'title', 'sha256', 'as_of', 'block_height', 'known'], {
          network: { type: 'string' },
          title: { type: 'string' },
          params: { type: 'object' },
          sha256: { type: 'string' },
          as_of: { type: 'string' },
          block_height: { type: ['integer', 'null'] },
          known: KNOWN,
        }),
      },
      accounts: {
        type: 'array',
        items: obj(['account', 'role', 'in', 'network', 'sha256', 'as_of', 'known'], {
          account: { type: 'string' },
          role: { enum: ['holder', 'delegator', 'backed'] },
          in: { type: 'string' },
          network: { type: 'string' },
          sha256: { type: 'string' },
          as_of: { type: 'string' },
          known: KNOWN,
        }),
      },
      chain: ROWS,
      listed: ROWS,
      ambiguous: { type: 'boolean' },
      searched: {
        type: 'array',
        items: obj(['id', 'status'], {
          id: { type: 'string' },
          status: { enum: ['answered', 'down', 'skipped'] },
          note: { type: 'string' },
        }),
      },
    }),
    annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
    async run({ query, chain }, ctx) {
      const q = query.trim();
      const shape = shapeOf(q);
      const searched: Searched[] = [];
      const asked = wordsOf(parseQuery(q, chain).core);

      const [flowersAll, rows, accounts, chainRead] = await Promise.all([
        allFlowers(ctx),
        ctx.store.list().catch(() => null),
        isAccount(shape) ? accountsOf(ctx, q) : null,
        shape === 'evm'
          ? readChain.run({ address: q, ...(chain ? { chain } : {}) }, ctx).then((o) => o as Json)
          : null,
      ]);
      searched.push({ id: 'flowers', status: flowersAll.map === 'down' ? 'down' : 'answered' });
      searched.push(rows ? { id: 'stored', status: 'answered' } : { id: 'stored', status: 'down' });
      if (accounts) searched.push(accounts.searched);

      let chainOut: Json[] = [];
      if (chainRead && !isToolError(chainRead)) {
        const c = chainRows((chainRead.read ?? []) as Json[]);
        chainOut = c.rows;
        searched.push(...c.searched);
      } else if (chainRead) {
        const why = (chainRead as unknown as { error: { message: string } }).error.message;
        searched.push({ id: 'chain', status: 'skipped', note: why });
      }

      // A name goes to the lists; an address only where a chain holds code there. A NEAR account,
      // a flower id or a snapshot hash is answered by what Petal holds.
      const contractOn = chainOut.filter((c) => c.kind === 'contract').map((c) => String(c.chain));
      let listed: Json[] = [];
      let ambiguous = false;
      if (shape === 'name' || shape === 'base58' || contractOn.length) {
        const pick = shape === 'evm' ? (chain ?? contractOn[0]) : chain;
        const found = (await findTarget.run(
          { query: q, ...(pick ? { chain: pick } : {}) },
          ctx,
        )) as Json;
        if (!isToolError(found)) {
          listed = ((found.candidates ?? []) as Json[]).slice(0, MAX_LISTED).map(listedRow);
          ambiguous = found.ambiguous === true;
          for (const s of (found.sources ?? []) as Json[]) {
            const id = String(s.id);
            // the chain was read above, or the lists' own row says so
            if (id.startsWith('chain:') && searched.some((x) => x.id === id)) continue;
            searched.push({
              id: id.startsWith('chain:') ? id : `list:${id}`,
              status: SOURCE_STATUS[String(s.status)] ?? 'skipped',
              ...(s.note && s.status !== 'answered' ? { note: String(s.note) } : {}),
            });
          }
        }
      }

      // Stored reads: by their words, by hash, by what a list says Petal holds, or where the account is.
      const index = rows ?? [];
      const shas = new Set<string>();
      for (const r of accounts?.rows ?? []) shas.add(r.sha256);
      for (const c of listed)
        for (const d of (c.draw ?? []) as Json[]) {
          const st = d.stored as Json | undefined;
          if (typeof st?.sha256 === 'string') shas.add(st.sha256);
        }
      const stored = index
        .filter(
          (r) =>
            shas.has(r.sha256) ||
            r.sha256 === q ||
            (shape === 'name' && matches(asked, rowText(ctx, r))) ||
            (shape === 'evm' &&
              Object.values(r.params ?? {}).some((v) => v.toLowerCase() === q.toLowerCase())),
        )
        .sort((a, b) => b.as_of.localeCompare(a.as_of))
        .map((r) => {
          // the read's own title ("ENS delegates") where it was opened, not the module's
          const own = accounts?.rows.find((x) => x.sha256 === r.sha256 && x.role === 'holder');
          return { ...storedRow(ctx, r), ...(own ? { title: own.in } : {}) };
        });
      for (const s of stored) shas.add(s.sha256);

      // Flowers: by their words, by id, or because they draw a read found above.
      const flowerText = (f: Found) => {
        const sp = f.entry.spec;
        const module = ctx.modules[sp.network.id]?.descriptor.title ?? '';
        return `${f.entry.title ?? ''} ${sp.network.id} ${module} ${Object.values(sp.network.params ?? {}).join(' ')}`;
      };
      const flowers = flowersAll.found
        .filter(
          (f) =>
            f.entry.id === q ||
            shas.has(f.entry.spec.snapshot.sha256) ||
            (shape === 'name' && matches(asked, flowerText(f))),
        )
        .map((f) => {
          const s = summaryOf(f, ctx);
          return {
            id: s.id,
            title: s.title,
            network: s.network,
            as_of: s.as_of,
            where: s.where,
            view_url: s.view_url,
            known: 'stored' as Known,
          };
        });

      const says = sayIt(
        q,
        shape,
        {
          flowers: flowers.length,
          stored: stored.length,
          accounts: accounts?.rows.length ?? 0,
          listed: listed.length,
        },
        chainOut,
        searched,
      );
      return {
        query: q,
        says,
        flowers,
        stored,
        accounts: accounts?.rows ?? [],
        chain: chainOut,
        listed,
        ...(ambiguous ? { ambiguous } : {}),
        searched,
      };
    },
  });
}

export const lookUp = makeLookUp();
