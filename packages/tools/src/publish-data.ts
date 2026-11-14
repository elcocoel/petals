// Publishing to the shared map: what a person kept about a map in their projects goes to everyone's Power Map
// with one press, signed by their wallet (NEP-413, as signing in: no transaction, nothing spent), at once,
// credited to them.
// Their claims join the map's Insights beside Petals' own mapping's, each saying who answers for it; the signed
// message and its signature are kept with each, so anyone can check them. What the people rule keeps private
// (people.ts) stays in their project, and says why.
//
// The qualifier, a look before the press: each item, one per row, with its name, address,
// source and a confidence before the press. A veto is the claim rules (validateClaim, people.ts): what fails them
// stays private and says why. The confidence is how strongly the claim's own evidence says it, read by search's
// reranker on the host machine (Qwen3-Reranker, search-model.ts): nothing new runs and nothing is spent. With the
// model off, confidence is null and says so; it never holds a publish back.
import {
  aboutKey,
  type Cases,
  type Composition,
  canonicalJson,
  casesOf,
  compose,
  type Entry,
  IMPORTED_AUTHOR,
  LINK_VERSION,
  layerTitle,
  MANIFEST_VERSION,
  type Manifest,
  manifestHash,
  manifestText,
  PETALS_AUTHOR,
  type Proof,
  PUBLICATION_VERSION,
  type Publication,
  type State,
  sameAbout,
  sha256Hex,
  signedText,
  stateKey,
  textNames,
  textNamesManifest,
  unsignedHash,
  validateClaim,
} from '@petal/core';
import type { Claim, ClaimEvidence, Spec } from '@petal/core/types';
import { nonceStore, privateStore, stateDirOf } from './drafts.ts';
import { ToolFailure } from './errors.ts';
import { retiredClaim } from './hidden.ts';
import { mapViews } from './map.ts';
import { aboutOneOf, cardAccounts, PUBLISHED } from './mapping-claims.ts';
import { appendPress, appendPublication, authorName, compositionOf, recordOf } from './record.ts';
import { petalsHoldings } from './record-import.ts';
import { keptScore } from './scores.ts';
import { SEARCH_RERANKER, SearchModelDown } from './search-model.ts';
import { mapIndex } from './tools/maps.ts';
import { searchModelOf } from './tools/search-petals.ts';
import { findSnapshot } from './tools/shared.ts';
import type { ToolContext } from './types.ts';

export { PUBLISHED };

/** What a prepared press holds until it's signed: a publication/v1, unsigned (composition.md, section 2). */
const PRESS = 'press/publication-v1';
/** A prepared press over many maps: the manifest/v1 and its publications, unsigned (composition.md, section 2b). */
const MANY = 'press/manifest-v1';

/**
 * What a press over many maps reads once, not once per map: the maps, what's published, the person's claims, their
 * projects' data, the readings they drew, and what Petals holds. One press, one of these; a press of one map, none.
 */
export interface Shared {
  index?: ReturnType<typeof mapIndex>;
  published?: Promise<Set<string>>;
  annotations?: Promise<{ id: string; subject: string; body: string }[]>;
  projectData?: Promise<{ about: string | null; petal: string; sha256: string; body: string }[]>;
  specs?: Promise<Set<string>>;
  views?: ReturnType<typeof mapViews>;
  holdings?: ReturnType<typeof petalsHoldings>;
}
function once<K extends keyof Shared>(
  shared: Shared | undefined,
  key: K,
  load: () => NonNullable<Shared[K]>,
): NonNullable<Shared[K]> {
  if (!shared) return load();
  shared[key] ??= load();
  return shared[key] as NonNullable<Shared[K]>;
}

/** The ids of every claim on the shared map's Insights. */
const publishedIds = (ctx: ToolContext, shared?: Shared) =>
  once(
    shared,
    'published',
    async () =>
      new Set((await privateStore(ctx.config).annotation.list(PUBLISHED)).map((r) => r.id)),
  );
/** The person's own claims, as kept. */
const annotationsOf = (ctx: ToolContext, owner: string, shared?: Shared) =>
  once(shared, 'annotations', () => privateStore(ctx.config).annotation.list(owner));
/** Everything the person's agents kept in their projects (keep_data). */
const projectDataOf = (ctx: ToolContext, owner: string, shared?: Shared) =>
  once(shared, 'projectData', async () => {
    const store = privateStore(ctx.config);
    const all: { about: string | null; petal: string; sha256: string; body: string }[] = [];
    for (const project of await store.exploration.listByOwner(owner, Number.MAX_SAFE_INTEGER))
      all.push(...(await store.projectData.list(owner, project.id)));
    return all;
  });
/** The views of the person's projects' steps: the readings they drew. */
const specsOf = (ctx: ToolContext, owner: string, shared?: Shared) =>
  once(shared, 'specs', async () => {
    const store = privateStore(ctx.config);
    const out = new Set<string>();
    for (const project of await store.exploration.listByOwner(owner, Number.MAX_SAFE_INTEGER))
      for (const step of await store.step.list(project.id))
        if (step.spec_sha256) out.add(step.spec_sha256);
    return out;
  });

/** Where an item's word comes from: a proposal or a transaction it rests on (or, kept private, what else). */
export interface RowSource {
  kind: string;
  /** the proposal's or the transaction's ref, else the address it was read at */
  ref: string | null;
  quote?: string;
  url?: string;
}

/** One item, as the person reads it before the press: one row in the workspace. */
export interface PublishRow {
  /** the layer of the map it joins: Insights, for a claim */
  layer: string;
  id: string;
  /** the account it's about */
  subject: string;
  verb: string;
  /** what it says: the name, for a name */
  name: string;
  source: RowSource | null;
  /** how strongly its evidence says it, 0 to 1, by the reranker; null when it couldn't be read */
  confidence: number | null;
}

/** An item that stays private, and why (the claim rules' words). */
export interface StaysPrivate extends PublishRow {
  why: string;
}

/**
 * What one press adds to the map, by layer and kind (a clear indicator of the data layers and claims it
 * adds): goes, what the press publishes; else why it can't go yet.
 */
export interface Adds {
  layer: string;
  kind: string;
  /** a claim's verb, for claims */
  verb?: string;
  label: string;
  count: number;
  goes: boolean;
  why?: string;
}

/** A reading the person drew of the map, as the box lists it. */
export interface ReadingRow {
  layer: 'Readings';
  /** the view's hash, as in its /d/ link */
  id: string;
  title: string;
  /** what was read, in words, and its day: 'Moloch v3 (Baal) members on Gnosis, 11 Nov' */
  what: string;
  as_of: string;
  accounts: number;
}

