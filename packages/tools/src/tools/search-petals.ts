// search_petals (#105; Elco, 11 Nov: "did we ever implement search with the embedding model on the server being
// super smart to find shit all sorts of different ways?"): one search over everything on the map (organisations,
// their names, symbols and types, and their proposals) and the signed-in person's own work (conversations,
// explorations, shapes, notes, follows) and annotations, by words and by meaning (search-index.ts), on the models
// on Elco's Mac (search-model.ts). One answer per map, with what matched under it. The shared map's documents
// are built when they change and each text is embedded once, kept in the store (migration 29); a load isn't
// waited on, it's seen at the next search. Petals' agent, people's agents (/mcp) and GET /api/v1/search use it.
import { type Mark, validateMark } from '@petal/core';
import type { Claim } from '@petal/core/types';
import type { AnnotationRow, Store } from '@petal/store';
import { defineTool } from '../define.ts';
import { docsPages } from '../docs-pages.ts';
import { privateStore } from '../drafts.ts';
import { retiredClaim } from '../hidden.ts';
import { type MapCard, mapsOf, mapViews, typeWords } from '../map.ts';
import { MAPPING, PUBLISHED } from '../mapping-claims.ts';
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
import { loadSnapshot, obj } from './shared.ts';

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
/** The pages /docs shows (Elco, 12 Nov: "the search function" on the docs): asked for by name, never by default. */
export const DOC_KINDS = ['doc'] as const;
export const FINDABLE_KINDS = [...MAP_KINDS, ...OWN_KINDS, ...DOC_KINDS] as const;
export type FindableKind = (typeof FINDABLE_KINDS)[number];
/** What's searched when no kinds are asked: the map and the person's own, as before the docs were. */
export const DEFAULT_KINDS = [...MAP_KINDS, ...OWN_KINDS] as const;

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
  /** a ref's name: its map's, or what Petals' mapping's name claims say */
  nameOf: (ref: string) => string | null;
}
const mapSets = new Map<string, Promise<MapSet>>();

/**
 * The shared map's documents, built again only when the map changes: its drawings, its marks or its proposals.
 * Hidden maps (#96) are in none of them.
 */
async function mapSet(ctx: ToolContext, model: SearchModel | null): Promise<MapSet> {
  const store = privateStore(ctx.config);
  // the map as anyone sees it: a viewer's names change their drawings, not what's on the map
  const views = await mapViews({ ...ctx, names: [] });
  const marks = await store.mark.list();
  const proposalRows = await store.proposals.list();
  // Petals' own mapping's claims and what people published (publish-data.ts), the same for every viewer
  // a claim a wave reissued is retired: its replacement is what's said (hidden.ts)
  const claimRows = [
    ...(await store.annotation.list(MAPPING)),
    ...(await store.annotation.list(PUBLISHED)),
  ].filter((c) => !retiredClaim(c.id));
  const sig = [
    model?.embedding ?? 'words',
    views.map((v) => v.sha).join(','),
    marks.map((m) => `${m.about}@${m.read_at}`).join(','),
    proposalRows.map((p) => `${p.about}@${p.read_at}`).join(','),
    claimRows.map((c) => c.id).join(','),
  ].join('|');
  // one kept per store and way: words alone, while the model is off, don't push the model's set out
  const key = `${ctx.config.databaseUrl ?? ctx.config.stateDir ?? ctx.config.root}|${model?.embedding ?? 'words'}`;
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
    const nameOf = namer(cards, claimRows);
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
    if (claimRows.length) {
      // each under the map whose accounts it's about, as mapClaims finds a map's (mapping-claims.ts)
      const mapOfAccount = new Map<string, string>();
      for (const card of cards.values()) {
        mapOfAccount.set(accountKey(card.id), card.id);
        const chain = card.id.slice(0, card.id.lastIndexOf(':'));
        for (const r of card.readings) {
          for (const p of (await loadSnapshot(ctx, r.snapshot)).participants) {
            const k = accountKey(p.id.includes(':') ? p.id : `${chain}:${p.id}`);
            if (!mapOfAccount.has(k)) mapOfAccount.set(k, card.id);
          }
        }
      }
      for (const r of claimRows)
        docs.push(claimDoc(r, mapOfAccount.get(accountKey(r.subject)), nameOf));
    }
    return { sig, cards, nameOf, set: await searchSet(docs, model, keepOf(store)) };
  })();
  mapSets.set(key, made);
  return made;
}

