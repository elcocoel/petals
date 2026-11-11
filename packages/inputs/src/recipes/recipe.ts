// Reading recipes (specs/005-mapping-brain/data.md, Readers): a framework as a file that names its
// contract's calls and events, and which of a few reading shapes reads each one. No code in a file:
// this checks it, and runs it with the shapes in shapes.ts, within its bounds. The files live in
// the brain (`@petal/brain`, recipes/), and one becomes a module like any other.
import type {
  Capabilities,
  Holding,
  NetworkDescriptor,
  ParamSpec,
  Params,
  Participant,
  Progress,
  Snapshot,
} from '@petal/core/types';
import { InputError } from '../errors.ts';
import { encodeCall, shortAddress } from '../evm/abi.ts';
import { parseSignature } from '../evm/abi-values.ts';
import { EVM_CHAINS, type EvmChain } from '../evm/chains.ts';
import { type EvmReader, evmReader } from '../evm/reader.ts';
import type { InputModule } from '../index.ts';
import { plainCapabilities } from '../modules/plain.ts';
import { paramModule } from '../modules/stored.ts';
import { countByParticipant, countBySender, tokenBalances } from './shapes.ts';

export const RECIPE_VERSION = 'recipe/v1';
export const SHAPES = ['token_balances', 'count_by_participant', 'count_by_sender'] as const;
export type ShapeId = (typeof SHAPES)[number];

export interface RecipeMeasure {
  name: string;
  unit: string;
  kind: 'amount' | 'count';
  label: string;
  shape: ShapeId;
  /** token_balances: the call on the contract that names the token */
  token?: { call: string };
  /** count_by_participant and count_by_sender: the event, as Name(type,type,…) */
  event?: string;
  /** count_by_participant: which topic holds the address (1 to 3) */
  participant?: { topic: number };
  /** read only when asked for by name */
  optional?: boolean;
}

export interface ReadingRecipe {
  petal: typeof RECIPE_VERSION;
  id: string;
  /** the brain's department it's in (brain-index/v2) */
  department?: string;
  title: string;
  for: string;
  description: string;
  chains: string[];
  params: Record<string, ParamSpec>;
  recognise: { answers: string[] };
  measures: RecipeMeasure[];
  bounds: { max_log_calls: number; max_sender_calls: number };
}

const ID = /^[a-z0-9][a-z0-9-]{1,40}$/;
const NAME = /^[a-z][a-z0-9_]{0,40}$/;
/** A recipe asks for at most this much, whatever it says. */
const MAX_LOG_CALLS = 400;
const MAX_SENDER_CALLS = 1000;

/** A recipe as a file holds it, checked, or why not. Nothing runs from a file that fails this. */
export function checkRecipe(x: unknown): ReadingRecipe {
  const bad = (why: string): never => {
    throw new InputError('bad_input', `not a reading recipe: ${why}`, {
      hint: 'See brain/README.md for what a recipe holds.',
    });
  };
  if (!x || typeof x !== 'object' || Array.isArray(x)) return bad('not an object');
  const r = x as Partial<ReadingRecipe>;
  if (r.petal !== RECIPE_VERSION) bad(`petal must be ${RECIPE_VERSION}`);
  if (typeof r.id !== 'string' || !ID.test(r.id)) bad('id must be lowercase letters, digits and -');
  for (const k of ['title', 'for', 'description'] as const) {
    if (typeof r[k] !== 'string' || !(r[k] as string).trim()) bad(`${k} must be text`);
  }
  if (!Array.isArray(r.chains) || !r.chains.length) bad('chains must list at least one chain');
  for (const c of r.chains ?? []) if (!EVM_CHAINS[c]) bad(`Petals doesn't read the chain ${c}`);
  if (!r.params?.chain || !r.params?.dao) bad('params must include chain and dao');
  if (!Array.isArray(r.recognise?.answers)) bad('recognise.answers must be a list of calls');
  for (const call of r.recognise?.answers ?? []) if (!parseSignature(call)) bad(`bad call ${call}`);
  if (!Array.isArray(r.measures) || !r.measures.some((m) => !m.optional))
    bad('measures must include one that is not optional');
  const names = new Set<string>();
  for (const m of r.measures ?? []) {
    if (!NAME.test(m.name ?? '')) bad(`measure name ${m.name} must be lowercase_with_underscores`);
    if (names.has(m.name)) bad(`measure ${m.name} appears twice`);
    names.add(m.name);
    if (!m.unit || !m.label) bad(`measure ${m.name} needs a unit and a label`);
    if (m.kind !== 'amount' && m.kind !== 'count')
      bad(`measure ${m.name}: kind is amount or count`);
    if (!(SHAPES as readonly string[]).includes(m.shape))
      bad(`measure ${m.name}: shape must be one of ${SHAPES.join(', ')}`);
    if (m.shape === 'token_balances' && !parseSignature(m.token?.call ?? ''))
      bad(`measure ${m.name}: token.call must be a call such as sharesToken()`);
    if (m.shape !== 'token_balances' && !parseSignature(m.event ?? ''))
      bad(`measure ${m.name}: event must be a signature such as Vote(address,uint256)`);
    if (m.shape === 'count_by_participant') {
      const t = m.participant?.topic;
      if (t !== 1 && t !== 2 && t !== 3) bad(`measure ${m.name}: participant.topic is 1, 2 or 3`);
    }
  }
  const b = r.bounds;
  if (!b || !Number.isInteger(b.max_log_calls) || !Number.isInteger(b.max_sender_calls))
    bad('bounds must give max_log_calls and max_sender_calls');
  if ((b?.max_log_calls ?? 0) > MAX_LOG_CALLS || (b?.max_sender_calls ?? 0) > MAX_SENDER_CALLS)
    bad(`bounds are at most ${MAX_LOG_CALLS} log calls and ${MAX_SENDER_CALLS} sender calls`);
  return r as ReadingRecipe;
}

