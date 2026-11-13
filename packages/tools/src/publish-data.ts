// Publishing to the shared map (Elco, 12 Nov: "we need this live soon, it's a big part of my test"; META's go on
// SYSTEMS's lean): what a person kept about a map in their projects goes to everyone's Power Map with one press,
// signed by their wallet (NEP-413, as signing in: no transaction, nothing spent), at once, credited to them.
// Their claims join the map's Insights beside Petals' own mapping's, each saying who answers for it; the signed
// message and its signature are kept with each, so anyone can check them. What the people rule keeps private
// (people.ts) stays in their project, and says why.
//
// The qualifier (Elco, 12 Nov: "Build it"; "Let me look first"): each item, one per row, with its name, address,
// source and a confidence before the press. A veto is the claim rules (validateClaim, people.ts): what fails them
// stays private and says why. The confidence is how strongly the claim's own evidence says it, read by search's
// reranker on Elco's Mac (Qwen3-Reranker, search-model.ts): nothing new runs and nothing is spent. With the model
// off, confidence is null and says so; it never holds a publish back.
import {
  aboutKey,
  type Cases,
  type Composition,
  canonicalJson,
  casesOf,
  compose,
  type Entry,
  layerTitle,
  type Proof,
  PUBLICATION_VERSION,
  type Publication,
  type State,
  sameAbout,
  sha256Hex,
  signedText,
  stateKey,
  textNames,
  unsignedHash,
  validateClaim,
} from '@petal/core';
import type { Claim, ClaimEvidence, Spec } from '@petal/core/types';
import { nonceStore, privateStore } from './drafts.ts';
import { ToolFailure } from './errors.ts';
import { retiredClaim } from './hidden.ts';
import { mapViews } from './map.ts';
import { aboutOneOf, cardAccounts, PUBLISHED } from './mapping-claims.ts';
import { appendPublication, authorName, compositionOf, recordOf } from './record.ts';
import { SEARCH_RERANKER, SearchModelDown } from './search-model.ts';
import { mapIndex } from './tools/maps.ts';
import { searchModelOf } from './tools/search-petals.ts';
import { findSnapshot } from './tools/shared.ts';
import type { ToolContext } from './types.ts';

export { PUBLISHED };

/** What a prepared press holds until it's signed: a publication/v1, unsigned (composition.md, section 2). */
const PRESS = 'press/publication-v1';

/** Where an item's word comes from: a proposal or a transaction it rests on (or, kept private, what else). */
export interface RowSource {
  kind: string;
  /** the proposal's or the transaction's ref, else the address it was read at */
  ref: string | null;
  quote?: string;
  url?: string;
}

/** One item, as the person reads it before the press (WORKSPACE's rows, 12 Nov). */
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
 * What one press adds to the map, by layer and kind (Elco, 12 Nov: "a clear indicator of what data layers and
 * claims I would be adding"): goes, what the press publishes; else why it can't go yet.
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

/** A reading the person drew of the map, as the box lists it (WORKSPACE, wave 7). */
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
  /** the readings they drew of it that no one is credited with yet, credited to them by the press (#16, wave 7) */
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
 * proposal names Dekan"); anything else in its own words. Measured on Elco's 68 names (12 Nov, read only): this
 * phrasing put 2 under 0.3 where "This account is named Dekan" put 6, the record's quote unchanged.
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
  try {
    const scores: (number | null)[] = [];
    for (const c of claims) {
      // the best piece's reading: one record that says it is enough
      let best: number | null = null;
      for (const e of c.evidence) {
        const docs = wordsIn(e);
        if (!docs.length) continue;
        const read = Math.max(...(await model.rerank(statementOf(c, e), docs)));
        best = best === null ? read : Math.max(best, read);
      }
      scores.push(best === null ? null : Math.round(best * 100) / 100);
    }
    return { scores, scored_by: ctx.config.fake ? 'fake-words' : SEARCH_RERANKER };
  } catch (e) {
    if (e instanceof SearchModelDown)
      return { scores: nulls, scored_by: null, unscored: e.message };
    throw e;
  }
}

