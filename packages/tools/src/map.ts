// One map (Elco, 10 Nov: "the workspace and the agent don't seem to be connected to the global power map"):
// every view stored on this site, each with its reading, its name, its date and who made it. Read-only and
// public: GET /api/v1/map hands it over whole, list_flowers and find_target search it before a fresh read.
// A view's spec is content-addressed, so its reading never changes: each is read once per process.

import type { Mark, MarkLogo, MarkSaid } from '@petal/core';
import {
  canonicalJson,
  DEFAULT_VIEW,
  legendItem,
  lookFills,
  mapOf,
  namePieces,
  pictureQuery,
  readFlower,
  sha256Hex,
  typePieces,
  type Value,
  valuePieces,
  viewHash,
} from '@petal/core';
import type { Claim, Spec, View } from '@petal/core/types';
import { EVM_CHAINS } from '@petal/inputs';
import { privateStore } from './drafts.ts';
import { hiddenMap, retiredReading } from './hidden.ts';
import type { CardProposals } from './proposals.ts';
import { base, findSnapshot } from './tools/shared.ts';
import type { ToolContext } from './types.ts';
import { type CardValue, cardValue, valuesOf } from './value-store.ts';

/** A chain by the name a reader's chain parameter takes (ethereum, gnosis), as find_target names it. */
export const chainName = (caip2: string) =>
  Object.values(EVM_CHAINS).find((c) => c.caip2 === caip2)?.id ?? caip2;

/** A chain as people name it: Gnosis, Solana, NEAR. */
export const chainWords = (caip2: string) =>
  Object.values(EVM_CHAINS).find((c) => c.caip2 === caip2)?.name ??
  (caip2.startsWith('solana:') ? 'Solana' : caip2.startsWith('near:') ? 'NEAR' : caip2);

/** The address parameters a reader is asked for, in the order one is taken as the view's address. */
const ADDRESS_PARAMS = ['dao', 'token', 'mint', 'contract', 'address', 'account'] as const;

export interface MapView {
  /** the view's hash, as in its /d/ link */
  sha: string;
  /** the map it's on: its reading's address, in one form (core's mapOf) */
  map: string;
  /** what it's called on the map, when someone named it */
  name: string | null;
  /** its reading's own title */
  title: string;
  /** the reader that made its snapshot */
  network: string;
  /** what was read and where, in people's words: its reader's title and its chain ("ERC-20 token holders on Gnosis") */
  about: string;
  chain: string;
  address: string | null;
  /** the participants its snapshot holds */
  count: number;
  as_of: string;
  snapshot: string;
  /** the read's parameters: asking get_snapshot for these reuses the stored snapshot */
  params: Record<string, string>;
  view_url: string;
  /** its still picture, drawn with the default view (GET /api/v1/map/:sha/svg) */
  picture: string;
  /** the colours that picture draws, as its legend has them: colour's keys, then the tail's */
  keys: { label: string; swatch: string }[];
  /** who made it (a NEAR account), when that's recorded */
  made_by: string | null;
  reading: { title: string; petals: unknown[] };
}

type Read = Omit<MapView, 'sha' | 'name' | 'view_url' | 'picture' | 'made_by'>;

/** A view's row in a list of the map (GET /api/v1/map/views): all of it but its reading. */
export type MapViewRow = Omit<MapView, 'reading'>;

/**
 * The picture's address. The browser and Vercel's edge keep each one for a year, so it names the look and
 * the view it's drawn with (as the site's flower tiles do): when either changes, so does every address.
 */
/** A set of names, by the hash of its claims' ids: what a person's picture and reading are kept under. */
export const namesKey = (names: readonly Claim[]): string =>
  sha256Hex(canonicalJson(names.map((c) => c.id).sort()));

/**
 * A view's picture. For a person with names, its address also names their set (annotation step 6), so it's
 * theirs alone, changes when their names do, and is never the public picture a cache keeps.
 */
export const pictureOf = (ctx: ToolContext, sha: string, view: View = DEFAULT_VIEW) =>
  `${base(ctx)}/api/v1/map/${sha}/svg?${pictureQuery(view)}${ctx.names?.length ? `&names=${namesKey(ctx.names)}` : ''}`;
/** Each view's reading through each viewer's view, by `<sha>:<view hash>`: neither ever changes. */
const read = new Map<string, Read>();

