// The publication record on the server (specs/005-mapping-brain/composition.md; migration 35): read it as core's
// entries, find the layers it names (a reading in the snapshot store, everything else in published_layer), and
// compose a map or an author's credit from it. Append-only: entries are added through `appendPublication`, never
// changed. Every map and credit answer is a pure function of what's read here.
import {
  aboutKey,
  type Composition,
  type Credit,
  canonicalJson,
  compose,
  creditOf,
  type Entry,
  type Publication,
  publicationHash,
  sha256Hex,
  validatePublication,
} from '@petal/core';
import { privateStore } from './drafts.ts';
import { findSnapshot } from './tools/shared.ts';
import type { ToolContext } from './types.ts';

type Row = Awaited<ReturnType<ReturnType<typeof privateStore>['publication']['list']>>[number];

const entryOf = (r: Row): Entry => ({
  seq: r.seq,
  appended_at: r.appended_at,
  hash: r.hash,
  publication: JSON.parse(r.body) as Publication,
  ...(r.scores ? { scores: JSON.parse(r.scores) as Record<string, number> } : {}),
});

/** The record, in its own order: all of it, or about one map. */
export async function recordOf(ctx: ToolContext, about?: string): Promise<Entry[]> {
  const rows = await privateStore(ctx.config).publication.list(
    about ? { about: aboutKey(about) } : {},
  );
  return rows.map(entryOf);
}

/** The layers the entries name, by hash: a reading from the snapshot store, the rest as published. */
export async function layersOf(
  ctx: ToolContext,
  entries: readonly Entry[],
): Promise<Map<string, unknown>> {
  const store = privateStore(ctx.config);
  const docs = new Map<string, unknown>();
  for (const e of entries)
    for (const l of e.publication.layers) {
      if (docs.has(l.sha256)) continue;
      if (l.petal.startsWith('snapshot/')) {
        const s = await findSnapshot(ctx, l.sha256);
        if (s) docs.set(l.sha256, s);
        continue;
      }
      const row = await store.publication.layer(l.sha256);
      if (row?.body) docs.set(l.sha256, JSON.parse(row.body));
    }
  return docs;
}

/** Compositions by `<map>@<last seq>`: the record only grows, so a map is composed once per new entry. */
const composed = new Map<string, Composition>();

/** The map composed from the record (compose/v1); null when nothing about it was ever published. */
export async function compositionOf(ctx: ToolContext, about: string): Promise<Composition | null> {
  const entries = await recordOf(ctx, about);
  if (!entries.length) return null;
  const key = `${aboutKey(about)}@${entries.at(-1)?.seq}`;
  const hit = composed.get(key);
  if (hit) return hit;
  const map = compose(about, entries, await layersOf(ctx, entries));
  composed.set(key, map);
  return map;
}

/** A named NEAR account (petals.near, alice.testnet) or an implicit one (64 hex), as look_up reads one. */
const NEAR_ACCOUNT =
  /^(?:(?:[a-z0-9]+[-_])*[a-z0-9]+\.)+(?:near|tg|testnet|aurora|sweat)$|^[0-9a-f]{64}$/;

/**
 * An author as the record names them (CAIP-10), from what a page or a person gives: a bare NEAR account reads as
 * near:mainnet:<it>, or near:testnet:<it> for a .testnet one, as the rest of the API reads it; anything else as given.
 */
export const authorOf = (given: string) =>
  NEAR_ACCOUNT.test(given)
    ? `near:${given.endsWith('.testnet') ? 'testnet' : 'mainnet'}:${given}`
    : given;

/** One author's credit (credit/v1), from the whole record, with its hash. */
export async function creditFor(
  ctx: ToolContext,
  author: string,
): Promise<Credit & { hash: string }> {
  const entries = await recordOf(ctx);
  const credit = creditOf(author, entries, await layersOf(ctx, entries));
  return { ...credit, hash: sha256Hex(canonicalJson(credit)) };
}

/** Each author's three counts on one map (Elco, 13 Nov: "who's helping a lot or a little"): first, confirmed, built on. */
export async function authorsOn(
  ctx: ToolContext,
  about: string,
): Promise<
  { author: string; imported: boolean; first: number; confirmed: number; built_on: number }[]
> {
  const map = await compositionOf(ctx, about);
  if (!map) return [];
  const entries = await recordOf(ctx, about);
  const docs = await layersOf(ctx, entries);
  return map.authors.map((a) => {
    const t = creditOf(a.author, entries, docs).totals;
    return {
      author: a.author,
      imported: a.imported,
      first: t.first,
      confirmed: t.confirmed,
      built_on: t.built_on,
    };
  });
}

/**
 * Append one publication to the record, with the layers it names kept once by their hash (a reading's body stays
 * in the snapshot store). The server's own order and time are set here, never by the author.
 */