interface Target {
  chain: EvmChain;
  dao: string;
  measures: RecipeMeasure[];
  population: string;
}

function targetOf(recipe: ReadingRecipe, params: Params | undefined): Target {
  const chainId = String(params?.chain ?? recipe.params.chain?.default ?? recipe.chains[0]);
  const chain = EVM_CHAINS[chainId];
  if (!chain || !recipe.chains.includes(chainId))
    throw new InputError('bad_input', `${recipe.id} reads ${recipe.chains.join(', ')}`, {
      hint: `chain: one of ${recipe.chains.join(', ')}`,
    });
  const dao = String(params?.dao ?? '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(dao))
    throw new InputError('bad_input', `${recipe.id} needs dao, the contract address`, {
      hint: 'dao: 0x and 40 hex digits',
    });
  const asked = params?.measures ? String(params.measures).split(',') : null;
  const measures = asked
    ? asked.map((n) => {
        const m = recipe.measures.find((x) => x.name === n);
        if (!m)
          throw new InputError('bad_input', `${recipe.id} has no measure ${n}`, {
            hint: `measures: ${recipe.measures.map((x) => x.name).join(', ')}`,
          });
        return m;
      })
    : recipe.measures.filter((m) => !m.optional);
  const which = asked ? `-${asked.join('+')}` : '';
  return { chain, dao, measures, population: `${recipe.id}-${chain.id}-${dao}${which}` };
}

/** What a recipe can draw: plain, with every measure it reads, and any of them as height. */
function capabilitiesOf(recipe: ReadingRecipe, sources: string[]): Capabilities {
  const first = recipe.measures.find((m) => !m.optional) as RecipeMeasure;
  const caps = plainCapabilities({
    measure: { id: first.name, unit: first.unit, label: first.label },
    sources,
    kind: { meaning: 'every member is an address of unknown kind', sources },
    identity: { meaning: 'anonymous: names are not read', sources },
  });
  return {
    ...caps,
    measures: recipe.measures.map((m) => ({ id: m.name, unit: m.unit, label: m.label })),
    by: { ...caps.by, height: [...(caps.by.height ?? []), 'm:<metric>'] },
  };
}

export function recipeDescriptor(recipe: ReadingRecipe): NetworkDescriptor {
  const chain = EVM_CHAINS[recipe.chains[0] as string] as EvmChain;
  const sources = [`${recipe.id}-logs`, `${recipe.id}-state`];
  return {
    id: recipe.id,
    chain: chain.caip2,
    population: recipe.id,
    kind: 'dao',
    title: recipe.title,
    description: `${recipe.description} (A reading recipe: brain/${recipe.department ?? 'governance'}/recipes/${recipe.id}.json.)`,
    params: recipe.params,
    capabilities: capabilitiesOf(recipe, sources),
    live: true,
    cost: {
      calls: 40,
      seconds: 30,
      note: `the logs of its events and its tokens' transfers, and up to ${recipe.bounds.max_sender_calls} transaction reads for a measure counted by sender`,
    },
    sources: sources.map((id) => ({
      id,
      kind: 'chain' as const,
      url: chain.endpoints[0]?.url ?? '',
    })),
  };
}

export interface PullRecipeOptions {
  reader?: EvmReader;
  block?: number;
  onProgress?: Progress;
}

/** Run a recipe at one block: each measure through its shape, all in one snapshot. */
export async function pullRecipe(
  recipe: ReadingRecipe,
  params: Params | undefined,
  opts: PullRecipeOptions = {},
): Promise<Snapshot> {
  const t = targetOf(recipe, params);
  const reader =
    opts.reader ?? evmReader({ chain: t.chain, maxLogCalls: recipe.bounds.max_log_calls });
  const say = (message: string) => opts.onProgress?.({ stage: 'fetching', message });
  const at = await reader.block(opts.block ?? 'finalized');
  // the contract answers what a contract of this kind answers, or this isn't one
  for (const call of recipe.recognise.answers) {
    try {
      await reader.call(t.dao, encodeCall(call), at.number);
    } catch {
      throw new InputError(
        'bad_input',
        `${t.dao} doesn't answer ${call}, so it isn't a ${recipe.title}`,
        {
          hint: 'Check the address and chain, or read it with read_chain to see what it is.',
        },
      );
    }
  }
  // from the first block: the chains read here take wide log ranges, and the bounds stop a long walk
  const from = 0;
  const logsSource = `${recipe.id}-logs`;
  const stateSource = `${recipe.id}-state`;
  const participants = new Map<string, Participant>();
  const holdings: Holding[] = [];
  const meet = (id: string, source: string) => {
    if (!participants.has(id))
      participants.set(id, {
        id,
        label: id.startsWith('0x') ? shortAddress(id) : id,
        kind: 'unknown',
        identity: null,
        source,
      });
  };
  const notes: string[] = [];
  for (const m of t.measures) {
    say(`reading ${m.label}`);
    const rows =
      m.shape === 'token_balances'
        ? await tokenBalances(reader, t.chain, t.dao, m.token?.call ?? '', at.number, from)
        : m.shape === 'count_by_participant'
          ? await countByParticipant(
              reader,
              t.dao,
              m.event ?? '',
              m.participant?.topic ?? 1,
              from,
              at.number,
            )
          : await countBySender(
              reader,
              t.dao,
              m.event ?? '',
              from,
              at.number,
              recipe.bounds.max_sender_calls,
              say,
            );
    const source = m.shape === 'token_balances' ? stateSource : logsSource;
    for (const p of rows.participants ?? [])
      if (!participants.has(p.id)) participants.set(p.id, { ...p, source });
    for (const r of rows.values) {
      meet(r.id, source);
      holdings.push({
        participant: r.id,
        asset: rows.asset ?? t.dao,
        measure: m.name,
        amount: r.amount,
        ...(r.raw !== undefined ? { amount_raw: r.raw } : {}),
        unit: m.unit,
        as_of: at.as_of,
        source,
      });
    }
    notes.push(`${m.name}: ${rows.values.length} addresses${rows.note ? ` (${rows.note})` : ''}`);
  }
  const first = t.measures[0] as RecipeMeasure;
  const counted = holdings.filter((h) => h.measure === first.name);
  const total = sumDecimals(counted.map((h) => h.amount));
  return {
    petal: 'snapshot/v1',
    network: {
      id: recipe.id,
      chain: t.chain.caip2,
      population: t.population,
      title: recipe.title,
      description: notes.join('; '),
      params: {
        dao: t.dao,
        chain: t.chain.id,
        ...(params?.measures ? { measures: String(params.measures) } : {}),
      },
    },
    snapshot: { as_of: at.as_of, block_height: at.number, block_hash: at.hash, final: true },
    coverage: {
      participants_total: counted.length,
      participants_included: counted.length,
      amount_total: String(total),
      amount_included: String(total),
      unit: first.unit,
      measure: first.name,
    },
    sources: [
      {
        id: logsSource,
        kind: 'chain',
        url: reader.servedBy('logs') || t.chain.endpoints[0]?.url || '',
        method: `eth_getLogs of the contract's events, from block ${from}`,
        fetched_at: at.as_of,
        block_height: at.number,
      },
      {
        id: stateSource,
        kind: 'chain',
        url: reader.servedBy('state') || t.chain.endpoints[0]?.url || '',
        method: 'eth_call, eth_getTransactionByHash',
        fetched_at: at.as_of,
        block_height: at.number,
      },
    ],
    participants: [...participants.values()],
    holdings,
    relationships: [],
    events: [],
    module: { id: recipe.id, version: RECIPE_VERSION },
  } as Snapshot;
}

/** Exact sums of decimal text, so 18-decimal amounts don't drift. */
function sumDecimals(xs: string[]): string {
  const scale = Math.max(0, ...xs.map((x) => (x.split('.')[1] ?? '').length));
  const total = xs.reduce((t, x) => {
    const [whole = '0', frac = ''] = x.split('.');
    return t + BigInt(whole + frac.padEnd(scale, '0'));
  }, 0n);
  const text = total.toString().padStart(scale + 1, '0');
  return scale ? `${text.slice(0, -scale)}.${text.slice(-scale)}`.replace(/\.?0+$/, '') : text;
}

/** A recipe as a module, so every tool that reads a network can read it. */
export function recipeModule(recipe: ReadingRecipe, opts: { fixtures?: string } = {}): InputModule {
  return paramModule({
    descriptor: recipeDescriptor(recipe),
    keyFor: (params) => {
      const t = targetOf(recipe, params);
      return { chain: t.chain.caip2, population: t.population };
    },
    pinnable: true,
    head: async (params, block) => {
      const b = await evmReader({ chain: targetOf(recipe, params).chain }).block(
        block ?? 'finalized',
      );
      return { block_height: b.number, as_of: b.as_of };
    },
    pull: (at, params, onProgress) =>
      pullRecipe(recipe, params, { block: at.block_height, ...(onProgress ? { onProgress } : {}) }),
    ...opts,
  });
}