/** Each verb as the box names it (WORKSPACE's 'Insights · Names · 35'). */
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
): Promise<{ readings: ReadingRow[]; theirs: number }> {
  const store = privateStore(ctx.config);
  const specs = new Set<string>();
  for (const project of await store.exploration.listByOwner(owner, Number.MAX_SAFE_INTEGER))
    for (const step of await store.step.list(project.id))
      if (step.spec_sha256) specs.add(step.spec_sha256);
  if (!specs.size) return { readings: [], theirs: 0 };
  const views = (await mapViews(ctx, undefined, { hidden: true })).filter(
    (v) => v.map === about && specs.has(v.sha),
  );
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
async function keptDocs(ctx: ToolContext, owner: string, about: string): Promise<PressDoc[]> {
  const store = privateStore(ctx.config);
  const out = new Map<string, PressDoc>();
  for (const project of await store.exploration.listByOwner(owner, Number.MAX_SAFE_INTEGER))
    for (const row of await store.projectData.list(owner, project.id)) {
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

/** This author's latest publication about the map, or null for a first. */
async function latestBy(ctx: ToolContext, about: string, author: string): Promise<Entry | null> {
  return (await recordOf(ctx, about)).filter((e) => e.publication.author === author).at(-1) ?? null;
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
  },
) {
  const latest = o.author ? await latestBy(ctx, o.about, o.author) : null;
  const carried = new Set(latest?.publication.layers.map((l) => l.sha256) ?? []);
  const kept = await keptDocs(ctx, o.owner, o.about);
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
): Promise<Publishable> {
  const found = (await mapIndex(ctx, { hidden: true })).find((m) => m.card.id === about);
  if (!found)
    throw new ToolFailure(
      'not_found',
      `No map on the Power Map has the address ${about}.`,
      "look_up with its name or address gives each map's id.",
    );
  const accounts = await cardAccounts(ctx, found.card);
  const store = privateStore(ctx.config);
  const out = new Set((await store.annotation.list(PUBLISHED)).map((r) => r.id));
  const claims: Claim[] = [];
  const kept: { claim: Claim; why: string }[] = [];
  let published = 0;
  for (const r of await store.annotation.list(owner)) {
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
  const c = found.card;
  const drawn = await drawnReadings(ctx, owner, about, by);
  published += drawn.theirs;
  const press = await pressOf(ctx, {
    owner,
    about,
    author: by,
    claims,
    readings: drawn.readings,
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
  const map = await mapNow(ctx, about);
  const layers = press.goes.map((d) => ({
    sha256: d.sha256,
    petal: d.petal,
    title: layerTitle(d.doc),
    cases: pressCases(map, d.doc, by ?? ''),
  }));
  return {
    about,
    name: c.name ?? c.mark?.name?.value ?? c.title,
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

/** How each chain's wallet signs the text (composition.md, section 2). */
const STANDARD: Record<string, Proof['standard']> = {
  near: 'nep413',
  eip155: 'eip191',
  solana: 'ed25519',
};
const standardOf = (author: string) => STANDARD[author.split(':')[0] ?? ''];

const refused = (message: string) =>
  new ToolFailure('unauthorised', message, 'Press Publish again and sign the new message.');

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
  const mine = who.authors.find((a) => aboutKey(a) === aboutKey(author));
  if (!mine || !standardOf(mine))
    throw new ToolFailure(
      'unauthorised',
      `${author} isn't one of your wallets.`,
      'Publish with a wallet you signed in with or added on your profile.',
    );
  const p = await publishable(ctx, who.owner, about, mine);
  if (!p.layers.length)
    throw new ToolFailure(
      'not_found',
      p.private.length
        ? `Nothing you kept about ${p.name} can be published: ${p.private.length} stay private.`
        : `You have nothing about ${p.name} that isn't on the shared map already.`,
      p.private[0] ? `Why: ${p.private[0].why}` : undefined,
    );
  const latest = await latestBy(ctx, about, mine);
  const publication: Omit<Publication, 'proof'> = {
    petal: PUBLICATION_VERSION,
    about: aboutKey(p.about),
    author: mine,
    via: null,
    layers: [
      ...(latest?.publication.layers ?? []),
      ...p.layers.map((l) => ({ sha256: l.sha256, petal: l.petal })),
    ],
    parent: latest?.hash ?? null,
    previous: latest?.hash ?? null,
    published_at: ctx.now().toISOString(),
  };
  const sha256 = unsignedHash(publication);
  const text = signedText(publication, p.name);
  const { nonce, expires_at } = await nonceStore(ctx.config).issue();
  const prepared: Prepared = {
    petal: PRESS,
    owner: who.owner,
    publication,
    text,
    nonce,
    recipient,
    expires_at,
    created_at: publication.published_at,
    claims: p.claims.map((c) => c.id),
    readings: p.readings.map((r) => r.id),
    confidence: Object.fromEntries(p.rows.map((r) => [r.id, r.confidence])),
    scored_by: p.scored_by,
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
  const store = privateStore(ctx.config);
  const row = await store.publishDraft.get(sha256);
  const prepared = row ? (JSON.parse(row.body) as Prepared) : null;
  if (!row || prepared?.petal !== PRESS)
    throw new ToolFailure('not_found', `Nothing was prepared to publish under ${sha256}.`);
  if (row.used_at) throw refused('This was already published.');
  if (prepared.owner !== who.owner) throw refused('Someone else prepared this.');
  if (ctx.now().getTime() > Date.parse(prepared.expires_at)) throw refused('The message expired.');
  const p = prepared.publication;
  const standard = standardOf(p.author);
  if (!proof || typeof proof.signature !== 'string' || proof.standard !== standard)
    throw refused(`${p.author.split(':')[0]} wallets sign this with ${standard}.`);
  if (standard === 'nep413' && proof.nonce !== prepared.nonce)
    throw refused('The signature is for another message.');
  if (!textNames(prepared.text, { ...p, proof: null }))
    throw refused('The text signed names another publication.');
  // the author's record is a chain nobody can cut: their latest is still the one this version follows
  const latest = await latestBy(ctx, p.about, p.author);
  if ((latest?.hash ?? null) !== p.previous)
    throw refused('You published on this map since this was prepared.');
  let signed: { ok: boolean; reason?: string };
  try {
    signed = await check({
      author: p.author,
      proof,
      text: prepared.text,
      recipient: prepared.recipient,
    });
  } catch {
    throw new ToolFailure(
      'source_failed',
      "Couldn't reach the chain to check the signature, so nothing was published. Try again.",
    );
  }
  if (!signed.ok) throw refused(`The signature was refused: ${signed.reason ?? 'not valid'}.`);
  // the documents of the layers this press adds, as they're kept now
  const before = new Set(latest?.publication.layers.map((l) => l.sha256) ?? []);
  const adds = p.layers.filter((l) => !before.has(l.sha256));
  const docs = new Map<string, unknown>();
  const want = new Set(adds.map((l) => l.sha256));
  for (const r of await store.annotation.list(who.owner)) {
    const c = JSON.parse(r.body) as Claim;
    if (want.has(hashOf(c))) docs.set(hashOf(c), c);
  }
  for (const d of await keptDocs(ctx, who.owner, p.about))
    if (want.has(d.sha256)) docs.set(d.sha256, d.doc);
  for (const l of adds)
    if (!docs.has(l.sha256) && l.petal.startsWith('snapshot/')) {
      const s = await findSnapshot(ctx, l.sha256);
      if (s) docs.set(l.sha256, s);
    }
  if (adds.some((l) => !docs.has(l.sha256)))
    throw refused('What you kept about this map changed since this was prepared.');
  const map = await mapNow(ctx, p.about);
  const totals = summed(adds.map((l) => pressCases(map, docs.get(l.sha256), p.author)));
  const at = ctx.now().toISOString();
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
  // the qualifier's outcome for each claim, as the person saw it, recorded with the layer
  const chosen = new Set(prepared.claims);
  const claims = (await store.annotation.list(who.owner))
    .filter((r) => chosen.has(r.id))
    .map((r) => JSON.parse(r.body) as Claim)
    .filter((c) => validateClaim(c).ok);
  const scores: Record<string, number> = {};
  for (const c of claims) {
    const s = prepared.confidence[c.id];
    if (typeof s === 'number' && want.has(hashOf(c))) scores[hashOf(c)] = s;
  }
  const bodies = new Map(
    [...docs].filter(([, d]) => !(d as { petal?: string }).petal?.startsWith('snapshot/')),
  );
  const entry = await appendPublication(ctx, publication, bodies, scores);
  // the map's Insights show the claims at once, each with the signature that published it
  await store.annotation.add(
    claims.map((c, place) => ({
      owner: PUBLISHED,
      id: c.id,
      exploration: `published:${entry.hash}`,
      subject: c.subject,
      verb: c.verb,
      kind: c.kind,
      body: JSON.stringify(c),
      credential: JSON.stringify({
        publication: entry.hash,
        proof: publication.proof,
        confidence: prepared.confidence[c.id] ?? null,
        scored_by: prepared.scored_by,
      }),
      created_at: at,
      place,
    })),
  );
  // the readings they drew, credited to them: a view no one was credited with since the press was prepared
  for (const sha of prepared.readings) {
    const view = await store.draft.get(sha);
    if (view && !view.made_by)
      await store.draft.label(sha, { name: view.name ?? null, made_by: p.author });
  }
  return {
    publication: entry.hash,
    layers: adds.map((l) => ({ sha256: l.sha256, petal: l.petal })),
    totals,
  };
}