/**
 * The docs' documents (docs-pages.ts): each page by its repo path, and each of its sections under it by the path
 * and its anchor, so meaning finds what's deep in a long page. The files change only with a deploy, so they're
 * read once a process.
 */
export function docDocs(root: string): Findable[] {
  const docs: Findable[] = [];
  for (const page of docsPages(root)) {
    docs.push({
      kind: 'doc',
      id: page.path,
      title: page.title,
      text: [page.title, page.summary, page.intro, ...page.sections.map((x) => x.title)]
        .filter(Boolean)
        .join('\n'),
      group: page.path,
      keys: [page.title],
    });
    for (const x of page.sections) {
      docs.push({
        kind: 'doc',
        id: `${page.path}#${x.anchor}`,
        title: x.title,
        // its page's name too, so a section's meaning is read in its page's
        text: `${x.title}\n${page.title}\n${x.text}`,
        about: page.path,
        group: page.path,
      });
    }
  }
  return docs;
}

const docSets = new Map<string, Promise<SearchSet>>();
function docSet(ctx: ToolContext, model: SearchModel | null): Promise<SearchSet> {
  const key = `${ctx.config.root}|${model?.embedding ?? 'words'}`;
  let made = docSets.get(key);
  if (!made) {
    made = searchSet(docDocs(ctx.config.root), model, keepOf(privateStore(ctx.config)));
    // a model that stopped answering while it was built: the next search builds it again
    made.catch(() => docSets.delete(key));
    docSets.set(key, made);
  }
  return made;
}

const objectWords = (o: Claim['object']) => (typeof o === 'string' ? o : o.value);
/** An account as a map's petals have it: an EVM address in lower case. */
const accountKey = (id: string) => (id.startsWith('eip155:') ? id.toLowerCase() : id);

/** Each verb in words, as a claim's title reads it (core's VERBS say what each means). */
const VERB_WORDS: Record<string, string> = {
  holds: 'holds',
  measured: 'measured',
  delegates_to: 'delegates to',
  owned_by: 'is owned by',
  member_of: 'is a member of',
  holds_role: 'holds a role in',
  voted: 'voted on',
  proposed: 'proposed',
  reviewed: 'reviewed',
  paid: 'paid',
  funded_by: 'was funded by',
  signer_of: 'can sign for',
  deployed: 'deployed',
  controls: 'controls',
  declares_same_controller: 'says it shares a controller with',
  shares_signer: 'shares a signer with',
  moves_with: 'moves with',
  same_funder: 'shares a funder with',
  same_address: 'has the same address as',
  labelled: 'is labelled',
  requests_correction: 'asks to correct',
  challenges: 'challenges',
  responds: 'responds to',
  retracts: 'retracts',
  supersedes: 'supersedes',
  named: 'is named',
  linked: 'has a page,',
  is_a: 'is a',
};

/** An account, proposal or other ref, short: 0xf02f…a155, 8HVY…uSX9, alice.near, proposal 12. */
export function shortRef(ref: string): string {
  if (ref.startsWith('proposal:')) return `proposal ${ref.slice(ref.lastIndexOf(':') + 1)}`;
  const last = ref.slice(ref.lastIndexOf(':') + 1);
  if (/^0x[0-9a-fA-F]{40}$/.test(last)) return `${last.slice(0, 6)}…${last.slice(-4)}`;
  if (last.length > 20 && !last.includes('.')) return `${last.slice(0, 4)}…${last.slice(-4)}`;
  return last;
}