/** What one press would publish on a map, and what stays private. */
export interface Publishable {
  about: string;
  name: string;
  claims: Claim[];
  /** the readings they drew of it that no one is credited with yet, credited to them by the press */
  readings: ReadingRow[];
  /** the claims, one row each, in the order they'd go */
  rows: PublishRow[];
  private: StaysPrivate[];
  /** of what they kept about it, how many are already on the shared map */
  published: number;
  /** what the press adds, by layer and kind, and what the person kept that can't go yet */
  adds: Adds[];
  /** the model that read the confidences, or null */
  scored_by: string | null;
  /** why nothing was scored, when nothing was */
  unscored?: string;
  /** each layer the press would publish, and what it adds to the map in front, by case (composition.md, section 9) */
  layers: PressLayer[];
  /** the same cases, summed for the whole publication */
  totals: PressCases;
}

/** An author already credited on the map, as the box names them. */
export interface Named {
  author: string;
  name: string;
}

/** The four cases (composition.md, section 5), with the authors already credited named. */
export interface PressCases {
  new_data: Cases['new_data'];
  new_moment: Cases['new_moment'];
  new_subjects: Cases['new_subjects'];
  match: { count: number; authors: Named[] };
  differs: { count: number; authors: Named[] };
}

/** A layer the press would publish: its name (sha256), its format, its title, and what it adds. */
export interface PressLayer {
  sha256: string;
  petal: string;
  title: string;
  cases: PressCases;
}

/** What a claim says, in words: the name for a name. */
const wordsOf = (c: Claim) =>
  typeof c.object === 'string' ? c.object : String((c.object as { value?: unknown }).value ?? '');

/** The piece of evidence a row shows: the record it rests on (a proposal, a transaction), else the first. */
function sourceOf(c: Claim): RowSource | null {
  const e: ClaimEvidence | undefined =
    c.evidence.find((x) => (x.type === 'proposal' && x.proposal) || (x.type === 'tx' && x.tx)) ??
    c.evidence[0];
  if (!e) return null;
  return {
    kind: e.type === 'tx' ? 'transaction' : (e.type ?? (e.proposal ? 'proposal' : 'other')),
    ref: e.proposal ?? e.tx ?? e.url ?? null,
    ...(e.quote ? { quote: e.quote } : {}),
    ...(e.url ? { url: e.url } : {}),
  };
}

/** A piece of evidence, as a question names it. */
const RECORD: Record<string, string> = {
  proposal: 'proposal',
  tx: 'transaction',
  page: 'page',
  post: 'post',
};

/**
 * How the claim reads to the reranker against one piece of its evidence: a name as the record names it ("A
 * proposal names Dekan"); anything else in its own words. Measured on one person's 68 names (12 Nov, read only):
 * this phrasing put 2 under 0.3 where "This account is named Dekan" put 6, the record's quote unchanged.
 */
const statementOf = (c: Claim, e: ClaimEvidence) =>
  c.verb === 'named'
    ? `A ${RECORD[e.type ?? ''] ?? 'record'} names ${wordsOf(c)}`
    : wordsOf(c) || c.verb;

/** A piece's own words, its quote and its note, each one document. */
const wordsIn = (e: ClaimEvidence) =>
  [e.quote, e.note].filter((t): t is string => typeof t === 'string' && t.trim().length > 0);

/**
 * The qualifier's confidence for each claim: the reranker's reading of how well its own evidence says it, the
 * best piece's. Null for a claim with no words of evidence; all null, with why, when the model is off.
 */
async function confidences(
  ctx: ToolContext,
  claims: readonly Claim[],
): Promise<{ scores: (number | null)[]; scored_by: string | null; unscored?: string }> {
  const nulls = claims.map(() => null);
  const model = searchModelOf(ctx);
  if (!model)
    return { scores: nulls, scored_by: null, unscored: 'no model is set up on this site' };
  const by = ctx.config.fake ? 'fake-words' : SEARCH_RERANKER;
  try {
    const scores: (number | null)[] = [];
    for (const c of claims) {
      // the best piece's reading: one record that says it is enough
      let best: number | null = null;
      for (const e of c.evidence) {
        const docs = wordsIn(e);
        if (!docs.length) continue;
        const statement = statementOf(c, e);
        const read = await keptScore(stateDirOf(ctx.config), by, statement, docs, async () =>
          Math.max(...(await model.rerank(statement, docs))),
        );
        best = best === null ? read : Math.max(best, read);
      }
      scores.push(best === null ? null : Math.round(best * 100) / 100);
    }
    return { scores, scored_by: by };
  } catch (e) {
    if (e instanceof SearchModelDown)
      return { scores: nulls, scored_by: null, unscored: e.message };
    throw e;
  }
}

/** Each verb as the box names it (the workspace's 'Insights · Names · 35'). */
const VERB_LABEL: Record<string, string> = {
  named: 'Names',
  noted: 'Notes',
  is_a: 'Types',
  holds: 'Holdings',
  controls: 'Control',
  member_of: 'Memberships',
  delegates_to: 'Delegations',
  moves_with: 'Voting together',
};

/** Where a claim goes on a map: Insights, beside Petals' mapping's. */
const INSIGHTS = 'Insights';

/** Claims counted by verb, as entries of what a press adds. */
function claimAdds(claims: readonly Claim[], goes: boolean, why?: string): Adds[] {
  const by = new Map<string, number>();
  for (const c of claims) by.set(c.verb, (by.get(c.verb) ?? 0) + 1);
  return [...by].map(([verb, count]) => ({
    layer: INSIGHTS,
    kind: 'claims',
    verb,
    label: VERB_LABEL[verb] ?? verb.replaceAll('_', ' '),
    count,
    goes,
    ...(why ? { why } : {}),
  }));
}

/** What a person kept in a project, by its kind, as the box names it. */
const KEPT: Record<string, { layer: string; label: string }> = {
  snapshot: { layer: 'Readings', label: 'Readings kept' },
  value: { layer: 'Value', label: 'Values kept' },
  proposals: { layer: 'Proposals', label: 'Proposals kept' },
  mark: { layer: 'Mark', label: 'Names and logos kept' },
  layer: { layer: 'Layers', label: 'Layers kept' },
  vesting: { layer: 'Vesting', label: 'Vesting kept' },
  payouts: { layer: 'Payouts', label: 'Payouts kept' },
};

/**
 * What the person made or kept of this map that the press can't publish yet: the readings they drew in their
 * projects (on the map already, uncredited), and the data and layers their agents kept about it.
 */
/** A day as the box says it: 11 Nov. */
const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * The readings the person drew of this map in their projects (the views of their steps): those no one is
 * credited with yet go with the press, in their name; those already theirs are counted as published; a view
 * someone else is credited with isn't theirs to take.
 */
