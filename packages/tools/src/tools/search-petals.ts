// search_petals (#105; Elco, 11 Nov: "did we ever implement search with the embedding model on the server being
// super smart to find shit all sorts of different ways?"): one search over everything on the map (organisations,
// their names, symbols and types, and their proposals) and the signed-in person's own work (conversations,
// explorations, shapes, notes, follows) and annotations, by words and by meaning (search-index.ts), on the models
// on Elco's Mac (search-model.ts). One answer per map, with what matched under it. The shared map's documents
// are built when they change and each text is embedded once, kept in the store (migration 29); a load isn't
// waited on, it's seen at the next search. Petals' agent, people's agents (/mcp) and GET /api/v1/search use it.
import { type Mark, validateMark } from '@petal/core';
import type { Claim } from '@petal/core/types';
import type { Store } from '@petal/store';
import { defineTool } from '../define.ts';
import { privateStore } from '../drafts.ts';
import { ToolFailure } from '../errors.ts';
import { type MapCard, mapsOf, mapViews, typeWords } from '../map.ts';
import { proposalsOf } from '../proposals.ts';
import {
  type Findable,
  type Found,
  find,
  joinSets,
  type SearchSet,
  searchSet,
  snippetOf,
  type VectorKeep,
} from '../search-index.ts';
import {
  fakeSearchModel,
  type SearchModel,
  SearchModelDown,
  searchModel,
} from '../search-model.ts';
import type { ToolContext } from '../types.ts';
import { obj } from './shared.ts';

/** What can be asked for: the map's kinds, and the person's own. */
export const MAP_KINDS = ['map', 'proposal'] as const;
export const OWN_KINDS = [
  'claim',
  'conversation',
  'exploration',
  'shape',
  'note',
  'follow',
] as const;
export const FINDABLE_KINDS = [...MAP_KINDS, ...OWN_KINDS] as const;
export type FindableKind = (typeof FINDABLE_KINDS)[number];

/** How many of the best the reranker reads, a map with what matched under it as one. */
const RERANKED = 30;

// -- the models and their vectors

const models = new Map<string, SearchModel>();
/** The context's own model (a test's), or the one at PETAL_SEARCH_URL; none when neither is set. */
export function searchModelOf(ctx: ToolContext): SearchModel | null {
  if (ctx.searchModel) return ctx.searchModel;
  // fake mode reads nothing outside: its words stand for meaning
  if (ctx.config.fake) return fakeSearchModel();
  const url = ctx.config.searchUrl;
  if (!url) return null;
  const m = models.get(url) ?? searchModel(url);
  models.set(url, m);
  return m;
}

const asBase64 = (v: Float32Array) =>
  Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64');
const fromBase64 = (s: string) => {
  const b = Buffer.from(s, 'base64');
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};

/** Vectors kept in the store (migration 29), and in this process once read. */
function storeVectors(store: Store): VectorKeep {
  const here = new Map<string, Float32Array>();
  return {
    async get(model, shas) {
      const out = new Map<string, Float32Array>();
      const ask: string[] = [];
      for (const s of shas) {
        const v = here.get(`${model}:${s}`);
        if (v) out.set(s, v);
        else ask.push(s);
      }
      if (ask.length) {
        for (const r of await store.searchVector.get(model, ask)) {
          const v = fromBase64(r.vector);
          here.set(`${model}:${r.sha256}`, v);
          out.set(r.sha256, v);
        }
      }
      return out;
    },
    async put(model, rows) {
      await store.searchVector.put(
        model,
        rows.map((r) => ({ sha256: r.sha256, vector: asBase64(r.vector) })),
      );
      for (const r of rows) here.set(`${model}:${r.sha256}`, r.vector);
    },
  };
}

const keeps = new WeakMap<Store, VectorKeep>();
function keepOf(store: Store): VectorKeep {
  const k = keeps.get(store) ?? storeVectors(store);
  keeps.set(store, k);
  return k;
}

// -- the documents

const said = (x: { value?: unknown } | null | undefined) =>
  typeof x?.value === 'string' && x.value ? x.value : null;
