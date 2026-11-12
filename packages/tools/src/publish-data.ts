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
import { canonicalJson, sha256Hex, validateClaim } from '@petal/core';
import type { Claim, ClaimEvidence, Nep413Proof } from '@petal/core/types';
import { nonceStore, privateStore } from './drafts.ts';
import { ToolFailure } from './errors.ts';
import { retiredClaim } from './hidden.ts';
import { aboutOneOf, cardAccounts, PUBLISHED } from './mapping-claims.ts';
import { SEARCH_RERANKER, SearchModelDown } from './search-model.ts';
import { mapIndex, mapUrl } from './tools/maps.ts';
import { searchModelOf } from './tools/search-petals.ts';
import type { ToolContext } from './types.ts';

export { PUBLISHED };

const VERSION = 'publish-data/v1';

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

/** What one press would publish on a map, and what stays private. */
export interface Publishable {
  about: string;
  name: string;
  claims: Claim[];
  /** the claims, one row each, in the order they'd go */
  rows: PublishRow[];
  private: StaysPrivate[];
  /** of what they kept about it, how many are already on the shared map */
  published: number;
  /** the model that read the confidences, or null */
  scored_by: string | null;
  /** why nothing was scored, when nothing was */
  unscored?: string;
}

/** What a prepared publish holds until it's signed. */
interface Prepared {
  petal: typeof VERSION;
  about: string;
  owner: string;
  by: string;
  claims: string[];
  /** each claim's confidence as the person saw it, by its id, and the model that read it */
  confidence?: Record<string, number | null>;
  scored_by?: string | null;
  message: string;
  nonce: string;
  recipient: string;
  expires_at: string;
  created_at: string;
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

/** How the claim reads as a question to the reranker: does its evidence say this? */
const statementOf = (c: Claim) =>
  c.verb === 'named' ? `This account is named ${wordsOf(c)}` : `${c.verb}: ${wordsOf(c)}`;

/** The evidence's own words, each piece one document. */
const evidenceTexts = (c: Claim) =>
  c.evidence
    .map((e) => [e.quote, e.note].filter(Boolean).join('\n'))
    .filter((t) => t.trim().length > 0);

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
      const docs = evidenceTexts(c);
      scores.push(
        docs.length
          ? Math.round(Math.max(...(await model.rerank(statementOf(c), docs))) * 100) / 100
          : null,
      );
    }
    return { scores, scored_by: ctx.config.fake ? 'fake-words' : SEARCH_RERANKER };
  } catch (e) {
    if (e instanceof SearchModelDown)
      return { scores: nulls, scored_by: null, unscored: e.message };
    throw e;
  }
}

const rowOf = (c: Claim, confidence: number | null): PublishRow => ({
  id: c.id,
  subject: c.subject,
  verb: c.verb,
  name: wordsOf(c),
  source: sourceOf(c),
  confidence,
});

/** The account a `by` names: near:mainnet:alice.near → alice.near. */
const accountOf = (by: string) => by.slice(by.lastIndexOf(':') + 1);

/**
 * What the person (owner, the session's subject) kept about this map in their projects: the claims about its
 * accounts that can be published now, and those the people rule keeps private, with why.
 */
export async function publishable(
  ctx: ToolContext,
  owner: string,
  about: string,
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
  return {
    about,
    name: c.name ?? c.mark?.name?.value ?? c.title,
    claims,
    rows: claims.map((x, i) => rowOf(x, scored.scores[i] ?? null)),
    private: kept.map((k, i) => ({
      ...rowOf(k.claim, scored.scores[claims.length + i] ?? null),
      why: k.why,
    })),
    published,
    scored_by: scored.scored_by,
    ...(scored.unscored ? { unscored: scored.unscored } : {}),
  };
}

/** The hash a publish signs: the map, the person, and the claims, by their ids. */
const hashOf = (about: string, by: string, ids: readonly string[]) =>
  sha256Hex(canonicalJson({ petal: VERSION, about, by, claims: [...ids].sort() }));

/**
 * One press, first half: what goes, and the message the person's wallet signs for it (recipient: this site, as
 * signing in names it). Nothing is published until publishData has the signature.
 */