async function drawnReadings(
  ctx: ToolContext,
  owner: string,
  about: string,
  by: string | null,
  shared?: Shared,
): Promise<{ readings: ReadingRow[]; theirs: number }> {
  const specs = await specsOf(ctx, owner, shared);
  if (!specs.size) return { readings: [], theirs: 0 };
  const views = (
    await once(shared, 'views', () => mapViews(ctx, undefined, { hidden: true }))
  ).filter((v) => v.map === about && specs.has(v.sha));
  return {
    readings: views
      .filter((v) => v.made_by === null)
      .map((v) => ({
        layer: 'Readings' as const,
        id: v.sha,
        title: v.name ?? v.title,
        what: `${v.about}, ${dayOf(v.as_of)}`,
        as_of: v.as_of,
        accounts: v.count,
      })),
    theirs: by ? views.filter((v) => v.made_by === by).length : 0,
  };
}

const rowOf = (c: Claim, confidence: number | null): PublishRow => ({
  layer: INSIGHTS,
  id: c.id,
  subject: c.subject,
  verb: c.verb,
  name: wordsOf(c),
  source: sourceOf(c),
  confidence,
});

/** One of Petals' documents the press would publish as a layer, by its hash. */
interface PressDoc {
  sha256: string;
  petal: string;
  doc: unknown;
}

const hashOf = (doc: unknown) => sha256Hex(canonicalJson(doc));
const kindOf = (petal: string) => petal.split('/')[0] ?? petal;

/**
 * The documents the person kept about this map in their projects (keep_data's values, proposals, marks, readings,
 * vesting, payouts; keep_layer's layers), each once by its hash, oldest first. A claim kept this way is an
 * annotation, published with the claims.
 */
async function keptDocs(
  ctx: ToolContext,
  owner: string,
  about: string,
  shared?: Shared,
): Promise<PressDoc[]> {
  const store = privateStore(ctx.config);
  const out = new Map<string, PressDoc>();
  for (const row of await projectDataOf(ctx, owner, shared)) {
    if (!row.about || !sameAbout(row.about, about)) continue;
    if (kindOf(row.petal) === 'claim' || out.has(row.sha256)) continue;
    out.set(row.sha256, { sha256: row.sha256, petal: row.petal, doc: JSON.parse(row.body) });
  }
  for (const row of await store.layer.list(owner, about)) {
    if (out.has(row.hash)) continue;
    const doc = JSON.parse(row.body) as { petal?: string };
    out.set(row.hash, { sha256: row.hash, petal: doc.petal ?? 'layer/v1', doc });
  }
  return [...out.values()];
}

/** The snapshot a reading the person drew reads, by the view's hash: the layer it publishes. */
async function readingDoc(ctx: ToolContext, view: string): Promise<PressDoc | null> {
  const row = await privateStore(ctx.config).draft.get(view);
  if (!row) return null;
  const sha = (JSON.parse(row.body) as Spec).snapshot?.sha256;
  const s = sha ? await findSnapshot(ctx, sha) : null;
  return s && sha ? { sha256: sha, petal: s.petal, doc: s } : null;
}

/** The hashes a layer/v1 was built on (its `from`); nothing for every other format. */
function builtOn(doc: unknown): string[] {
  const d = doc as { petal?: unknown; from?: unknown };
  return typeof d?.petal === 'string' && d.petal.startsWith('layer/') && Array.isArray(d.from)
    ? d.from.filter((h): h is string => typeof h === 'string')
    : [];
}

/** The version an author's next press on a map follows. */
interface Line {
  /** their latest publication about the map (the next one's `previous`), or null for a first */
  latest: Entry | null;
  /** the publication the next version comes from (its `parent`) */
  parent: string | null;
  /** the layers the next version carries over */
  carried: Publication['layers'];
  /** Petals' own, not yet signed over the import: its next version signs what the import holds */
  signsImport: boolean;
}

/**
 * The version this author's next press on a map follows: their latest there, the one it comes from and the layers
 * it carries. petals.near continues the import's line too (composition.md, section 2b): until it has signed a
 * version over the import, its parent is the import's latest, and it carries the import's layers beside its own.
 */
async function lineOf(ctx: ToolContext, about: string, author: string): Promise<Line> {
  const entries = await recordOf(ctx, about);
  if (author !== PETALS_AUTHOR) {
    const latest = entries.filter((e) => e.publication.author === author).at(-1) ?? null;
    return {
      latest,
      parent: latest?.hash ?? null,
      carried: latest?.publication.layers ?? [],
      signsImport: false,
    };
  }
  const own = entries.filter(
    (e) => e.publication.author === PETALS_AUTHOR || e.publication.author === IMPORTED_AUTHOR,
  );
  const latest = own.at(-1) ?? null;
  const imports = own.filter((e) => e.publication.author === IMPORTED_AUTHOR);
  const importHashes = new Set(imports.map((e) => e.hash));
  const taken = own.some(
    (e) =>
      e.publication.author === PETALS_AUTHOR &&
      e.publication.parent !== null &&
      importHashes.has(e.publication.parent),
  );
  const lastImport = imports.at(-1);
  if (taken || !lastImport)
    return {
      latest,
      parent: latest?.hash ?? null,
      carried: latest?.publication.layers ?? [],
      signsImport: false,
    };
  const signed = own.filter((e) => e.publication.author === PETALS_AUTHOR).at(-1);
  const carried = [...lastImport.publication.layers, ...(signed?.publication.layers ?? [])].filter(
    (l, i, all) => all.findIndex((x) => x.sha256 === l.sha256) === i,
  );
  return { latest, parent: lastImport.hash, carried, signsImport: true };
}

/** The map as the record composes it now; empty when nothing about it was ever published. */
async function mapNow(ctx: ToolContext, about: string): Promise<Composition> {
  return (await compositionOf(ctx, about)) ?? compose(about, [], new Map());
}

const named = (authors: readonly string[]): Named[] =>
  authors.map((author) => ({ author, name: authorName(author) }));

/** One layer's cases on the map in front, as its author would publish it, with the authors named. */
function pressCases(map: Composition, doc: unknown, author: string): PressCases {
  const c = casesOf(map, doc, author);
  return {
    ...c,
    match: { count: c.match.count, authors: named(c.match.authors) },
    differs: { count: c.differs.count, authors: named(c.differs.authors) },
  };
}

