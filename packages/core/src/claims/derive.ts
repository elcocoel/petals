// What's derived, never stored: who retracted what, what's being said about each claim, a claimer's
// record. Rebuildable from the claims alone, and no claim is ever changed by it.
import { canonicalJson } from '../hash.ts';
import { parseRef } from './refs.ts';
import type { Claim, ClaimerRecord, DistinctCounts } from './types.ts';

/** The id a claim about a claim points at. */
export function targetOf(claim: Claim): string | null {
  if (typeof claim.object !== 'string') return null;
  const ref = parseRef(claim.object);
  return ref?.ns === 'claim' ? ref.id : null;
}

export interface ClaimIndex {
  /** Each claim once, by id. The input's order and repeats don't matter. */
  claims: Claim[];
  byId: Map<string, Claim>;
  /** Target id, to its author's retraction or replacement. Anyone else's has no effect. */
  retired: Map<string, Claim>;
  /** Target id, to the challenges, answers and ratings still standing. */
  about: Map<string, Claim[]>;
}

export function indexClaims(input: readonly Claim[]): ClaimIndex {
  const byId = new Map<string, Claim>();
  for (const c of input) if (!byId.has(c.id)) byId.set(c.id, c);
  const claims = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const authorsOwn = (c: Claim): string | null => {
    const id = targetOf(c);
    const target = id === null ? undefined : byId.get(id);
    // A retraction is final, so nothing recurses: to say a thing again, issue a new claim.
    return target !== undefined && target.by === c.by && target.verb !== 'retracts' ? id : null;
  };

  const retired = new Map<string, Claim>();
  for (const c of claims) {
    if (c.verb !== 'retracts') continue;
    const id = authorsOwn(c);
    if (id !== null && !retired.has(id)) retired.set(id, c);
  }
  // Retractions first: a replacement its author took back replaces nothing.
  for (const c of claims) {
    if (c.verb !== 'supersedes' || retired.get(c.id)?.verb === 'retracts') continue;
    const id = authorsOwn(c);
    if (id !== null && !retired.has(id)) retired.set(id, c);
  }

  const about = new Map<string, Claim[]>();
  for (const c of claims) {
    if (c.verb !== 'challenges' && c.verb !== 'responds' && c.verb !== 'confidence') continue;
    if (retired.has(c.id)) continue;
    const id = targetOf(c);
    if (id === null) continue;
    const list = about.get(id);
    if (list) list.push(c);
    else about.set(id, [c]);
  }
  return { claims, byId, retired, about };
}

/**
 * A writer's record: plain counts of what happened. No score: repeating yourself adds claims, not
 * standing, and how to weigh a record is open question 13.
 */
export function claimerRecord(input: readonly Claim[], by: string): ClaimerRecord {
  const { claims, about, retired } = indexClaims(input);
  let authored = 0;
  let challenges = 0;
  const challengers = new Set<string>();
  for (const c of claims) {
    if (c.by !== by) continue;
    authored += 1;
    for (const x of about.get(c.id) ?? []) {
      if (x.verb !== 'challenges' || x.by === by) continue;
      challenges += 1;
      challengers.add(x.by);
    }
  }
  let retractions = 0;
  for (const c of retired.values()) if (c.verb === 'retracts' && c.by === by) retractions += 1;
  return {
    by,
    claims: authored,
    challenges_received: challenges,
    challengers: challengers.size,
    retractions,
  };
}

/**
 * Aggregates must not count rows: on the graph pass `count(*)` overcounted by up to 11%, because
 * many claims can sit on one pair. Many writers saying one thing is one fact.
 */
export function distinctCounts(claims: readonly Claim[]): DistinctCounts {
  const ids = new Set<string>();
  const facts = new Set<string>();
  const subjects = new Set<string>();
  for (const c of claims) {
    ids.add(c.id);
    subjects.add(c.subject);
    facts.add(`${c.subject}\n${c.verb}\n${canonicalJson(c.object)}`);
  }
  return { rows: claims.length, claims: ids.size, facts: facts.size, subjects: subjects.size };
}