async function readOf(
  ctx: ToolContext,
  body: string,
  view: View,
  values: ReadonlyMap<string, Value> = new Map(),
): Promise<Read | null> {
  try {
    const spec = JSON.parse(body) as Spec;
    const snapshot = await findSnapshot(ctx, spec.snapshot.sha256);
    if (!snapshot) return null;
    // through the viewer's view, never the flower's own choices (one-source.md, step 2), with the viewer's
    // own names on the petals they name (annotation step 6)
    const reading = readFlower(spec, snapshot, view, [
      ...(ctx.names?.length ? namePieces(snapshot, ctx.names) : []),
      ...(ctx.names?.length ? typePieces(snapshot, ctx.names) : []),
      // each petal's value in dollars, from its map's stored value (#91): none with no price
      ...valuePieces(snapshot, values.get(mapOf(snapshot)) ?? null),
    ]);
    // the picture's colours: its legend, as render_flower dresses it (in the keys, core lookFills)
    const look = lookFills(reading.petals);
    const legend = reading.legend.map((item) => legendItem(item, look));
    const keysOf = (primitive: string) =>
      legend.filter((i) => i.primitive === primitive).flatMap((i) => i.keys ?? []);
    const params = (spec.network.params ?? {}) as Record<string, string>;
    const address = ADDRESS_PARAMS.map((k) => params[k]).find((v) => typeof v === 'string' && v);
    const reader = ctx.modules[spec.network.id]?.descriptor.title ?? spec.network.id;
    const where = chainWords(spec.network.chain);
    return {
      map: mapOf(snapshot),
      title: reading.title,
      network: spec.network.id,
      about: reader.toLowerCase().includes(where.toLowerCase()) ? reader : `${reader} on ${where}`,
      chain: params.chain ?? chainName(spec.network.chain),
      address: address ?? null,
      count: snapshot.participants.length,
      as_of: spec.snapshot.as_of,
      snapshot: spec.snapshot.sha256,
      params,
      keys: [...keysOf('colour'), ...keysOf('tail')],
      reading: { title: reading.title, petals: reading.petals },
    };
  } catch {
    // a spec this code can't read, or a snapshot that won't load: not on the map
    return null;
  }
}

/** Every view on this site's map whose reading is here, the oldest first, through the viewer's view. */
export async function mapViews(
  ctx: ToolContext,
  view: View = DEFAULT_VIEW,
  /** with the maps hidden from the Power Map (#96): only a hidden map's own card asks */
  o: { hidden?: boolean } = {},
): Promise<MapView[]> {
  const out: MapView[] = [];
  const through = viewHash(view);
  // keyed by the viewer's names too, so one person's never reach another's, nor a visitor's, reading
  const named = ctx.names?.length ? `:${namesKey(ctx.names)}` : '';
  // and by when the map's values were read, so a new price reads again (#91)
  const values = await valuesOf(ctx);
  const priced = values.size
    ? `:${sha256Hex([...values.values()].map((v) => `${v.about}@${v.read_at}`).join(','))}`
    : '';
  for (const row of await privateStore(ctx.config).draft.list()) {
    const key = `${row.sha256}:${through}${named}${priced}`;
    let r = read.get(key);
    if (!r) {
      const got = await readOf(ctx, row.body, view, values);
      if (!got) continue;
      read.set(key, got);
      r = got;
    }
    out.push({
      sha: row.sha256,
      name: row.name ?? null,
      ...r,
      view_url: `${base(ctx)}/d/${row.sha256}`,
      picture: pictureOf(ctx, row.sha256, view),
      made_by: row.made_by ?? null,
    });
  }
  // a map hidden from the Power Map (#96) is in no list of it, nor is a reading a wave replaced
  const shown = out.filter((v) => !retiredReading(v.snapshot));
  return o.hidden ? shown : shown.filter((v) => !hiddenMap(v.map));
}

/** A drawing on a map's card. */
export type MapDrawing = Pick<
  MapView,
  'sha' | 'name' | 'view_url' | 'picture' | 'keys' | 'made_by'
>;

/** A reading of a map: one sediment, with the drawings made of it. */
export interface MapReading {
  snapshot: string;
  as_of: string;
  network: string;
  about: string;
  title: string;
  count: number;
  /** who made it: the maker of its first drawing */
  made_by: string | null;
  /** the oldest first */
  drawings: MapDrawing[];
}

/**
 * What tells one organisation from another on its card (board #85): its name, its token's symbol and its logo,
 * each saying where it came from (mark/v1), the logo with where this site serves it.
 */
export interface CardMark {
  name: MarkSaid | null;
  symbol: MarkSaid | null;
  logo: (MarkLogo & { url: string }) | null;
  /** its types, each an is_a claim with its kind and evidence, in the order found (#97) */
  types: Claim[];
  /** the same words, each once, in that order: what a badge says ('DAO' once, however many claims say it) */
  type_words: string[];
  read_at: string;
}