/** The cases of a whole publication: each layer's, summed. */
function summed(all: readonly PressCases[]): PressCases {
  const whats = new Set<string>();
  const moments = new Map<string, { what: string; state: State; newest: State | null }>();
  const authors = { match: new Map<string, Named>(), differs: new Map<string, Named>() };
  const out: PressCases = {
    new_data: { whats: [] },
    new_moment: { states: [] },
    new_subjects: { count: 0 },
    match: { count: 0, authors: [] },
    differs: { count: 0, authors: [] },
  };
  for (const c of all) {
    for (const w of c.new_data.whats) whats.add(w);
    for (const m of c.new_moment.states) moments.set(`${m.what}\u0000${stateKey(m.state)}`, m);
    out.new_subjects.count += c.new_subjects.count;
    for (const k of ['match', 'differs'] as const) {
      out[k].count += c[k].count;
      for (const a of c[k].authors) authors[k].set(a.author, a);
    }
  }
  out.new_data.whats = [...whats].sort();
  out.new_moment.states = [...moments.values()];
  for (const k of ['match', 'differs'] as const)
    out[k].authors = [...authors[k].values()].sort((a, b) => (a.author < b.author ? -1 : 1));
  return out;
}

/**
 * What one press publishes on a map for this author: the readings they drew, the claims that can go and the
 * documents they kept, each a layer by its hash, less what their latest version holds already. A published version
 * names only what's public (composition.md, section 2): a layer built on one that isn't published, nor in this
 * version, stays back and says why.
 */
async function pressOf(
  ctx: ToolContext,
  o: {
    owner: string;
    about: string;
    author: string | null;
    claims: readonly Claim[];
    readings: readonly ReadingRow[];
    shared?: Shared;
  },
) {
  const line = o.author ? await lineOf(ctx, o.about, o.author) : null;
  const latest = line?.latest ?? null;
  const carried = new Set(line?.carried.map((l) => l.sha256) ?? []);
  const kept = await keptDocs(ctx, o.owner, o.about, o.shared);
  // what Petals holds for the map is what petals.near kept of it: its mapping's readings and the map's own rows
  if (o.author === PETALS_AUTHOR) {
    const held = (await once(o.shared, 'holdings', () => petalsHoldings(ctx))).get(
      aboutKey(o.about),
    );
    for (const l of held?.layers ?? [])
      if (!kept.some((d) => d.sha256 === l.sha256))
        kept.push({ sha256: l.sha256, petal: l.petal, doc: held?.docs.get(l.sha256) });
  }
  const drawn: PressDoc[] = [];
  for (const r of o.readings) {
    const d = await readingDoc(ctx, r.id);
    if (d && !drawn.some((x) => x.sha256 === d.sha256)) drawn.push(d);
  }
  const candidates = [
    ...drawn,
    ...o.claims.map((c) => ({ sha256: hashOf(c), petal: c.petal, doc: c as unknown })),
    ...kept,
  ].filter(
    (d, i, all) => !carried.has(d.sha256) && all.findIndex((x) => x.sha256 === d.sha256) === i,
  );
  const store = privateStore(ctx.config);
  const published = new Map<string, boolean>();
  const isPublished = async (h: string) => {
    if (!published.has(h)) published.set(h, !!(await store.publication.layer(h)));
    return published.get(h) as boolean;
  };
  // what stays back for a `from` in the dark, until nothing more falls out
  let goes = candidates;
  const held: { doc: PressDoc; why: string }[] = [];
  for (let changed = true; changed; ) {
    changed = false;
    const inVersion = new Set([...carried, ...goes.map((d) => d.sha256)]);
    const next: PressDoc[] = [];
    for (const d of goes) {
      const dark: string[] = [];
      for (const h of builtOn(d.doc))
        if (!inVersion.has(h) && !(await isPublished(h))) dark.push(h);
      if (dark.length) {
        held.push({
          doc: d,
          why: `it's built on ${dark.length === 1 ? 'a layer' : `${dark.length} layers`} not published yet`,
        });
        changed = true;
      } else next.push(d);
    }
    goes = next;
  }
  return {
    latest,
    line,
    goes,
    held,
    /** what they kept that their latest version holds already */
    carriedKept: kept.filter((d) => carried.has(d.sha256)).length,
    keptGoing: goes.filter((d) => kept.includes(d)),
  };
}

/** Counted by kind, as entries of what a press adds. */
function keptAdds(docs: readonly PressDoc[], goes: boolean, why?: (d: PressDoc) => string): Adds[] {
  const by = new Map<string, { count: number; why?: string }>();
  for (const d of docs) {
    const kind = kindOf(d.petal);
    const e = by.get(kind) ?? { count: 0, ...(why ? { why: why(d) } : {}) };
    e.count++;
    by.set(kind, e);
  }
  return [...by].map(([kind, e]) => {
    const k = KEPT[kind] ?? { layer: kind, label: `${kind} kept` };
    return {
      layer: k.layer,
      kind,
      label: k.label,
      count: e.count,
      goes,
      ...(e.why ? { why: e.why } : {}),
    };
  });
}

/**
 * What the person (owner, the session's subject) kept about this map in their projects: the claims about its
 * accounts that can be published now, and those the people rule keeps private, with why; and each layer one press
 * would publish in the name of `by`, with what it adds to the map in front (composition.md, sections 5 and 9).
 */