const TITLE_MAX = 120;
const shortened = (s: string) => {
  const one = s.replace(/\s+/g, ' ').trim();
  if (one.length <= TITLE_MAX) return one;
  const cut = one.slice(0, TITLE_MAX);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), TITLE_MAX - 20))}…`;
};

/**
 * A claim in words: who it's about, by name (its map's, or one a claim gives it) or short address, then what
 * it says. "Compound: No stable voting bloc is asserted…", "0xf02f…a155 is named Dekan", "RaidGuild is a DAO".
 */
export function claimTitle(
  subject: string,
  verb: string,
  object: Claim['object'],
  nameOf: (ref: string) => string | null,
): string {
  // a name claim names its own subject, so its subject reads as its address
  const who = (verb === 'named' ? null : nameOf(subject)) ?? shortRef(subject);
  const what =
    typeof object === 'string'
      ? (nameOf(object) ?? shortRef(object))
      : [object.value, object.unit].filter(Boolean).join(' ');
  if (verb === 'noted') return shortened(`${who}: ${what}`);
  return shortened(`${who} ${VERB_WORDS[verb] ?? verb.replaceAll('_', ' ')} ${what}`);
}

/** A claim's document: what it says, who it's about, its evidence's words; under its map when there is one. */
function claimDoc(
  r: AnnotationRow,
  map: string | undefined,
  nameOf: (ref: string) => string | null,
): Findable {
  const c = JSON.parse(r.body) as Claim;
  const evidence = (c.evidence ?? [])
    .map((e) => [e.note, e.quote, e.url, e.platform].filter(Boolean).join(' '))
    .filter(Boolean);
  const object = objectWords(c.object);
  const title = claimTitle(r.subject, r.verb, c.object, nameOf);
  return {
    kind: 'claim',
    id: `claim:${r.id}`,
    title,
    text: [title, `${r.verb} ${object}`, r.subject, ...evidence].join('\n'),
    about: r.subject,
    ...(map ? { group: map } : {}),
    keys: r.verb === 'named' ? [object] : [],
  };
}

/** Names for refs: each map's by its address, then what name claims say, the first said winning. */
function namer(cards: Map<string, MapCard>, named: readonly AnnotationRow[]) {
  const names = new Map<string, string>();
  for (const r of named) {
    if (r.verb !== 'named') continue;
    const k = accountKey(r.subject);
    if (!names.has(k)) names.set(k, objectWords((JSON.parse(r.body) as Claim).object));
  }
  return (ref: string) => cards.get(ref)?.name ?? names.get(accountKey(ref)) ?? null;
}

/** The person's own: their annotations, and their work as /api/v1/search has indexed it. */
async function ownDocs(ctx: ToolContext, subject: string, shared: MapSet) {
  const store = privateStore(ctx.config);
  const docs: Findable[] = [];
  const rows = await store.annotation.list(subject);
  // their own names first, as their petals show them (annotation step 6), then the map's
  const own = namer(new Map(), rows);
  const nameOf = (ref: string) => own(ref) ?? shared.nameOf(ref);
  for (const r of rows) {
    // a claim about a map's own address sits under that map
    docs.push(claimDoc(r, shared.cards.has(r.subject) ? r.subject : undefined, nameOf));
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

/** What search says when its model isn't running (Elco, 11 Nov: "Fall back to word search"). */
export const MEANING_OFF =
  "Search by meaning is off right now: its model isn't running, so these were found by their words alone.";

export interface SearchResults {
  results: SearchAnswer[];
  /** on: words and meaning, reranked; off: the model isn't running, and these are words alone */
  meaning: 'on' | 'off';
  says?: string;
}

/**
 * Everything on the map, and the signed-in person's own (ctx.caller.subject), best first: one answer per map
 * with what matched under it. `prefix` reads the last word as the start of words, for search as someone types.
 * When the model isn't running (none set, or it doesn't answer), it searches by words alone and says so.
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
): Promise<SearchResults> {
  const model = searchModelOf(ctx);
  const off = async (): Promise<SearchResults> => ({
    results: await searchWith(ctx, null, q, o),
    meaning: 'off',
    says: MEANING_OFF,
  });
  if (!model) return off();
  try {
    return { results: await searchWith(ctx, model, q, o), meaning: 'on' };
  } catch (e) {
    if (e instanceof SearchModelDown) {
      console.warn(`petal: search by words alone: ${e.message}`);
      return off();
    }
    throw e;
  }
}

async function searchWith(
  ctx: ToolContext,
  model: SearchModel | null,
  q: string,
  o: Parameters<typeof searchPetals>[2] = {},
): Promise<SearchAnswer[]> {
  const kinds = new Set(o.kinds ?? DEFAULT_KINDS);
  const sets: SearchSet[] = [];
  // the map, and the person's own, only when something other than the docs is asked for
  const shared = [...kinds].some((k) => k !== 'doc') ? await mapSet(ctx, model) : null;
  if (shared) {
    sets.push(shared.set);
    const subject = ctx.caller?.subject ?? null;
    const own = subject ? await ownDocs(ctx, subject, shared) : [];
    if (own.length) sets.push(await searchSet(own, model, keepOf(privateStore(ctx.config))));
  }
  if (kinds.has('doc')) sets.push(await docSet(ctx, model));
  const [first, ...rest] = sets;
  if (!first) return [];
  const set = rest.reduce(joinSets, first);
  const found = await find(set, q, model, {
    n: o.limit ?? 10,
    rerank: o.rerank === false ? 0 : RERANKED,
    // a map with what matched under it, or a page with its sections, when those are asked for; else each as itself
    group: kinds.has('map') || kinds.has('doc'),
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
  return found.map((f) => {
    const matched = f.matched ?? [];
    const card = f.kind === 'map' ? shared?.cards.get(f.id) : undefined;
    return {
      ...answer(f),
      ...(card ? { view_url: card.view_url } : {}),
      ...(matched.length ? { matched: matched.map(answer) } : {}),
    };
  });
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
  defineTool<SearchInput, SearchResults>({
    name: 'search_petals',
    title: 'Search Petals',
    description:
      "Searches everything on Petals' map (organisations, their names, symbols and types, and their proposals) " +
      'and, for the signed-in person, their own conversations, explorations, notes, follows and annotations: by ' +
      'words and by meaning: it finds things on the map by meaning, without their names ("the DAO that funds NEAR ' +
      'marketing", "who paid for a hackathon booth"). One answer per map, with the proposals or claims that ' +
      'matched under it. When its model is off it searches by words alone and says so. The web is search, not this.',
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
          description:
            "only these kinds; when absent, the map's and the person's own. 'doc' searches Petals' docs " +
            '(/docs), each page by its repo path with the sections that matched under it',
        },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      },
      { additionalProperties: false },
    ),
    output: obj(['results', 'meaning'], {
      results: { type: 'array', items: ANSWER },
      meaning: { type: 'string', enum: ['on', 'off'] },
      says: { type: 'string' },
    }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    async run({ q, kinds, limit }, ctx) {
      return searchPetals(as(ctx), q, {
        ...(kinds ? { kinds } : {}),
        ...(limit ? { limit } : {}),
      });
    },
  });

export const searchPetalsTool = searchTool((ctx) => ctx);

/** search_petals for one person: Petals' agent's run, which knows whose conversation it is (jobs.ts). */
export const searchPetalsFor = (subject: string | null) =>
  searchTool((ctx) => ({
    ...ctx,
    caller: { ...ctx.caller, subject, door: ctx.caller?.door ?? 'site' },
  }));