export async function preparePublishData(
  ctx: ToolContext,
  who: { owner: string; by: string },
  about: string,
  recipient: string,
) {
  const p = await publishable(ctx, who.owner, about);
  if (!p.claims.length)
    throw new ToolFailure(
      'not_found',
      p.private.length
        ? `Nothing you kept about ${p.name} can be published: ${p.private.length} stay private.`
        : `You have nothing about ${p.name} that isn't on the shared map already.`,
      p.private[0] ? `Why: ${p.private[0].why}` : undefined,
    );
  const ids = p.claims.map((c) => c.id);
  const sha256 = hashOf(about, who.by, ids);
  const message = JSON.stringify({ petal: VERSION, about, claims: ids.length, sha256 });
  const { nonce, expires_at } = await nonceStore(ctx.config).issue();
  const prepared: Prepared = {
    petal: VERSION,
    about,
    owner: who.owner,
    by: who.by,
    claims: ids,
    confidence: Object.fromEntries(p.rows.map((r) => [r.id, r.confidence])),
    scored_by: p.scored_by,
    message,
    nonce,
    recipient,
    expires_at,
    created_at: ctx.now().toISOString(),
  };
  const store = privateStore(ctx.config);
  await store.tx(async () => {
    await store.publishDraft.deleteExpired(prepared.created_at);
    await store.publishDraft.put(sha256, JSON.stringify(prepared), expires_at);
  });
  return {
    sha256,
    about,
    name: p.name,
    claims: ids.length,
    private: p.private.length,
    message,
    nonce,
    recipient,
    expires_at,
  };
}

const refused = (message: string) =>
  new ToolFailure('unauthorised', message, 'Press Publish again and sign the new message.');

/**
 * One press, second half: the signature checked, the claims land on the shared map at once, each kept with the
 * signed message and signature that published it. `verify` checks a NEP-413 proof on the person's network.
 */
export async function publishData(
  ctx: ToolContext,
  who: { owner: string; by: string },
  sha256: string,
  proof: Nep413Proof,
  verify: (
    proof: Nep413Proof,
    expect: { message: string; recipient: string },
  ) => Promise<{ ok: boolean; reason?: string }>,
) {
  const store = privateStore(ctx.config);
  const row = await store.publishDraft.get(sha256);
  const prepared = row ? (JSON.parse(row.body) as Prepared) : null;
  if (!row || prepared?.petal !== VERSION)
    throw new ToolFailure('not_found', `Nothing was prepared to publish under ${sha256}.`);
  if (row.used_at) throw refused('This was already published.');
  if (prepared.owner !== who.owner) throw refused('Someone else prepared this.');
  if (ctx.now().getTime() > Date.parse(prepared.expires_at)) throw refused('The message expired.');
  if (
    proof?.nonce !== prepared.nonce ||
    proof.message !== prepared.message ||
    proof.recipient !== prepared.recipient
  )
    throw refused('The signature is for another message.');
  if (proof.account_id !== accountOf(who.by))
    throw refused(`Sign with the wallet you signed in with, ${accountOf(who.by)}.`);
  let check: { ok: boolean; reason?: string };
  try {
    check = await verify(proof, { message: prepared.message, recipient: prepared.recipient });
  } catch {
    throw new ToolFailure(
      'source_failed',
      "Couldn't reach NEAR to check the signature, so nothing was published. Try again.",
    );
  }
  if (!check.ok) throw refused(`The signature was refused: ${check.reason ?? 'not valid'}.`);
  const at = ctx.now().toISOString();
  if (!(await store.publishDraft.claim(sha256, at))) throw refused('This was already published.');
  // the claims as kept, by their ids (an id is its content's hash), checked again as published ones
  const want = new Set(prepared.claims);
  const claims = (await store.annotation.list(who.owner))
    .filter((r) => want.has(r.id))
    .map((r) => JSON.parse(r.body) as Claim)
    .filter((c) => validateClaim(c).ok);
  // each kept with the signature that published it, and the confidence the person saw before the press
  const added = await store.annotation.add(
    claims.map((c, place) => ({
      owner: PUBLISHED,
      id: c.id,
      exploration: `published:${sha256}`,
      subject: c.subject,
      verb: c.verb,
      kind: c.kind,
      body: JSON.stringify(c),
      credential: JSON.stringify({
        proof,
        confidence: prepared.confidence?.[c.id] ?? null,
        scored_by: prepared.scored_by ?? null,
      }),
      created_at: at,
      place,
    })),
  );
  return {
    about: prepared.about,
    sha256,
    published: added,
    by: who.by,
    map_url: mapUrl(ctx, prepared.about),
  };
}