export async function publishable(
  ctx: ToolContext,
  owner: string,
  about: string,
  by: string | null = ctx.caller?.by ?? null,
  o: { shared?: Shared; cases?: boolean } = {},
): Promise<Publishable> {
  const shared = o.shared;
  const found = (await once(shared, 'index', () => mapIndex(ctx, { hidden: true }))).find(
    (m) => m.card.id === about,
  );
  // a press over many maps also publishes what an author holds about an address with no map on the Power Map yet
  // (its own rows, its layers): a dataset is any address, and a map can be drawn there later
  if (!found && !shared)
    throw new ToolFailure(
      'not_found',
      `No map on the Power Map has the address ${about}.`,
      "look_up with its name or address gives each map's id.",
    );
  const out = await publishedIds(ctx, shared);
  const mine = await annotationsOf(ctx, owner, shared);
  // the map's accounts, read only when the person has claims to sort onto it; a press over many maps reads them
  // only for claims not published yet (it doesn't count the published ones)
  const sorting = o.cases === false ? mine.some((r) => !out.has(r.id)) : mine.length > 0;
  const accounts = sorting && found ? await cardAccounts(ctx, found.card) : new Set<string>();
  const claims: Claim[] = [];
  const kept: { claim: Claim; why: string }[] = [];
  let published = 0;
  for (const r of mine) {
    if (!aboutOneOf(accounts, r.subject) || retiredClaim(r.id)) continue;
    if (out.has(r.id)) {
      published++;
      continue;
    }
    const claim = JSON.parse(r.body) as Claim;
    const v = validateClaim(claim);
    if (v.ok) claims.push(claim);
    else kept.push({ claim, why: v.errors.map((e) => e.message).join('; ') });
  }
  const scored = await confidences(ctx, [...claims, ...kept.map((k) => k.claim)]);
  const c = found?.card ?? null;
  const drawn = await drawnReadings(ctx, owner, about, by, shared);
  published += drawn.theirs;
  const press = await pressOf(ctx, {
    owner,
    about,
    author: by,
    claims,
    readings: drawn.readings,
    ...(shared ? { shared } : {}),
  });
  published += press.carriedKept;
  const adds = [
    ...(drawn.readings.length
      ? [
          {
            layer: 'Readings',
            kind: 'drawn',
            label: 'Readings you drew',
            count: drawn.readings.length,
            goes: true,
          },
        ]
      : []),
    ...claimAdds(claims, true),
    ...claimAdds(
      kept.map((k) => k.claim),
      false,
      'they stay private: each says why',
    ),
    ...keptAdds(press.keptGoing, true),
    ...keptAdds(
      press.held.map((h) => h.doc),
      false,
      (d) => press.held.find((h) => h.doc === d)?.why ?? '',
    ),
  ];
  // what each layer adds to the map in front; a press over many maps doesn't ask
  const map = o.cases === false ? null : await mapNow(ctx, about);
  const layers = press.goes.map((d) => ({
    sha256: d.sha256,
    petal: d.petal,
    title: layerTitle(d.doc),
    cases: map ? pressCases(map, d.doc, by ?? '') : summed([]),
  }));
  return {
    about,
    name: c ? (c.name ?? c.mark?.name?.value ?? c.title) : await nameAt(ctx, about, shared),
    claims,
    readings: drawn.readings,
    rows: claims.map((x, i) => rowOf(x, scored.scores[i] ?? null)),
    private: kept.map((k, i) => ({
      ...rowOf(k.claim, scored.scores[claims.length + i] ?? null),
      why: k.why,
    })),
    published,
    adds,
    scored_by: scored.scored_by,
    ...(scored.unscored ? { unscored: scored.unscored } : {}),
    layers,
    totals: summed(layers.map((l) => l.cases)),
  };
}

/** What a prepared press holds until it's signed. */
interface Prepared {
  petal: typeof PRESS;
  owner: string;
  publication: Omit<Publication, 'proof'>;
  /** the text the wallet signs */
  text: string;
  nonce: string;
  recipient: string;
  expires_at: string;
  created_at: string;
  /** the claims and the views of the readings it publishes, for the map's Insights and the readings' credit */
  claims: string[];
  readings: string[];
  /** each claim's confidence as the person saw it, by its id, and the model that read it */
  confidence: Record<string, number | null>;
  scored_by: string | null;
}

/** One map's version in a press, as prepared: the publication and what goes with it, and the map's name. */
type Version = Pick<
  Prepared,
  'publication' | 'claims' | 'readings' | 'confidence' | 'scored_by'
> & {
  name: string;
};

/** A prepared press over many maps: the manifest, each map's version in its order, and the one text. */
interface PreparedMany {
  petal: typeof MANY;
  owner: string;
  manifest: Manifest;
  versions: Version[];
  text: string;
  nonce: string;
  recipient: string;
  expires_at: string;
  created_at: string;
}

/** How each chain's wallet signs the text (composition.md, section 2). */
const STANDARD: Record<string, Proof['standard']> = {
  near: 'nep413',
  eip155: 'eip191',
  solana: 'ed25519',
};
const standardOf = (author: string) => STANDARD[author.split(':')[0] ?? ''];

const refused = (message: string) =>
  new ToolFailure('unauthorised', message, 'Press Publish again and sign the new message.');

/** The person's own wallet that signs as `author` (CAIP-10), or a refusal. */
function walletOf(who: { authors: readonly string[] }, author: string): string {
  const mine = who.authors.find((a) => aboutKey(a) === aboutKey(author));
  if (!mine || !standardOf(mine))
    throw new ToolFailure(
      'unauthorised',
      `${author} isn't one of your wallets.`,
      'Publish with a wallet you signed in with or added on your profile.',
    );
  // the profile's master key is its NEAR account: it signs every publication (composition.md, section 2c)
  if (standardOf(mine) !== 'nep413')
    throw new ToolFailure(
      'unauthorised',
      "Publish with your NEAR account: your linked wallets' work is credited to it.",
      "Choose your NEAR account as the author, as /api/v1/me's wallets list it.",
    );
  return mine;
}

/**
 * One map's next version in this author's name: their line's layers and what this press adds, its parent and
 * previous as their line has them, the server's time. With nothing to add, why; but Petals' own signs the import's
 * version as it is (composition.md, section 2b).
 */
async function versionOf(
  ctx: ToolContext,
  owner: string,
  about: string,
  author: string,
  at: string,
  shared?: Shared,
): Promise<{ p: Publishable; version: Version } | { p: Publishable; why: string }> {
  const p = await publishable(ctx, owner, about, author, shared ? { shared, cases: false } : {});
  const line = await lineOf(ctx, p.about, author);
  // the profile's own account: a link disconnected since its last version leaves this one (composition.md, 2c)
  let drops = false;
  if (aboutKey(p.about) === aboutKey(author)) {
    const kept = new Set(
      (await keptDocs(ctx, owner, p.about, shared))
        .filter((d) => d.petal === LINK_VERSION)
        .map((d) => d.sha256),
    );
    const carried = line.carried.filter((l) => l.petal !== LINK_VERSION || kept.has(l.sha256));
    drops = carried.length !== line.carried.length;
    line.carried = carried;
  }
  if (!p.layers.length && !line.signsImport && !drops)
    return {
      p,
      why: p.private.length
        ? `Nothing you kept about ${p.name} can be published: ${p.private.length} stay private.`
        : `You have nothing about ${p.name} that isn't on the shared map already.`,
    };
  const carried = new Set(line.carried.map((l) => l.sha256));
  const publication: Omit<Publication, 'proof'> = {
    petal: PUBLICATION_VERSION,
    about: aboutKey(p.about),
    author,
    via: null,
    layers: [
      ...line.carried,
      ...p.layers
        .filter((l) => !carried.has(l.sha256))
        .map((l) => ({ sha256: l.sha256, petal: l.petal })),
    ],
    parent: line.parent,
    previous: line.latest?.hash ?? null,
    published_at: at,
  };
  return {
    p,
    version: {
      publication,
      name: p.name,
      claims: p.claims.map((c) => c.id),
      readings: p.readings.map((r) => r.id),
      confidence: Object.fromEntries(p.rows.map((r) => [r.id, r.confidence])),
      scored_by: p.scored_by,
    },
  };
}

