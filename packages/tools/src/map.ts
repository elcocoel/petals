// One map (Elco, 10 Nov: "the workspace and the agent don't seem to be connected to the global power map"):
// every view stored on this site, each with its reading, its name, its date and who made it. Read-only and
// public: GET /api/v1/map hands it over whole, list_flowers and find_target search it before a fresh read.
// A view's spec is content-addressed, so its reading never changes: each is read once per process.
import { DEFAULT_VIEW, legendItem, RENDER_VERSION, readFlower, viewHash } from '@petal/core';
import type { Spec } from '@petal/core/types';
import { EVM_CHAINS } from '@petal/inputs';
import { privateStore } from './drafts.ts';
import { base, findSnapshot } from './tools/shared.ts';
import type { ToolContext } from './types.ts';

/** A chain by the name a reader's chain parameter takes (ethereum, gnosis), as find_target names it. */
const chainName = (caip2: string) =>
  Object.values(EVM_CHAINS).find((c) => c.caip2 === caip2)?.id ?? caip2;

/** A chain as people name it: Gnosis, Solana, NEAR. */
const chainWords = (caip2: string) =>
  Object.values(EVM_CHAINS).find((c) => c.caip2 === caip2)?.name ??
  (caip2.startsWith('solana:') ? 'Solana' : caip2.startsWith('near:') ? 'NEAR' : caip2);

/** The address parameters a reader is asked for, in the order one is taken as the view's address. */
const ADDRESS_PARAMS = ['dao', 'token', 'mint', 'contract', 'address', 'account'] as const;

export interface MapView {
  /** the view's hash, as in its /d/ link */
  sha: string;
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
export const pictureOf = (ctx: ToolContext, sha: string) =>
  `${base(ctx)}/api/v1/map/${sha}/svg?look=${encodeURIComponent(RENDER_VERSION)}&view=${viewHash(DEFAULT_VIEW).slice(0, 12)}`;
const read = new Map<string, Read>();

async function readOf(ctx: ToolContext, body: string): Promise<Read | null> {
  try {
    const spec = JSON.parse(body) as Spec;
    const snapshot = await findSnapshot(ctx, spec.snapshot.sha256);
    if (!snapshot) return null;
    const reading = readFlower(spec, snapshot);
    // the picture's colours: its legend with the default view, as render_flower dresses it
    const legend = readFlower(spec, snapshot, DEFAULT_VIEW).legend.map(legendItem);
    const keysOf = (primitive: string) =>
      legend.filter((i) => i.primitive === primitive).flatMap((i) => i.keys ?? []);
    const params = (spec.network.params ?? {}) as Record<string, string>;
    const address = ADDRESS_PARAMS.map((k) => params[k]).find((v) => typeof v === 'string' && v);
    const reader = ctx.modules[spec.network.id]?.descriptor.title ?? spec.network.id;
    const where = chainWords(spec.network.chain);
    return {
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

/** Every view on this site's map whose reading is here, the oldest first. */
export async function mapViews(ctx: ToolContext): Promise<MapView[]> {
  const out: MapView[] = [];
  for (const row of await privateStore(ctx.config).draft.list()) {
    let r = read.get(row.sha256);
    if (!r) {
      const got = await readOf(ctx, row.body);
      if (!got) continue;
      read.set(row.sha256, got);
      r = got;
    }
    out.push({
      sha: row.sha256,
      name: row.name ?? null,
      ...r,
      view_url: `${base(ctx)}/d/${row.sha256}`,
      picture: pictureOf(ctx, row.sha256),
      made_by: row.made_by ?? null,
    });
  }
  return out;
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
