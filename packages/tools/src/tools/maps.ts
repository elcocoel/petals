// The Power Map's maps for agents (META, from Elco, 12 Nov: "the agent is kinda dumb - it's assuming it has to
// count everything from scratch all the time instead of navigating and helping me interprate what's already
// there"). look_up finds a map by any word with its link (mapIndex, mapRow); get_map hands one map's layers
// over to be interpreted: its readings, proposals, value, payouts, Petals' mapping's Insights and the person's
// own names on its accounts, each saying where and when. Nothing here reads anew: it's what the map holds.
import { payoutsIn, validateMark, validateProposals } from '@petal/core';
import type { Claim } from '@petal/core/types';
import { defineTool } from '../define.ts';
import { privateStore } from '../drafts.ts';
import { ToolFailure } from '../errors.ts';
import { hiddenMap } from '../hidden.ts';
import { type CardMark, cardMark, type MapCard, madeByWords, mapsOf, mapViews } from '../map.ts';
import { aboutOneOf, cardAccounts, claimsAbout } from '../mapping-claims.ts';
import { payoutsOf } from '../payouts.ts';
import { cardProposals } from '../proposals.ts';
import type { ToolContext } from '../types.ts';
import { valuesOf } from '../value-store.ts';
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

/** Each map's mark (#85), by its address, as the site serves it. */
async function marksOf(ctx: ToolContext): Promise<Map<string, CardMark>> {
  const out = new Map<string, CardMark>();
  for (const r of await privateStore(ctx.config).mark.list()) {
    const m = validateMark(JSON.parse(r.body));
    if (m.ok) out.set(r.about, cardMark(m.value, base(ctx)));
  }
  return out;
}

/** One map's proposals in short (#93), or null when none were read. */
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
 * maps hidden from the Power Map (#96) too.
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
  };
}

export const getMap = defineTool<{ map: string }, Record<string, unknown>>({
  name: 'get_map',
  title: 'Get a map',
  description:
    "One map on the Power Map, by its address (look_up's maps give it) or its link: everything already there, " +
    'to interpret without reading anew. Its link; its readings, each with its date, size and who mapped it; its ' +
    'proposals and the period they cover; its value (price, supply, market cap, treasury), each with its source ' +
    "and date; its payouts in short; Insights, the claims Petals' mapping made about its accounts; and the " +
    "signed-in person's own names for its accounts, which are theirs alone and not on the shared map. " +
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