/**
 * One press, first half: the unsigned publication/v1 in the name of one of the person's wallets (`authors`, each
 * CAIP-10): its layers are their latest version's and what this press adds, its parent and previous their latest
 * publication about the map, its time the server's. The answer is the publication, its unsigned hash, and the text
 * the wallet signs, which names that hash; for NEAR, this site as the recipient and a fresh nonce (NEP-413).
 */
export async function preparePublication(
  ctx: ToolContext,
  who: { owner: string; authors: readonly string[] },
  about: string,
  author: string,
  recipient: string,
) {
  const mine = walletOf(who, author);
  const v = await versionOf(ctx, who.owner, about, mine, ctx.now().toISOString());
  if (!('version' in v))
    throw new ToolFailure(
      'not_found',
      v.why,
      v.p.private[0] ? `Why: ${v.p.private[0].why}` : undefined,
    );
  const { name: _, ...version } = v.version;
  const { publication } = version;
  const sha256 = unsignedHash(publication);
  const text = signedText(publication, v.p.name);
  const { nonce, expires_at } = await nonceStore(ctx.config).issue();
  const prepared: Prepared = {
    petal: PRESS,
    owner: who.owner,
    ...version,
    text,
    nonce,
    recipient,
    expires_at,
    created_at: publication.published_at,
  };
  const store = privateStore(ctx.config);
  await store.tx(async () => {
    await store.publishDraft.deleteExpired(prepared.created_at);
    await store.publishDraft.put(sha256, JSON.stringify(prepared), expires_at);
  });
  return {
    publication,
    sha256,
    text,
    ...(standardOf(mine) === 'nep413' ? { recipient, nonce } : {}),
  };
}

/**
 * The maps where this author has something to publish: Petals' own maps for petals.near, the maps of what the
 * person kept in their projects and of the layers they kept, of the readings they drew, and of their claims not
 * yet published.
 */
async function mapsWith(
  ctx: ToolContext,
  owner: string,
  author: string,
  shared: Shared,
): Promise<string[]> {
  const index = await once(shared, 'index', () => mapIndex(ctx, { hidden: true }));
  const byKey = new Map(index.map((m) => [aboutKey(m.card.id), m.card.id]));
  // by address: a map's card id where it has one, else the address as kept (nothing is dropped here: a press that
  // can't publish one says so under left)
  const found = new Map<string, string>();
  const add = (about: string | null | undefined) => {
    if (!about) return;
    const key = aboutKey(about);
    if (!found.has(key)) found.set(key, byKey.get(key) ?? about);
  };
  if (author === PETALS_AUTHOR)
    for (const about of (await once(shared, 'holdings', () => petalsHoldings(ctx))).keys())
      add(about);
  for (const row of await projectDataOf(ctx, owner, shared)) add(row.about);
  for (const row of await privateStore(ctx.config).layer.list(owner)) add(row.about);
  const specs = await specsOf(ctx, owner, shared);
  if (specs.size)
    for (const v of await once(shared, 'views', () => mapViews(ctx, undefined, { hidden: true })))
      if (specs.has(v.sha)) add(v.map);
  const out = await publishedIds(ctx, shared);
  const waiting = (await annotationsOf(ctx, owner, shared)).filter(
    (r) => !out.has(r.id) && !retiredClaim(r.id),
  );
  if (waiting.length)
    for (const m of index) {
      if (found.has(aboutKey(m.card.id))) continue;
      const accounts = await cardAccounts(ctx, m.card);
      if (waiting.some((r) => aboutOneOf(accounts, r.subject))) add(m.card.id);
    }
  return [...found.values()].sort();
}

/** An address with no map card, in words: the name its own mark gives it, where Petals holds one; else the address. */
async function nameAt(ctx: ToolContext, about: string, shared?: Shared): Promise<string> {
  const held = (await once(shared, 'holdings', () => petalsHoldings(ctx))).get(aboutKey(about));
  for (const l of held?.layers ?? []) {
    if (!l.petal.startsWith('mark/')) continue;
    const name = (held?.docs.get(l.sha256) as { name?: { value?: unknown } } | undefined)?.name
      ?.value;
    if (typeof name === 'string' && name) return name;
  }
  return about;
}

/** One map's version as prepare answers it: its map, its name, its unsigned hash and the publication. */
const answerOf = (v: Version) => ({
  about: v.publication.about,
  name: v.name,
  sha256: unsignedHash(v.publication),
  publication: v.publication,
});

/**
 * One press over many maps, first half (composition.md, section 2b): each map's next version in the author's name,
 * as one press of that map would make it, all at the server's one time; the manifest that lists their unsigned
 * hashes in order; and the one text the wallet signs, which names the manifest. `maps` names the maps, or 'all':
 * every map where the author has something to publish. A map with nothing to add is left, with why.
 */
export async function preparePress(
  ctx: ToolContext,
  who: { owner: string; authors: readonly string[] },
  maps: readonly string[] | 'all',
  author: string,
  recipient: string,
  o: { dry?: boolean } = {},
) {
  const mine = walletOf(who, author);
  const shared: Shared = {};
  const at = ctx.now().toISOString();
  const seen = new Set<string>();
  const wanted = (maps === 'all' ? await mapsWith(ctx, who.owner, mine, shared) : maps).filter(
    (m) => !seen.has(aboutKey(m)) && !!seen.add(aboutKey(m)),
  );
  const versions: Version[] = [];
  const left: { about: string; why: string }[] = [];
  for (const about of wanted) {
    try {
      const v = await versionOf(ctx, who.owner, about, mine, at, shared);
      if ('version' in v) versions.push(v.version);
      else left.push({ about, why: v.why });
    } catch (e) {
      if (!(e instanceof ToolFailure) || e.code !== 'not_found') throw e;
      left.push({ about, why: e.message });
    }
  }
  // a dry run with nothing to press says so, with everything it left and why
  if (!versions.length && o.dry)
    return { manifest: null, sha256: null, text: null, publications: [], left };
  if (!versions.length)
    throw new ToolFailure(
      'not_found',
      wanted.length
        ? `Nothing on these ${wanted.length === 1 ? 'map' : `${wanted.length} maps`} can be published that isn't on the shared map already.`
        : 'You have nothing to publish that isn’t on the shared map already.',
      left[0] ? `Why: ${left[0].why}` : undefined,
    );
  const manifest: Manifest = {
    petal: MANIFEST_VERSION,
    author: mine,
    publications: versions.map((v) => unsignedHash(v.publication)),
    published_at: at,
  };
  const sha256 = manifestHash(manifest);
  const text = manifestText(manifest);
  // a dry run says what the press would be, and keeps nothing: no nonce, no draft
  if (o.dry) return { manifest, sha256, text, publications: versions.map(answerOf), left };
  const { nonce, expires_at } = await nonceStore(ctx.config).issue();
  const prepared: PreparedMany = {
    petal: MANY,
    owner: who.owner,
    manifest,
    versions,
    text,
    nonce,
    recipient,
    expires_at,
    created_at: at,
  };
  const store = privateStore(ctx.config);
  await store.tx(async () => {
    await store.publishDraft.deleteExpired(at);
    await store.publishDraft.put(sha256, JSON.stringify(prepared), expires_at);
  });
  return {
    manifest,
    sha256,
    text,
    publications: versions.map(answerOf),
    left,
    ...(standardOf(mine) === 'nep413' ? { recipient, nonce } : {}),
  };
}

