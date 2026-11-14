// What an answer is about on the Power Map (the map is always there, and an answer moves it): the `show` event,
// read off what a tool answered, so it costs the model no turn, and the map takes it as it is. And the `next`
// event: after a map is read, the next steps on it (three next-step buttons that drive the map, the brain's
// services as one-press options).
import { aboutKey } from '@petal/core';
import type { InFront, MapShow, NextSteps, ToolError } from '@petal/core/types';
import { mapIndex, nextSteps, type ToolContext } from '@petal/tools';
import type { AnyTool } from './tool-defs.ts';

type Obj = Record<string, unknown>;

const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown) => (typeof x === 'string' && x ? x : null);
const SHA = /^[0-9a-f]{64}$/;

/** One of the show event's targets, checked: a map, a wallet, the line between two maps, a proposal. */
export function parseShow(x: unknown): MapShow | string {
  if (!isObj(x))
    return 'a target is an object: { map }, { wallet, chain? }, { line: [a, b] } or { proposal: { map, id } }';
  const keys = Object.keys(x).sort().join();
  if (keys === 'map') return str(x.map) ? { map: x.map as string } : 'map is a map id';
  if (keys === 'wallet' || keys === 'chain,wallet') {
    if (!str(x.wallet)) return 'wallet is an account';
    if (x.chain !== undefined && x.chain !== null && !str(x.chain))
      return 'chain is a chain id, or null';
    return {
      wallet: x.wallet as string,
      ...(x.chain !== undefined ? { chain: x.chain as string | null } : {}),
    };
  }
  if (keys === 'line') {
    const l = x.line;
    return Array.isArray(l) && l.length === 2 && l.every((a) => str(a))
      ? { line: [l[0] as string, l[1] as string] }
      : 'line is two maps, [from, to]';
  }
  if (keys === 'proposal') {
    const p = x.proposal;
    return isObj(p) && Object.keys(p).sort().join() === 'id,map' && str(p.map) && str(p.id)
      ? { proposal: { map: p.map as string, id: p.id as string } }
      : 'proposal is { map, id }';
  }
  return 'a target is one of { map }, { wallet, chain? }, { line: [a, b] } or { proposal: { map, id } }';
}

/** POST /api/v1/agent/chat's in_front, checked: what the canvas beside the chat has open. */
export function parseInFront(x: unknown): InFront | string {
  if (!isObj(x)) return 'in_front must be an object';
  for (const k of Object.keys(x))
    if (!['map', 'flower', 'at', 'layers', 'selected'].includes(k))
      return `in_front.${k} isn't a field`;
  if (x.map !== null && !str(x.map))
    return 'in_front.map is a map id, or null for the whole Power Map';
  const out: InFront = { map: (x.map as string | null) ?? null };
  if (x.flower !== undefined) {
    if (typeof x.flower !== 'string' || !SHA.test(x.flower))
      return "in_front.flower is a flower's spec_sha256";
    out.flower = x.flower;
  }
  if (x.at !== undefined) {
    if (typeof x.at !== 'string' || !(/^\d+$/.test(x.at) || !Number.isNaN(Date.parse(x.at))))
      return 'in_front.at is a block number or a date';
    out.at = x.at;
  }
  if (x.layers !== undefined) {
    if (!Array.isArray(x.layers) || !x.layers.every((l) => typeof l === 'string' && SHA.test(l)))
      return 'in_front.layers is the hashes of the layers on';
    out.layers = x.layers as string[];
  }
  if (x.selected !== undefined) {
    const s = parseShow(x.selected);
    if (typeof s === 'string') return `in_front.selected: ${s}`;
    out.selected = s;
  }
  return out;
}

/** What the system notes say of what's in front of the person: the map as the Power Map names it. */
export interface Front extends InFront {
  /** the map's name and chain, where a map is drawn at that address */
  card: { name: string; chain: string } | null;
}

/** The map in front, as the Power Map knows it (its card's name and chain), or none. */
export async function frontOf(ctx: ToolContext, f: InFront): Promise<Front> {
  if (!f.map) return { ...f, card: null };
  const key = aboutKey(f.map);
  const found = (await mapIndex(ctx, { hidden: true })).find((m) => aboutKey(m.card.id) === key);
  const c = found?.card;
  return {
    ...f,
    ...(c ? { map: c.id } : {}),
    card: c ? { name: c.name ?? c.mark?.name?.value ?? c.title, chain: c.chain } : null,
  };
}

const target = (s: MapShow) =>
  'map' in s
    ? `the map ${s.map}`
    : 'wallet' in s
      ? `the wallet ${s.wallet}${s.chain ? ` on ${s.chain}` : ''}`
      : 'line' in s
        ? `the line between the maps ${s.line[0]} and ${s.line[1]}`
        : `proposal ${s.proposal.id} on ${s.proposal.map}`;

