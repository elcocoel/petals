// Publishing to the shared map (Elco, 12 Nov: "we need this live soon, it's a big part of my test"; META's go on
// SYSTEMS's lean): what a person kept about a map in their projects goes to everyone's Power Map with one press,
// signed by their wallet (NEP-413, as signing in: no transaction, nothing spent), at once, credited to them.
// Their claims join the map's Insights beside Petals' own mapping's, each saying who answers for it; the signed
// message and its signature are kept with each, so anyone can check them. What the people rule keeps private
// (people.ts) stays in their project, and says why.
import { canonicalJson, sha256Hex, validateClaim } from '@petal/core';
import type { Claim, Nep413Proof } from '@petal/core/types';
import { nonceStore, privateStore } from './drafts.ts';
import { ToolFailure } from './errors.ts';
import { retiredClaim } from './hidden.ts';
import { aboutOneOf, cardAccounts, PUBLISHED } from './mapping-claims.ts';
import { mapIndex, mapUrl } from './tools/maps.ts';
import type { ToolContext } from './types.ts';

export { PUBLISHED };

const VERSION = 'publish-data/v1';

/** A claim kept privately that can't go, and why (the people rule's words). */
export interface StaysPrivate {
  id: string;
  subject: string;
  verb: string;
  why: string;
}

/** What one press would publish on a map, and what stays private. */
export interface Publishable {
  about: string;
  name: string;
  claims: Claim[];
  private: StaysPrivate[];
  /** of what they kept about it, how many are already on the shared map */
  published: number;
}

/** What a prepared publish holds until it's signed. */
interface Prepared {
  petal: typeof VERSION;
  about: string;
  owner: string;
  by: string;
  claims: string[];
  message: string;
  nonce: string;
  recipient: string;
  expires_at: string;
  created_at: string;
}

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
  const stays: StaysPrivate[] = [];
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
    else
      stays.push({
        id: r.id,
        subject: r.subject,
        verb: r.verb,
        why: v.errors.map((e) => e.message).join('; '),
      });
  }
  const c = found.card;
  return {
    about,
    name: c.name ?? c.mark?.name?.value ?? c.title,
    claims,
    private: stays,
    published,
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
  const signed = JSON.stringify(proof);
  const added = await store.annotation.add(
    claims.map((c, place) => ({
      owner: PUBLISHED,
      id: c.id,
      exploration: `published:${sha256}`,
      subject: c.subject,
      verb: c.verb,
      kind: c.kind,
      body: JSON.stringify(c),
      credential: signed,
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