/** A wallet's signature of the text, as its chain signs it (composition.md, section 9). */
export interface PressProof {
  standard: Proof['standard'];
  signature: string;
  public_key?: string;
  nonce?: string;
}

/** Checks that the author's wallet signed this text: NEP-413 on its network, EIP-191 or ed25519. */
export type SignatureCheck = (o: {
  author: string;
  proof: PressProof;
  text: string;
  recipient: string;
}) => Promise<{ ok: boolean; reason?: string }>;

/** A prepared draft, read for the person who prepared it, still open: or a refusal that says why. */
async function draftFor<T extends { petal: string; owner: string; expires_at: string }>(
  ctx: ToolContext,
  who: { owner: string },
  sha256: string,
  petal: string,
): Promise<T> {
  const row = await privateStore(ctx.config).publishDraft.get(sha256);
  const prepared = row ? (JSON.parse(row.body) as T) : null;
  if (!row || prepared?.petal !== petal)
    throw new ToolFailure('not_found', `Nothing was prepared to publish under ${sha256}.`);
  if (row.used_at) throw refused('This was already published.');
  if (prepared.owner !== who.owner) throw refused('Someone else prepared this.');
  if (ctx.now().getTime() > Date.parse(prepared.expires_at)) throw refused('The message expired.');
  return prepared;
}

/** The proof as the wallet gave it, checked against how the author's chain signs and the nonce given. */
function proofFits(author: string, proof: PressProof, nonce: string): Proof['standard'] {
  const standard = standardOf(author);
  if (!proof || typeof proof.signature !== 'string' || proof.standard !== standard)
    throw refused(`${author.split(':')[0]} wallets sign this with ${standard}.`);
  if (standard === 'nep413' && proof.nonce !== nonce)
    throw refused('The signature is for another message.');
  return standard as Proof['standard'];
}

/** The author's wallet signed the text, or a refusal; an unreachable chain publishes nothing. */
async function signedBy(check: SignatureCheck, o: Parameters<SignatureCheck>[0]) {
  let signed: { ok: boolean; reason?: string };
  try {
    signed = await check(o);
  } catch {
    throw new ToolFailure(
      'source_failed',
      "Couldn't reach the chain to check the signature, so nothing was published. Try again.",
    );
  }
  if (!signed.ok) throw refused(`The signature was refused: ${signed.reason ?? 'not valid'}.`);
}

/**
 * The documents of the layers a version adds over the ones it carries, as they're kept now: the person's claims,
 * what they kept, what Petals holds (for petals.near), a reading's snapshot. A refusal when one is gone.
 */
async function addedDocs(
  ctx: ToolContext,
  owner: string,
  p: Omit<Publication, 'proof'>,
  carried: Publication['layers'],
  shared?: Shared,
) {
  const before = new Set(carried.map((l) => l.sha256));
  const adds = p.layers.filter((l) => !before.has(l.sha256));
  const want = new Set(adds.map((l) => l.sha256));
  const docs = new Map<string, unknown>();
  for (const r of await annotationsOf(ctx, owner, shared)) {
    const c = JSON.parse(r.body) as Claim;
    if (want.has(hashOf(c))) docs.set(hashOf(c), c);
  }
  for (const d of await keptDocs(ctx, owner, p.about, shared))
    if (want.has(d.sha256)) docs.set(d.sha256, d.doc);
  if (p.author === PETALS_AUTHOR) {
    const held = (await once(shared, 'holdings', () => petalsHoldings(ctx))).get(aboutKey(p.about));
    for (const l of held?.layers ?? [])
      if (want.has(l.sha256) && !docs.has(l.sha256)) docs.set(l.sha256, held?.docs.get(l.sha256));
  }
  for (const l of adds)
    if (!docs.has(l.sha256) && l.petal.startsWith('snapshot/')) {
      const s = await findSnapshot(ctx, l.sha256);
      if (s) docs.set(l.sha256, s);
    }
  if (adds.some((l) => docs.get(l.sha256) === undefined))
    throw refused('What you kept about this map changed since this was prepared.');
  return { adds, docs };
}

/** The claims a version publishes, as kept, and the qualifier's outcome for each as the person saw it. */
async function claimsOf(
  ctx: ToolContext,
  owner: string,
  v: Pick<Prepared, 'claims' | 'confidence'>,
  want: ReadonlySet<string>,
  shared?: Shared,
) {
  const chosen = new Set(v.claims);
  const claims = (await annotationsOf(ctx, owner, shared))
    .filter((r) => chosen.has(r.id))
    .map((r) => JSON.parse(r.body) as Claim)
    .filter((c) => validateClaim(c).ok);
  const scores: Record<string, number> = {};
  for (const c of claims) {
    const s = v.confidence[c.id];
    if (typeof s === 'number' && want.has(hashOf(c))) scores[hashOf(c)] = s;
  }
  return { claims, scores };
}

/** A version's documents to keep in the record: every one but a reading's (that stays in the snapshot store). */
const bodiesOf = (docs: ReadonlyMap<string, unknown>) =>
  new Map([...docs].filter(([, d]) => !(d as { petal?: string }).petal?.startsWith('snapshot/')));

/**
 * After a version is in the record: the map's Insights show its claims at once, each with the signature that
 * published it, and the readings the person drew are credited to the author.
 */