/** The system notes' part on what the person is looking at beside this chat, as they ask. */
export function frontNotes(f: Front): string {
  const where = f.map
    ? f.card
      ? `the map ${f.card.name} (${f.map}, on ${f.card.chain})`
      : `the address ${f.map}, where no map is drawn yet`
    : 'the whole Power Map, with no map entered';
  const parts = [
    `Beside this chat the canvas shows ${where}`,
    ...(f.flower
      ? [`, and the flower drawn apart in this conversation (spec_sha256 ${f.flower})`]
      : []),
    ...(f.at ? [`, at ${/^\d+$/.test(f.at) ? `block ${f.at}` : f.at}`] : []),
    ...(f.layers ? [`, with only these layers on: ${f.layers.join(', ')}`] : []),
    '.',
  ];
  return [
    '## In front of the person',
    '',
    parts.join(''),
    ...(f.selected ? [`Chosen on it: ${target(f.selected)}.`] : []),
    'When they say this, here, it or what they are looking at, they mean that. Read it before you answer about it (get_map for a map, look_up for a wallet), and move the map with show when your answer is about something else.',
  ].join('\n');
}

export const SHOW = 'show';

const toolError = (code: ToolError['error']['code'], message: string): ToolError => ({
  error: { code, message },
});

/** show: Petals' agent moves the map beside the chat to what it's talking about; the run emits the show event. */
export function showTool(ctx: ToolContext): AnyTool {
  return {
    name: SHOW,
    input: {
      type: 'object',
      // the agent's tool list reads the description from here (tool-defs.ts)
      description:
        'Move the map beside this chat to what your answer is about: a map by its id, a wallet (with its chain), the line between two maps (two DAOs, by their ids), or a proposal on a map. Give one of them. The map moves before your answer shows.',
      properties: {
        map: { type: 'string', minLength: 1 },
        wallet: { type: 'string', minLength: 1 },
        chain: { type: ['string', 'null'] },
        line: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 2, maxItems: 2 },
        proposal: {
          type: 'object',
          required: ['map', 'id'],
          properties: {
            map: { type: 'string', minLength: 1 },
            id: { type: 'string', minLength: 1 },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    output: { type: 'object' },
    async run(args: Record<string, unknown>) {
      const s = parseShow(args);
      if (typeof s === 'string') return toolError('bad_input', s);
      if ('wallet' in s) return { shown: s };
      // every map it names must be on the Power Map, by the id the map knows it by
      const index = await mapIndex(ctx, { hidden: true });
      const idOf = (m: string) => index.find((x) => aboutKey(x.card.id) === aboutKey(m))?.card.id;
      const named = 'map' in s ? [s.map] : 'line' in s ? [...s.line] : [s.proposal.map];
      const ids = named.map(idOf);
      const missing = named.find((_, i) => !ids[i]);
      if (missing)
        return toolError(
          'not_found',
          `No map on the Power Map has the address ${missing}. look_up gives each map's id.`,
        );
      const [a, b] = ids as [string, string];
      return {
        shown:
          'map' in s
            ? { map: a }
            : 'line' in s
              ? { line: [a, b] }
              : { proposal: { map: a, id: s.proposal.id } },
      };
    },
  };
}

/** What a tool's answer says the person is looking at on the map, or null when it says nothing. */
export function showOf(name: string, out: unknown): MapShow | null {
  if (!isObj(out)) return null;
  if (name === SHOW) {
    const s = parseShow(out.shown);
    return typeof s === 'string' ? null : s;
  }
  if (name === 'get_map') {
    const id = str(out.id);
    return id ? { map: id } : null;
  }
  if (name === 'find_voting_blocs' || name === 'list_payouts') {
    const id = str(out.about);
    return id ? { map: id } : null;
  }
  if (name !== 'look_up') return null;
  const maps = Array.isArray(out.maps) ? out.maps.filter(isObj) : [];
  const first = maps[0];
  const map = str(first?.id);
  if (!map) return null;
  // an account that sits in a reading as a holder is a wallet, lit wherever it sits; anything else, the map
  const accounts = Array.isArray(out.accounts) ? out.accounts.filter(isObj) : [];
  const wallet = str(accounts.find((a) => a.role === 'holder' || a.role === 'delegator')?.account);
  if (wallet) return { wallet, chain: str(first?.chain) };
  return { map };
}

/** A target's key, so the same thing is shown once in a turn. */
export const showKey = (s: MapShow) => JSON.stringify(s);

/** The next steps after get_map read a map, or null after any other tool. */
export function nextOf(name: string, out: unknown): NextSteps | null {
  if (name !== 'get_map' || !isObj(out)) return null;
  const id = str(out.id);
  const mapName = str(out.name);
  if (!id || !mapName) return null;
  return nextSteps({
    id,
    name: mapName,
    proposals: isObj(out.proposals) ? (out.proposals as { voted?: number }) : null,
    payouts: isObj(out.payouts) ? (out.payouts as { count?: number }) : null,
    value: isObj(out.value) ? (out.value as { treasury_usd?: string | null }) : null,
  });
}