const clean = (s: string) =>
  s
    .replaceAll(/\${2,}/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();

/** A map's document: its names, its symbol, its types, what was read and where, its address. */
export function mapDoc(card: MapCard, mark: Mark | null): Findable {
  const name = card.name ?? said(mark?.name) ?? card.title;
  const types = typeWords(mark?.types ?? []);
  const words = [
    card.name,
    card.title,
    said(mark?.name),
    said(mark?.symbol),
    ...types,
    card.about,
    card.address,
    card.id,
  ].filter((w, i, all): w is string => !!w && all.indexOf(w) === i);
  return {
    kind: 'map',
    id: card.id,
    title: name,
    text: words.join('\n'),
    group: card.id,
    keys: [card.name, said(mark?.name), said(mark?.symbol), card.address, card.id].filter(
      (k): k is string => !!k,
    ),
  };
}

interface MapSet {
  sig: string;
  set: SearchSet;
  cards: Map<string, MapCard>;
}
const mapSets = new Map<string, Promise<MapSet>>();

/**
 * The shared map's documents, built again only when the map changes: its drawings, its marks or its proposals.
 * Hidden maps (#96) are in none of them.
 */
async function mapSet(ctx: ToolContext, model: SearchModel): Promise<MapSet> {
  const store = privateStore(ctx.config);
  // the map as anyone sees it: a viewer's names change their drawings, not what's on the map
  const views = await mapViews({ ...ctx, names: [] });
  const marks = await store.mark.list();
  const proposalRows = await store.proposals.list();
  const sig = [
    model.embedding,
    views.map((v) => v.sha).join(','),
    marks.map((m) => `${m.about}@${m.read_at}`).join(','),
    proposalRows.map((p) => `${p.about}@${p.read_at}`).join(','),
  ].join('|');
  const key = ctx.config.databaseUrl ?? ctx.config.stateDir ?? ctx.config.root;
  const kept = mapSets.get(key);
  if (kept) {
    const was = await kept.catch(() => null);
    if (was?.sig === sig) return was;
  }
  const made = (async () => {
    const markOf = new Map<string, Mark>();
    for (const r of marks) {
      const m = validateMark(JSON.parse(r.body));
      if (m.ok) markOf.set(r.about, m.value);
    }
    const cards = new Map(mapsOf(views).map((c) => [c.id, c]));
    const docs: Findable[] = [...cards.values()].map((c) => mapDoc(c, markOf.get(c.id) ?? null));
    for (const [about, p] of await proposalsOf(ctx)) {
      const card = cards.get(about);
      if (!card) continue;
      const where = card.name ?? said(markOf.get(about)?.name) ?? card.title;
      for (const x of p.proposals) {
        const title = clean(x.title);
        if (!title) continue;
        docs.push({
          kind: 'proposal',
          id: x.ref,
          title,
          text: `${title}\n${[x.kind, x.outcome].filter(Boolean).join(', ')}\nproposal ${x.id} in ${where}`,
          about,
          group: about,
        });
      }
    }
    return { sig, cards, set: await searchSet(docs, model, keepOf(store)) };
  })();
  mapSets.set(key, made);
  return made;
}

const objectWords = (o: Claim['object']) => (typeof o === 'string' ? o : o.value);

/** The person's own: their annotations, and their work as /api/v1/search has indexed it. */
async function ownDocs(ctx: ToolContext, subject: string, cards: Map<string, MapCard>) {
  const store = privateStore(ctx.config);
  const docs: Findable[] = [];
  for (const r of await store.annotation.list(subject)) {
    const c = JSON.parse(r.body) as Claim;
    const evidence = (c.evidence ?? [])
      .map((e) => [e.note, e.quote, e.url, e.platform].filter(Boolean).join(' '))
      .filter(Boolean);
    const object = objectWords(c.object);
    docs.push({
      kind: 'claim',
      id: `claim:${r.id}`,
      title: `${r.subject} ${r.verb} ${object}`,
      text: [`${r.verb} ${object}`, r.subject, ...evidence].join('\n'),
      about: r.subject,
      // a claim about a map's own address sits under that map
      ...(cards.has(r.subject) ? { group: r.subject } : {}),
      keys: r.verb === 'named' ? [object] : [],
    });
  }
  for (const t of await store.search.texts(subject)) {
    docs.push({
      kind: t.kind,
      id: `${t.kind}:${t.ref}`,
      title: t.title,
      text: t.text,
      about: t.about,
      at: t.at,
    });
  }
  return docs;
}

// -- searching

export interface SearchAnswer {
  kind: string;
  /** a map's address, a proposal's ref, a claim's or a piece of work's own id */
  id: string;
  title: string;
  about: string | null;
  /** a map's page */
  view_url?: string;
  score: number;
  /** how words and meaning ranked it, 1 first; the reranker's reading, 0 to 1 */
  ranks: Found['ranks'];
  rerank?: number;
  /** when it last changed, for a person's own work */
  at?: string;
  /** the words around the match, in pieces, each saying whether it matched (asked with `snippets`) */
  snippet?: { text: string; hit: boolean }[];
  /** what matched under a map: its proposals, a claim about it */
  matched?: Omit<SearchAnswer, 'matched' | 'view_url'>[];
}

const idOf = (f: Findable) =>
  f.kind === 'claim'
    ? f.id.slice('claim:'.length)
    : OWN_KINDS.includes(f.kind as never)
      ? f.id.slice(f.kind.length + 1)
      : f.id;

/**
 * Everything on the map, and the signed-in person's own (ctx.caller.subject), best first: one answer per map
 * with what matched under it. `prefix` reads the last word as the start of words, for search as someone types.
 */
export async function searchPetals(
  ctx: ToolContext,
  q: string,
  o: {
    kinds?: readonly string[];
    limit?: number;
    prefix?: boolean;
    rerank?: boolean;
    snippets?: boolean;
  } = {},
): Promise<SearchAnswer[]> {
  const model = searchModelOf(ctx);
  if (!model) {
    throw new ToolFailure(
      'source_failed',
      'Search has no model on this site.',
      'PETAL_SEARCH_URL names where its models answer (coordinator/search_model_up.sh).',
    );
  }
  const kinds = new Set(o.kinds ?? FINDABLE_KINDS);
  try {
    const shared = await mapSet(ctx, model);
    const subject = ctx.caller?.subject ?? null;
    const own = subject ? await ownDocs(ctx, subject, shared.cards) : [];
    const set = own.length
      ? joinSets(shared.set, await searchSet(own, model, keepOf(privateStore(ctx.config))))
      : shared.set;
    const found = await find(set, q, model, {
      n: o.limit ?? 10,
      rerank: o.rerank === false ? 0 : RERANKED,
      // a map with what matched under it, when maps are asked for; else each as itself
      group: kinds.has('map'),
      prefix: o.prefix === true,
      only: (d) => kinds.has(d.kind),
    });
    const answer = (f: Omit<Found, 'matched'>) => ({
      kind: f.kind,
      id: idOf(f),
      title: f.title,
      about: f.about ?? null,
      score: f.score,
      ranks: f.ranks,
      ...(f.rerank !== undefined ? { rerank: f.rerank } : {}),
      ...(f.at ? { at: f.at } : {}),
      ...(o.snippets ? { snippet: snippetOf(f.text, q) } : {}),
    });
    const out: SearchAnswer[] = [];
    for (const f of found) {
      const matched = f.matched ?? [];
      const card = f.kind === 'map' ? shared.cards.get(f.id) : undefined;
      out.push({
        ...answer(f),
        ...(card ? { view_url: card.view_url } : {}),
        ...(matched.length ? { matched: matched.map(answer) } : {}),
      });
    }
    return out;
  } catch (e) {
    if (e instanceof SearchModelDown) {
      throw new ToolFailure(
        'source_failed',
        e.message,
        'coordinator/search_model_up.sh starts it.',
      );
    }
    throw e;
  }
}

const ANSWER = obj(['kind', 'id', 'title', 'score', 'ranks'], {
  kind: { type: 'string', enum: [...FINDABLE_KINDS] },
  id: { type: 'string' },
  title: { type: 'string' },
  about: { type: ['string', 'null'] },
  view_url: { type: 'string' },
  score: { type: 'number' },
  ranks: obj([], { words: { type: 'integer' }, meaning: { type: 'integer' } }),
  rerank: { type: 'number' },
  matched: { type: 'array', items: { type: 'object' } },
});

type SearchInput = { q: string; kinds?: FindableKind[]; limit?: number };

/** The tool, with whose search it is: the door's caller, or the person a run is for. */
const searchTool = (as: (ctx: ToolContext) => ToolContext) =>
  defineTool<SearchInput, { results: SearchAnswer[] }>({
    name: 'search_petals',
    title: 'Search Petals',
    description:
      "Searches everything on Petals' map (organisations, their names, symbols and types, and their proposals) " +
      'and, for the signed-in person, their own conversations, explorations, notes, follows and annotations: by ' +
      'words and by meaning, so a question in any words finds what it is about ("the DAO that funds NEAR ' +
      'marketing", "who paid for a hackathon booth"). One answer per map, with the proposals or claims that ' +
      'matched under it. The web is search, not this.',
    input: obj(
      ['q'],
      {
        q: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          description: 'a question, words, a name, a symbol or an address',
        },
        kinds: {
          type: 'array',
          items: { type: 'string', enum: [...FINDABLE_KINDS] },
          description: 'only these kinds; all when absent',
        },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      },
      { additionalProperties: false },
    ),
    output: obj(['results'], { results: { type: 'array', items: ANSWER } }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    async run({ q, kinds, limit }, ctx) {
      return {
        results: await searchPetals(as(ctx), q, {
          ...(kinds ? { kinds } : {}),
          ...(limit ? { limit } : {}),
        }),
      };
    },
  });

export const searchPetalsTool = searchTool((ctx) => ctx);

/** search_petals for one person: Petals' agent's run, which knows whose conversation it is (jobs.ts). */
export const searchPetalsFor = (subject: string | null) =>
  searchTool((ctx) => ({
    ...ctx,
    caller: { ...ctx.caller, subject, door: ctx.caller?.door ?? 'site' },
  }));
