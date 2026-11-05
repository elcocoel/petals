// Everything is a claim: the shape, a pure policy, and existing data read as claims.
// specs/002-system/contracts/claims.md. No writing, no chain, no clock.
export { claimerRecord, distinctCounts, targetOf } from './derive.ts';
export { claimsFromMap, kindOfIdentityStatus, type MapRead } from './from-map.ts';
export {
  observedClaims,
  readSnapshot,
  type SkippedRow,
  SNAPSHOT_READER,
  type SnapshotRead,
} from './observed.ts';
export { FORBIDDEN_WORDS, PERSON_NAMESPACES, peopleRuleIssues } from './people.ts';
export { applyPolicy, DEFAULT_LENS } from './policy.ts';
export {
  accountRef,
  assetRef,
  claimRef,
  groupRef,
  type ParsedRef,
  parseRef,
  proposalRef,
} from './refs.ts';
export type * from './types.ts';
export { claimId, makeClaim, validateClaim } from './validate.ts';
export {
  CHALLENGE_REASONS,
  CLAIM_KINDS,
  CONFIDENCE_BANDS,
  GROUNDS,
  isMetaVerb,
  isVerb,
  LABEL_TAGS,
  VERB_RULES,
  VERBS,
  type Verb,
  type VerbRule,
} from './verbs.ts';
