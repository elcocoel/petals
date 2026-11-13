// The Power Map's maps for agents, so an agent navigates and interprets what's already there instead of counting
// everything from scratch. look_up finds a map by any word with its link (mapIndex, mapRow); get_map hands one
// map's layers over to be interpreted: its readings, proposals, value, payouts, Petals' mapping's Insights and
// the person's own names on its accounts, each saying where and when. Nothing here reads anew: it's what the map
// holds.
import { payoutsIn, validateMark, validateProposals } from '@petal/core';
import type { Claim, NextStep, NextSteps } from '@petal/core/types';
import { EVM_CHAINS } from '@petal/inputs';
import { defineTool } from '../define.ts';
import { privateStore } from '../drafts.ts';
import { ToolFailure } from '../errors.ts';
import { hiddenMap } from '../hidden.ts';
import {
  type CardMark,
  cardMark,
  chainName,
  chainWords,
  type MapCard,
  madeByWords,
  mapsOf,
  mapViews,
} from '../map.ts';
import { ADDRESS, aboutOneOf, cardAccounts, claimsAbout } from '../mapping-claims.ts';
import { payoutsOf } from '../payouts.ts';
import { cardProposals } from '../proposals.ts';
import { publishable } from '../publish-data.ts';
import type { ToolContext } from '../types.ts';
import { valuesOf } from '../value-store.ts';
import { layerOwnerOf } from './datasets.ts';
import { open, REF } from './explorations.ts';
import { base, obj } from './shared.ts';

/** A map's page: opened from a chat on /make, it opens on the canvas beside it (the web's mapLink). */
export const mapUrl = (ctx: ToolContext, id: string) => `${base(ctx)}/m/${encodeURIComponent(id)}`;

