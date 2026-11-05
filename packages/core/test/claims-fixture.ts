// A small world for the claims tests. Every account, model and URL here is invented.
import { makeClaim } from '../src/claims/index.ts';
import type { Claim, ClaimDraft, ClaimProof } from '../src/types/index.ts';

export const SNAP = 'a'.repeat(64);
export const POOL = 'near:mainnet:tern.pool.example.near'; // what the claims are about
export const OWNER = 'near:mainnet:reed.example.near';
export const AUTHOR = 'near:mainnet:moss.example.near'; // a named account that cites a source
export const CHALLENGER = 'near:mainnet:sedge.example.near';
export const CLASSIFIER = 'model:example/classifier@1';
export const READER = 'tool:petal/observed-claims@1';
export const WHEN = '2026-11-05T12:00:00Z';

export const proofOf = (account: string): ClaimProof => ({
  type: 'nep413',
  account_id: account.split(':').at(-1) as string,
  public_key: 'ed25519:11111111111111111111111111111111',
  signature: 'AAAA',
  message: '{"petal":"claim/v1"}',
  nonce: 'AAAA',
  recipient: 'petals.testnet',
});

/** A chain's claim, proved by a snapshot's hash. */
export const chainClaim = (overrides: Partial<ClaimDraft> = {}): Claim =>
  makeClaim({
    subject: POOL,
    verb: 'holds',
    object: 'asset:near:mainnet:NEAR',
    qualifiers: { amount: '1000.5', measure: 'validator_stake', unit: 'NEAR' },
    issued_at: WHEN,
    valid_from: WHEN,
    valid_to: WHEN,
    as_of: { chain: 'near:mainnet', block: 123 },
    kind: 'observed',
    evidence: [{ snapshot_sha256: SNAP }],
    by: READER,
    ...overrides,
  });

/** A named account's sourced claim. */
export const sourcedClaim = (overrides: Partial<ClaimDraft> = {}): Claim =>
  makeClaim({
    subject: POOL,
    verb: 'owned_by',
    object: OWNER,
    issued_at: WHEN,
    kind: 'sourced',
    evidence: [{ url: 'https://example.org/tern-pool-post', retrieved_at: WHEN }],
    by: AUTHOR,
    ...overrides,
  });

/** A classifier's confidence, a claim about a claim. */
export const rating = (target: Claim, band = 'medium', by = CLASSIFIER): Claim =>
  makeClaim({
    subject: by,
    verb: 'confidence',
    object: `claim:${target.id}`,
    qualifiers: { band },
    issued_at: WHEN,
    kind: 'inferred',
    method: 'example/classifier@1',
    evidence: [{ claim_id: target.id }],
    by,
  });

/** Any writer's word about a claim: a challenge by default. */
export const metaClaim = (
  verb: 'challenges' | 'responds' | 'retracts' | 'supersedes',
  target: Claim,
  by: string,
  issued_at = WHEN,
): Claim =>
  makeClaim({
    subject: by,
    verb,
    object: `claim:${target.id}`,
    issued_at,
    kind: 'declared',
    evidence: verb === 'challenges' ? [{ url: 'https://example.org/tern-pool-rebuttal' }] : [],
    by,
    proof: proofOf(by),
  });

export const challenge = (target: Claim, by = CHALLENGER): Claim =>
  metaClaim('challenges', target, by);

/** The story in the spec: a chain, a named account, a classifier and a challenge. */
export function fourClaims(): {
  chain: Claim;
  sourced: Claim;
  confidence: Claim;
  challenged: Claim;
  all: Claim[];
} {
  const chain = chainClaim();
  const sourced = sourcedClaim();
  const confidence = rating(sourced);
  const challenged = challenge(sourced);
  return { chain, sourced, confidence, challenged, all: [chain, sourced, confidence, challenged] };
}

export function deepFreeze<T>(x: T): T {
  if (typeof x === 'object' && x !== null) {
    for (const value of Object.values(x)) deepFreeze(value);
    Object.freeze(x);
  }
  return x;
}