async function afterAppend(
  ctx: ToolContext,
  o: {
    owner: string;
    version: Pick<Prepared, 'publication' | 'readings' | 'confidence' | 'scored_by'>;
    claims: readonly Claim[];
    entry: Entry;
    proof: Proof;
    at: string;
  },
) {
  const store = privateStore(ctx.config);
  await store.annotation.add(
    o.claims.map((c, place) => ({
      owner: PUBLISHED,
      id: c.id,
      exploration: `published:${o.entry.hash}`,
      subject: c.subject,
      verb: c.verb,
      kind: c.kind,
      body: JSON.stringify(c),
      credential: JSON.stringify({
        publication: o.entry.hash,
        proof: o.proof,
        confidence: o.version.confidence[c.id] ?? null,
        scored_by: o.version.scored_by,
      }),
      created_at: o.at,
      place,
    })),
  );
  // a view no one was credited with since the press was prepared
  for (const sha of o.version.readings) {
    const view = await store.draft.get(sha);
    if (view && !view.made_by)
      await store.draft.label(sha, {
        name: view.name ?? null,
        made_by: o.version.publication.author,
      });
  }
}

/**
 * One press, second half: the signature checked, the publication goes in the record with its proof, at the
 * server's place in it. The map's claims show at once as before (Insights, each kept with its signature and the
 * confidence the person saw) and the readings they drew are credited to them.
 */
export async function publishPublication(
  ctx: ToolContext,
  who: { owner: string },
  sha256: string,
  proof: PressProof,
  check: SignatureCheck,
) {
  const prepared = await draftFor<Prepared>(ctx, who, sha256, PRESS);
  const p = prepared.publication;
  const standard = proofFits(p.author, proof, prepared.nonce);
  if (!textNames(prepared.text, { ...p, proof: null }))
    throw refused('The text signed names another publication.');
  // the author's record is a chain nobody can cut: their latest is still the one this version follows
  const line = await lineOf(ctx, p.about, p.author);
  if ((line.latest?.hash ?? null) !== p.previous)
    throw refused('You published on this map since this was prepared.');
  await signedBy(check, {
    author: p.author,
    proof,
    text: prepared.text,
    recipient: prepared.recipient,
  });
  const { adds, docs } = await addedDocs(ctx, who.owner, p, line.carried);
  const map = await mapNow(ctx, p.about);
  const totals = summed(adds.map((l) => pressCases(map, docs.get(l.sha256), p.author)));
  const at = ctx.now().toISOString();
  const store = privateStore(ctx.config);
  if (!(await store.publishDraft.claim(sha256, at))) throw refused('This was already published.');
  const publication: Publication = {
    ...p,
    proof: {
      standard,
      signature: proof.signature,
      message: prepared.text,
      ...(proof.public_key ? { public_key: proof.public_key } : {}),
      ...(standard === 'nep413' ? { nonce: prepared.nonce, recipient: prepared.recipient } : {}),
    },
  };
  const { claims, scores } = await claimsOf(ctx, who.owner, prepared, new Set(docs.keys()));
  const entry = await appendPublication(ctx, publication, bodiesOf(docs), scores);
  await afterAppend(ctx, {
    owner: who.owner,
    version: prepared,
    claims,
    entry,
    proof: publication.proof as Proof,
    at,
  });
  return {
    publication: entry.hash,
    layers: adds.map((l) => ({ sha256: l.sha256, petal: l.petal })),
    totals,
  };
}

/**
 * One press over many maps, second half (composition.md, section 2b): the one signature checked once, over the text
 * that names the manifest; the manifest lists exactly the publications prepared; then the manifest and every
 * publication go in the record in one transaction, all or none, each at its own place in the manifest's order, each
 * proof the one signature plus the manifest's hash. Each map's claims and readings follow as for one press.
 */
export async function publishPress(
  ctx: ToolContext,
  who: { owner: string },
  sha256: string,
  proof: PressProof,
  check: SignatureCheck,
) {
  const prepared = await draftFor<PreparedMany>(ctx, who, sha256, MANY);
  const m = prepared.manifest;
  const standard = proofFits(m.author, proof, prepared.nonce);
  if (
    manifestHash(m) !== sha256 ||
    !textNamesManifest(prepared.text, m) ||
    m.publications.join() !== prepared.versions.map((v) => unsignedHash(v.publication)).join()
  )
    throw refused('The text signed names another press.');
  const lines: Line[] = [];
  for (const v of prepared.versions) {
    const line = await lineOf(ctx, v.publication.about, m.author);
    if ((line.latest?.hash ?? null) !== v.publication.previous)
      throw refused(`You published on ${v.name} since this was prepared.`);
    lines.push(line);
  }
  await signedBy(check, {
    author: m.author,
    proof,
    text: prepared.text,
    recipient: prepared.recipient,
  });
  const shared: Shared = {};
  const items: {
    v: Version;
    adds: Publication['layers'];
    docs: Map<string, unknown>;
    claims: Claim[];
    scores: Record<string, number>;
  }[] = [];
  for (const [i, v] of prepared.versions.entries()) {
    const { adds, docs } = await addedDocs(
      ctx,
      who.owner,
      v.publication,
      lines[i]?.carried ?? [],
      shared,
    );
    const { claims, scores } = await claimsOf(ctx, who.owner, v, new Set(docs.keys()), shared);
    items.push({ v, adds, docs, claims, scores });
  }
  const at = ctx.now().toISOString();
  const store = privateStore(ctx.config);
  if (!(await store.publishDraft.claim(sha256, at))) throw refused('This was already published.');
  const signed: Proof = {
    standard,
    signature: proof.signature,
    message: prepared.text,
    ...(proof.public_key ? { public_key: proof.public_key } : {}),
    ...(standard === 'nep413' ? { nonce: prepared.nonce, recipient: prepared.recipient } : {}),
    manifest: sha256,
  };
  const entries = await appendPress(
    ctx,
    m,
    items.map((x) => ({
      publication: { ...x.v.publication, proof: signed },
      bodies: bodiesOf(x.docs),
      scores: x.scores,
    })),
  );
  for (const [i, x] of items.entries())
    await afterAppend(ctx, {
      owner: who.owner,
      version: x.v,
      claims: x.claims,
      entry: entries[i] as Entry,
      proof: signed,
      at,
    });
  return {
    manifest: sha256,
    publications: entries.map((e, i) => ({
      about: e.publication.about,
      publication: e.hash,
      layers: (items[i]?.adds ?? []).map((l) => ({ sha256: l.sha256, petal: l.petal })),
    })),
  };
}

/** The second half of whichever press was prepared under this hash: one map's, or a press over many. */
export async function publishPrepared(
  ctx: ToolContext,
  who: { owner: string },
  sha256: string,
  proof: PressProof,
  check: SignatureCheck,
) {
  const row = await privateStore(ctx.config).publishDraft.get(sha256);
  const petal = row ? (JSON.parse(row.body) as { petal?: string }).petal : null;
  return petal === MANY
    ? publishPress(ctx, who, sha256, proof, check)
    : publishPublication(ctx, who, sha256, proof, check);
}