/** A map's id from its id or its link, as a model may pass either. */
export function mapIdOf(given: string): string {
  const at = given.indexOf('/m/');
  if (at < 0) return given.trim();
  const rest = given.slice(at + 3).split(/[?#/]/)[0] ?? '';
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

/** Each map's mark, by its address, as the site serves it. */
async function marksOf(ctx: ToolContext): Promise<Map<string, CardMark>> {
  const out = new Map<string, CardMark>();
  for (const r of await privateStore(ctx.config).mark.list()) {
    const m = validateMark(JSON.parse(r.body));
    if (m.ok) out.set(r.about, cardMark(m.value, base(ctx)));
  }
  return out;
}

/** One map's proposals in short, or null when none were read. */
async function proposalsFor(ctx: ToolContext, id: string) {
  const row = await privateStore(ctx.config).proposals.get(id);
  if (!row) return null;
  const p = validateProposals(JSON.parse(row.body));
  return p.ok ? cardProposals(p.value) : null;
}

/** What a map is called: its newest named drawing's name, its own name (mark), or its reading's title. */
const nameOf = (c: MapCard) => c.name ?? c.mark?.name?.value ?? c.title;

export interface Indexed {
  card: MapCard;
  /** every word it goes by: its names, symbol, types, what was read, its chain, its addresses */
  text: string;
  /** its addresses and its readings' params, lower case where EVM */
  addresses: string[];
}

/**
 * The maps on the Power Map, newest first, each with the words and addresses it's found by. With hidden, the
 * maps hidden from the Power Map too.
 */
export async function mapIndex(ctx: ToolContext, o: { hidden?: boolean } = {}): Promise<Indexed[]> {
  const views = await mapViews(ctx, undefined, o);
  const cards = mapsOf(views, await marksOf(ctx), await valuesOf(ctx));
  const ofMap = new Map<string, typeof views>();
  for (const v of views) ofMap.set(v.map, [...(ofMap.get(v.map) ?? []), v]);
  return cards.map((card) => {
    const vs = ofMap.get(card.id) ?? [];
    const addresses = [
      card.id,
      card.id.slice(card.id.lastIndexOf(':') + 1),
      ...(card.address ? [card.address] : []),
      ...vs.flatMap((v) => Object.values(v.params ?? {})),
    ].map((a) => (/^(eip155:\d+:)?0x[0-9a-fA-F]{40}$/.test(a) ? a.toLowerCase() : a));
    const text = [
      card.name,
      card.mark?.name?.value,
      card.mark?.symbol?.value,
      ...(card.mark?.type_words ?? []),
      card.title,
      card.about,
      card.chain,
      ...vs.flatMap((v) => [v.name, v.title]),
    ]
      .filter(Boolean)
      .join(' ');
    return { card, text, addresses: [...new Set(addresses)] };
  });
}

/** A map as look_up gives it: enough to go there and say what's there, and get_map for the rest. */
export async function mapRow(ctx: ToolContext, card: MapCard) {
  const proposals = await proposalsFor(ctx, card.id);
  const price = card.value?.price ?? null;
  return {
    id: card.id,
    name: nameOf(card),
    about: card.about,
    chain: card.chain,
    map_url: mapUrl(ctx, card.id),
    readings: card.readings.map((r) => ({
      snapshot: r.snapshot,
      about: r.about,
      as_of: r.as_of,
      count: r.count,
      by: madeByWords(r.made_by),
    })),
    proposals: proposals
      ? { count: proposals.count, voted: proposals.voted, period: proposals.period }
      : null,
    price: price ? { usd: price.usd, at: price.at, source: price.source } : null,
    known: 'stored' as const,
  };
}

export const MAP_ROW = obj(['id', 'name', 'about', 'chain', 'map_url', 'readings', 'known'], {
  id: {
    type: 'string',
    description: "the map's address: get_map, find_voting_blocs and list_payouts take it",
  },
  name: { type: 'string' },
  about: { type: 'string' },
  chain: { type: 'string' },
  map_url: {
    type: 'string',
    description:
      'its page: a working link, to give exactly as it is; in a chat on /make it opens beside it',
  },
  readings: { type: 'array', items: { type: 'object' } },
  proposals: { type: ['object', 'null'] },
  price: { type: ['object', 'null'] },
  known: { enum: ['stored'] },
});

/** A claim as an agent reads it: about what, what it says, how it's known, when. */
function insight(c: Claim) {
  const object = typeof c.object === 'string' ? c.object : c.object.value;
  return {
    about: c.subject,
    verb: c.verb,
    says: typeof object === 'string' ? object : JSON.stringify(object),
    kind: c.kind,
    at: c.issued_at,
    // who answers for it: Petals' mapping, or the person who published it
    ...(c.by ? { by: c.by } : {}),
  };
}

export const getMap = defineTool<{ map: string }, Record<string, unknown>>({
  name: 'get_map',
  title: 'Get a map',
  description:
    "One map on the Power Map, by its address (look_up's maps give it) or its link: everything already there, " +
    'to interpret without reading anew. Its link; its readings, each with its date, size and who mapped it; its ' +
    'proposals and the period they cover; its value (price, supply, market cap, treasury), each with its source ' +
    "and date; its payouts in short; Insights, the claims Petals' mapping made about its accounts and those people " +
    'published, each with who answers for it; and the ' +
    "signed-in person's own names for its accounts, which are theirs alone until they publish them. " +
    'describe_snapshot and compute_figures count a reading; find_voting_blocs and list_payouts go deeper.',
  input: obj(
    ['map'],
    {
      map: {
        type: 'string',
        minLength: 3,
        description: "the map's address (its id in look_up's maps), or its map_url",
      },
    },
    { additionalProperties: false },
  ),
  output: obj(
    [
      'id',
      'name',
      'about',
      'chain',
      'map_url',
      'readings',
      'proposals',
      'value',
      'payouts',
      'insights',
      'your_names',
    ],
    {
      id: { type: 'string' },
      name: { type: 'string' },
      about: { type: 'string' },
      chain: { type: 'string' },
      address: { type: ['string', 'null'] },
      map_url: { type: 'string' },
      symbol: { type: ['string', 'null'] },
      types: { type: 'array', items: { type: 'string' } },
      hidden: { type: 'string', description: 'why it is kept off the Power Map, when it is' },
      readings: {
        type: 'array',
        items: obj(['snapshot', 'about', 'as_of', 'count', 'by', 'drawn'], {
          snapshot: { type: 'string' },
          about: { type: 'string' },
          title: { type: 'string' },
          as_of: { type: 'string' },
          count: { type: ['integer', 'null'] },
          by: { type: 'string' },
          drawn: { type: 'integer', minimum: 0 },
        }),
      },
      proposals: { type: ['object', 'null'] },
      value: { type: ['object', 'null'] },
      payouts: { type: ['object', 'null'] },
      insights: {
        type: 'array',
        items: obj(['about', 'verb', 'says', 'kind', 'at'], {
          about: { type: 'string' },
          verb: { type: 'string' },
          says: { type: 'string' },
          kind: { type: 'string' },
          at: { type: 'string' },
          by: { type: 'string' },
        }),
      },
      your_names: {
        type: 'array',
        items: obj(['account', 'name'], { account: { type: 'string' }, name: { type: 'string' } }),
      },
    },
  ),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  failure: 'not_found',
  async run({ map }, ctx) {
    const id = mapIdOf(map);
    const found = (await mapIndex(ctx, { hidden: true })).find((x) => x.card.id === id);
    if (!found)
      throw new ToolFailure(
        'not_found',
        `No map on the Power Map has the address ${id}.`,
        "look_up with its name or address gives each map's id.",
      );
    const card = found.card;
    const accounts = await cardAccounts(ctx, card);
    const [proposals, paid, claims, own] = await Promise.all([
      proposalsFor(ctx, card.id),
      payoutsOf(ctx, card.id),
      claimsAbout(ctx, accounts),
      ctx.caller?.subject
        ? privateStore(ctx.config).annotation.list(ctx.caller.subject)
        : Promise.resolve([]),
    ]);
    const totals = paid ? payoutsIn(paid).totals : null;
    const dates = (paid?.payouts ?? [])
      .map((x) => x.when)
      .filter((w): w is string => !!w)
      .sort();
    const hidden = hiddenMap(card.id);
    return {
      id: card.id,
      name: nameOf(card),
      about: card.about,
      chain: card.chain,
      address: card.address,
      map_url: mapUrl(ctx, card.id),
      symbol: card.mark?.symbol?.value ?? null,
      types: card.mark?.type_words ?? [],
      ...(hidden ? { hidden: hidden.why } : {}),
      readings: card.readings.map((r) => ({
        snapshot: r.snapshot,
        about: r.about,
        title: r.title,
        as_of: r.as_of,
        count: r.count,
        by: madeByWords(r.made_by),
        drawn: r.drawings.length,
      })),
      proposals,
      value: card.value,
      payouts:
        paid && totals
          ? {
              read_at: paid.read_at,
              count: totals.count,
              recipients: totals.recipients,
              usd: totals.usd,
              priced: totals.priced,
              period: dates.length ? { from: dates[0], to: dates.at(-1) } : null,
            }
          : null,
      insights: claims.map(insight),
      your_names: own
        .filter((r) => r.verb === 'named' && aboutOneOf(accounts, r.subject))
        .map((r) => {
          const c = JSON.parse(r.body) as Claim;
          const name = typeof c.object === 'string' ? c.object : c.object.value;
          return { account: r.subject, name: String(name) };
        }),
    };
  },
});

/** An address as mapIndex keeps it: an EVM address in lower case. */
const addressKey = (a: string) => (/^0x[0-9a-fA-F]{40}$/.test(a) ? a.toLowerCase() : a);

/**
 * Where a new read of this target would land, for the ceremony's card (a map that exists, or a placeholder for a
 * new one): the map already at one of its addresses (or, for a whole network, the map its reader already drew),
 * its name and chain, and what will be read, in words. Nothing is read.
 */
export async function whereItLands(
  ctx: ToolContext,
  network: string,
  params: Record<string, unknown> = {},
): Promise<{
  existing_map: string | null;
  name: string | null;
  chain: string | null;
  what: string;
}> {
  const d = ctx.modules[network]?.descriptor;
  const asked = typeof params.chain === 'string' ? params.chain.trim().toLowerCase() : null;
  const caip2 = asked ? (EVM_CHAINS[asked]?.caip2 ?? asked) : (d?.chain ?? null);
  const chain = asked ?? (caip2 && caip2 !== 'none' ? chainName(caip2) : null);
  const addresses = Object.values(params)
    .filter((v): v is string => typeof v === 'string' && ADDRESS.test(v.trim()))
    .map((v) => addressKey(v.trim()));
  const index = await mapIndex(ctx, { hidden: true });
  const on = (m: Indexed) => !chain || m.card.chain === chain;
  const found = addresses.length
    ? index.find((m) => on(m) && addresses.some((a) => m.addresses.includes(a)))
    : index.find(
        (m) => on(m) && !m.card.address && m.card.readings.some((r) => r.network === network),
      );
  const reader = d?.title ?? network;
  const where = caip2 && caip2 !== 'none' ? chainWords(caip2) : null;
  const what =
    where && !reader.toLowerCase().includes(where.toLowerCase()) ? `${reader} on ${where}` : reader;
  return {
    existing_map: found?.card.id ?? null,
    name: found ? nameOf(found.card) : null,
    chain: found?.card.chain ?? chain,
    what,
  };
}

/** The brain's services that go with a map (brain/services), each by its task's words in brain/routing.md. */
const SERVICES: { label: string; needs?: 'proposals' | 'treasury' }[] = [
  { label: 'A governance health report', needs: 'proposals' },
  { label: 'A distribution card' },
  { label: 'An authority map' },
  { label: 'A treasury and unlocks calendar', needs: 'treasury' },
  { label: 'A full DAO report', needs: 'proposals' },
];

/**
 * The next steps on a map just read (the brain's services as one-press options: show the blocs, what it paid out,
 * compare with…), from what get_map said it holds: each a message to send, or, finish false, words for the person
 * to finish.
 */
export function nextSteps(m: {
  id: string;
  name: string;
  proposals: { voted?: number } | null;
  payouts: { count?: number } | null;
  value: { treasury_usd?: string | null } | null;
}): NextSteps {
  const steps: NextStep[] = [];
  if ((m.proposals?.voted ?? 0) > 0)
    steps.push({ label: 'Show the blocs', ask: `Who votes together in ${m.name}?`, finish: true });
  if ((m.payouts?.count ?? 0) > 0)
    steps.push({ label: 'What it paid out', ask: `What has ${m.name} paid out?`, finish: true });
  steps.push({ label: 'Compare with…', ask: `Compare ${m.name} with `, finish: false });
  const has = { proposals: !!m.proposals, treasury: !!m.value?.treasury_usd };
  const services = SERVICES.filter((x) => !x.needs || has[x.needs]).map((x) => ({
    label: x.label,
    ask: `${x.label} for ${m.name}`,
    finish: true,
  }));
  return { map: m.id, steps, services };
}

/** One item as the person reads it before publishing: what it says, about which account, from where, how sure. */
const PUBLISH_ROW = obj(['layer', 'id', 'subject', 'verb', 'name', 'source', 'confidence'], {
  layer: { type: 'string', description: 'the layer of the map it joins: Insights' },
  id: { type: 'string' },
  subject: { type: 'string' },
  verb: { type: 'string' },
  name: { type: 'string' },
  source: {
    type: ['object', 'null'],
    properties: {
      kind: { type: 'string' },
      ref: { type: ['string', 'null'] },
      quote: { type: 'string' },
      url: { type: 'string' },
    },
  },
  confidence: {
    type: ['number', 'null'],
    minimum: 0,
    maximum: 1,
    description: "how strongly its own evidence says it, by search's reranker; null when unread",
  },
  why: { type: 'string', description: 'why it stays private' },
});

/**
 * What the signed-in person could publish on a map (publish-data.ts): how many of the claims they kept about it go
 * with one press, which stay private and why, and how many are on the shared map already. The press and the
 * signature are theirs, on the map's page; nothing here publishes.
 */
export const listPublishable = defineTool<
  { map: string; exploration?: string },
  Record<string, unknown>
>({
  name: 'list_publishable',
  title: 'List what can be published',
  description:
    'What the signed-in person kept about a map in their projects (their names and other claims about its ' +
    'accounts) and could publish to the shared Power Map with one press on that map, signed by their own wallet ' +
    'and credited to them: each item one per row (its name, address, source and a confidence from the search ' +
    "model's reranker, how strongly its own evidence says it), which stay private and why (the people rule: a name goes only as the " +
    "DAO's own records declare it), and how many are published already. It publishes nothing; never sign for them. " +
    "A person's own agent names their project by its link (exploration); on the site it's the person signed in.",
  input: obj(
    ['map'],
    {
      map: {
        type: 'string',
        minLength: 3,
        description: "the map's address (its id in look_up's maps), or its map_url",
      },
      exploration: { ...REF, description: "the person's project, by its link: whose data it is" },
    },
    { additionalProperties: false },
  ),
  output: obj(
    [
      'about',
      'name',
      'map_url',
      'ready',
      'claims',
      'readings',
      'private',
      'published',
      'adds',
      'scored_by',
    ],
    {
      about: { type: 'string' },
      name: { type: 'string' },
      map_url: { type: 'string' },
      ready: { type: 'integer', minimum: 0 },
      claims: { type: 'array', items: PUBLISH_ROW },
      readings: {
        type: 'array',
        description: 'the readings they drew of the map, credited to them by the press',
        items: obj(['layer', 'id', 'title', 'what', 'as_of', 'accounts'], {
          layer: { const: 'Readings' },
          id: { type: 'string' },
          title: { type: 'string' },
          what: { type: 'string' },
          as_of: { type: 'string' },
          accounts: { type: 'integer', minimum: 0 },
        }),
      },
      private: {
        type: 'array',
        items: { ...PUBLISH_ROW, required: [...(PUBLISH_ROW.required as string[]), 'why'] },
      },
      published: { type: 'integer', minimum: 0 },
      adds: {
        type: 'array',
        description: "what the press adds, by layer and kind, and what can't go yet, with why",
        items: obj(['layer', 'kind', 'label', 'count', 'goes'], {
          layer: { type: 'string' },
          kind: { type: 'string' },
          verb: { type: 'string' },
          label: { type: 'string' },
          count: { type: 'integer', minimum: 0 },
          goes: { type: 'boolean' },
          why: { type: 'string' },
        }),
      },
      scored_by: {
        type: ['string', 'null'],
        description: 'the model that read the confidences, or null when it was off',
      },
      unscored: { type: 'string', description: 'why nothing was scored' },
    },
  ),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  failure: 'not_found',
  async run({ map, exploration }, ctx) {
    // through a project's link, its owner's (a person's own agent has no session here)
    const owner = exploration
      ? layerOwnerOf((await open(ctx, exploration)).row)
      : ctx.caller?.subject;
    if (!owner || (!exploration && !owner.startsWith('prs_')))
      throw new ToolFailure(
        'unauthorised',
        'Only a signed-in person has data of their own to publish.',
        'Sign in with a NEAR wallet first.',
      );
    const id = mapIdOf(map);
    const p = await publishable(ctx, owner, id);
    return {
      about: p.about,
      name: p.name,
      map_url: mapUrl(ctx, p.about),
      ready: p.claims.length,
      claims: p.rows,
      readings: p.readings,
      private: p.private,
      published: p.published,
      adds: p.adds,
      scored_by: p.scored_by,
      ...(p.unscored ? { unscored: p.unscored } : {}),
    };
  },
});