export async function appendPublication(
  ctx: ToolContext,
  p: Publication,
  bodies: ReadonlyMap<string, unknown>,
  scores?: Record<string, number>,
): Promise<Entry> {
  const v = validatePublication(p);
  if (!v.ok)
    throw new Error(
      `not a publication/v1: ${v.errors.map((e) => `${e.path} ${e.message}`).join('; ')}`,
    );
  const hash = publicationHash(p);
  const row = await privateStore(ctx.config).publication.append(
    {
      hash,
      about: aboutKey(p.about),
      author: p.author,
      appended_at: ctx.now().toISOString(),
      body: JSON.stringify(p),
      scores: scores && Object.keys(scores).length ? JSON.stringify(scores) : null,
    },
    p.layers.map((l) => ({
      sha256: l.sha256,
      petal: l.petal,
      about: aboutKey(p.about),
      body:
        l.petal.startsWith('snapshot/') || !bodies.has(l.sha256)
          ? null
          : JSON.stringify(bodies.get(l.sha256)),
    })),
  );
  return entryOf(row);
}

/** An author in words: an account's own name, and Petals' mapping as itself. */
export const authorName = (author: string) =>
  author === 'mapping.petals.near' ? "Petals' own mapping" : (author.split(':').at(-1) ?? author);

/** The map's layers, authors and differences, as GET /api/v1/maps/:id adds them (composition.md, section 9). */
export async function mapRecord(ctx: ToolContext, about: string) {
  const map = await compositionOf(ctx, about);
  if (!map)
    return { layers: [], authors: [], differs: 0, composed_from: [], rule: 'compose/v1' as const };
  const counts = new Map((await authorsOn(ctx, about)).map((a) => [a.author, a]));
  const entries = await recordOf(ctx, about);
  const at = new Map(entries.map((e) => [e.hash, e.publication.published_at]));
  return {
    rule: map.rule,
    composed_from: map.composed_from,
    layers: [...map.layers].reverse().map((l) => ({
      sha256: l.sha256,
      petal: l.petal,
      title: l.title,
      whats: l.whats,
      states: l.states,
      by: l.by.map((b) => b.author),
      first: l.by[0]
        ? {
            author: l.by[0].author,
            publication: l.by[0].publication,
            published_at: at.get(l.by[0].publication) ?? null,
          }
        : null,
    })),
    authors: map.authors.map((a) => ({
      author: a.author,
      name: authorName(a.author),
      imported: a.imported,
      first: counts.get(a.author)?.first ?? 0,
      confirmed: counts.get(a.author)?.confirmed ?? 0,
      built_on: counts.get(a.author)?.built_on ?? 0,
    })),
    differs: map.differs,
  };
}

/**
 * Who stated each value a reading draws, from the map's composition: by piece (a holding's measure, or `name` for
 * the names people published) and participant, its authors first to last, the publication that first brought it,
 * and where the slot differs, the other values with theirs.
 */
export function readingCredit(
  map: Composition,
  reading: { network: { chain: string }; participants: { id: string }[] },
) {
  const chain = reading.network.chain;
  const ids = new Map(
    reading.participants.map((p) => {
      const full = /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}:/.test(p.id) ? p.id : `${chain}:${p.id}`;
      return [full.startsWith('eip155:') ? full.toLowerCase() : full, p.id] as [string, string];
    }),
  );
  const pieces: Record<
    string,
    Record<string, { by: string[]; first: string; differs?: { value: string; by: string[] }[] }>
  > = {};
  const petals: Record<string, string> = {};
  const seqOf = new Map<string, number>();
  for (const s of map.slots) {
    const id = ids.get(s.subject);
    if (id === undefined) continue;
    const piece = s.what.startsWith('snapshot/')
      ? (s.what.slice('snapshot/'.length).split(' ')[0] as string)
      : s.what === 'claim/named'
        ? 'name'
        : s.what;
    const [shown, ...rest] = s.values;
    if (!shown) continue;
    pieces[piece] ??= {};
    (pieces[piece] as NonNullable<(typeof pieces)[string]>)[id] = {
      by: shown.by.map((b) => b.author),
      first: shown.by[0]?.publication as string,
      ...(s.differs
        ? { differs: rest.map((v) => ({ value: v.value, by: v.by.map((b) => b.author) })) }
        : {}),
    };
    const first = shown.by[0];
    // the publication that first brought this participant to the map: the earliest of its facts
    if (
      first &&
      (!(id in petals) || first.seq < (seqOf.get(petals[id] as string) ?? Number.POSITIVE_INFINITY))
    ) {
      petals[id] = first.publication;
      seqOf.set(first.publication, first.seq);
    }
  }
  const publications: Record<string, { author: string }> = {};
  for (const s of map.slots)
    for (const v of s.values)
      for (const b of v.by) publications[b.publication] = { author: b.author };
  const authors = Object.fromEntries(
    map.authors.map((a) => [a.author, { name: authorName(a.author), imported: a.imported }]),
  );
  return { pieces, petals, publications, authors };
}