const EXTENSION: Record<MarkLogo['media_type'], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Each type's word once, in the order its claims were found. */
export function typeWords(types: readonly Claim[]): string[] {
  const out: string[] = [];
  for (const c of types) {
    const w = typeof c.object === 'string' ? c.object : c.object.value;
    if (typeof w === 'string' && w && !out.includes(w)) out.push(w);
  }
  return out;
}

/** A stored mark as its card carries it: the logo at /api/v1/media/<sha256>.<ext>, on this site. */
export function cardMark(m: Mark, site: string): CardMark {
  return {
    name: m.name,
    symbol: m.symbol,
    logo: m.logo
      ? { ...m.logo, url: `${site}/api/v1/media/${m.logo.sha256}.${EXTENSION[m.logo.media_type]}` }
      : null,
    types: m.types ?? [],
    type_words: typeWords(m.types ?? []),
    read_at: m.read_at,
  };
}

/** One map: everything read about one address (Elco, 10 Nov), as one card. */
export interface MapCard {
  /** the address, in one form: chain:address, or chain:population for a whole network */
  id: string;
  /** its newest named drawing's name; null when nobody named one */
  name: string | null;
  /** these are its newest drawing's */
  title: string;
  about: string;
  chain: string;
  /** what tells two maps of the same name apart; null for a whole network */
  address: string | null;
  picture: string;
  view_url: string;
  keys: MapView['keys'];
  /** its organisation's name, symbol and logo, each with where it came from; null until it's read (#85) */
  mark: CardMark | null;
  /** its token in dollars, its supply and its reading's totals, each with where and when; null until read (#91) */
  value: CardValue | null;
  /** how many proposals it has and how many have votes, read from its DAO (#93); null for a map with none read */
  proposals: CardProposals | null;
  /** its sediments, the newest first by their date */
  readings: MapReading[];
}

/**
 * The map's views as maps: one card per address, the newest first by its newest drawing. The holders and the
 * delegates of one token are two readings of one map; two drawings of one reading sit under that reading.
 */
export function mapsOf(
  views: readonly MapView[],
  marks: ReadonlyMap<string, CardMark> = new Map(),
  values: ReadonlyMap<string, Value> = new Map(),
  proposals: ReadonlyMap<string, CardProposals> = new Map(),
): MapCard[] {
  const byMap = new Map<string, MapView[]>();
  for (const v of views) byMap.set(v.map, [...(byMap.get(v.map) ?? []), v]);
  const drawing = (v: MapView): MapDrawing => ({
    sha: v.sha,
    name: v.name,
    view_url: v.view_url,
    picture: v.picture,
    keys: v.keys,
    made_by: v.made_by,
  });
  const cards: { at: number; card: MapCard }[] = [];
  for (const [id, drawn] of byMap) {
    const newest = drawn.at(-1) as MapView;
    const bySnapshot = new Map<string, MapView[]>();
    for (const v of drawn) bySnapshot.set(v.snapshot, [...(bySnapshot.get(v.snapshot) ?? []), v]);
    const readings = [...bySnapshot.values()]
      .map((vs) => ({ first: vs[0] as MapView, last: views.indexOf(vs.at(-1) as MapView), vs }))
      .sort((a, b) => b.first.as_of.localeCompare(a.first.as_of) || b.last - a.last)
      .map(({ first, vs }) => ({
        snapshot: first.snapshot,
        as_of: first.as_of,
        network: first.network,
        about: first.about,
        title: first.title,
        count: first.count,
        made_by: first.made_by,
        drawings: vs.map(drawing),
      }));
    cards.push({
      at: views.indexOf(newest),
      card: {
        id,
        name: drawn.findLast((v) => v.name)?.name ?? null,
        title: newest.title,
        about: newest.about,
        chain: newest.chain,
        address: newest.address,
        picture: newest.picture,
        view_url: newest.view_url,
        keys: newest.keys,
        mark: marks.get(id) ?? null,
        value: values.has(id) ? cardValue(values.get(id) as Value) : null,
        proposals: proposals.get(id) ?? null,
        readings,
      },
    });
  }
  return cards.sort((a, b) => b.at - a.at).map((c) => c.card);
}

const wordsOf = (q: string) =>
  q
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((w) => w.length > 1);

/** The views whose name, title, chain, reader or address hold every word of `q`. */
export function searchMap(views: readonly MapView[], q: string): MapView[] {
  const words = wordsOf(q);
  if (!words.length) return [];
  return views.filter((v) => {
    const text = [v.name, v.title, v.chain, v.network, v.address].join(' ').toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/** How the map says who made a view. */
export const madeByWords = (by: string | null) =>
  by === 'mapping.petals.near'
    ? "Petals' own mapping (mapping.petals.near)"
    : (by ?? 'not recorded');
