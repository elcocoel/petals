// claim/v1 and claim/v2: the shapes (specs/002-system/contracts/claims.md). The JSON Schemas are
// packages/core/schema/claim.schema.json and claim-v2.schema.json; test/claims.test.ts keeps them in step.
// v2 adds annotations: named, noted and linked, a person's own word (stated), research as a ground, and a
// transaction, a proposal and a quote in the evidence. v3 (11 Nov, Elco: "space for discovered, inferred, osint
// gathered claims and their evidence") types each piece of evidence and says who found it and when, with an
// open source's platform and an archived copy.
import type { Nep413Proof } from '../types/generated/flower.ts';
import type { Verb } from './verbs.ts';

/**
 * A namespaced name for something a claim can talk about (refs.ts). Never a natural person.
 * `near:mainnet:alice.near`, `eip155:1:0xabc…`, `group:<snapshot sha256>:<key>`, `claim:<id>`.
 */
export type EntityRef = string;

/**
 * How anyone can check it.
 * observed: read from a chain, proved by a snapshot's hash or a transaction.
 * declared: the subject says it of itself, with proof.
 * stated (v2): the writer says it on their own word, with no outside source.
 * sourced: a writer points at an outside source.
 * inferred: a rule or a model concluded it, with its method stated.
 */
export type ClaimKind = 'observed' | 'declared' | 'stated' | 'sourced' | 'inferred';

/** Plain bands, not a number (open question 12). */
export type ConfidenceBand = 'low' | 'medium' | 'high';

/** A number, or a closed tag; in v2, words for named and noted, and a link for linked (people.ts). */
export interface ClaimValue {
  value: string;
  unit?: string;
}

export interface ClaimEvidence {
  snapshot_sha256?: string;
  url?: string;
  url_sha256?: string;
  retrieved_at?: string;
  claim_id?: string;
  /** Short. Published, it must not name a person: see people.ts for what a machine can and can't catch. */
  note?: string;
  /** v2: the transaction it rests on, `<caip2>:<hash>`. */
  tx?: string;
  /** v2: the proposal it rests on, `proposal:<caip2>:<key>`. */
  proposal?: string;
  /** v2: the source's own words, exactly as written. */
  quote?: string;
  /** v3: what this piece is (EVIDENCE_TYPES), which names the field that holds it. Required in v3. */
  type?: EvidenceType;
  /** v3: who found this piece: an account, a named tool or a named model. Required in v3. */
  found_by?: EntityRef;
  /** v3: when it was found. Required in v3. */
  found_at?: string;
  /** v3: where a page or post lives, as a slug: x, github, discord, forum. */
  platform?: string;
  /** v3: an archived copy of the page or post, so it survives the page changing. */
  archive_url?: string;
}

/** v3: what a piece of evidence is: a reading, a transaction, a proposal, a page, a post, a claim, a note. */
export type EvidenceType = 'snapshot' | 'tx' | 'proposal' | 'page' | 'post' | 'claim' | 'note';

/** A FastData write records its signer, so a transaction is enough for a direct write. */
export interface TxProof {
  type: 'tx';
  hash: string;
}
/** A model's enclave signature, from NEAR AI. */
export interface NearAiProof {
  type: 'nearai';
  model: string;
  completion_id: string;
  text: string;
  signature: string;
  signing_address: string;
  signing_algo: 'ecdsa' | 'ed25519';
}
export type ClaimProof = TxProof | Nep413Proof | NearAiProof;

export interface Claim {
  petal: 'claim/v1' | 'claim/v2' | 'claim/v3';
  /** SHA-256 of the canonical claim, without `id` and `proof`. */
  id: string;
  subject: EntityRef;
  verb: Verb;
  object: EntityRef | ClaimValue;
  /** Checked per verb (verbs.ts). Amounts are strings. */
  qualifiers?: Record<string, string>;
  /** When it holds in the world. */
  valid_from?: string;
  valid_to?: string;
  /** When it was said. */
  issued_at: string;
  /** The chain moment a chain-derived claim stands for. */
  as_of?: { chain: string; block: number };
  kind: ClaimKind;
  /** Required if inferred, absent otherwise: rule or model, `name@version`, optional `#paramhash`. */
  method?: string;
  evidence: ClaimEvidence[];
  /** Who answers for it. */
  by: EntityRef;
  /** The tool or model that produced it. */
  via?: EntityRef;
  proof?: ClaimProof;
}

/** A claim before it has an id (claim.ts, `makeClaim`). */
export type ClaimDraft = Omit<Claim, 'id' | 'petal'>;

/**
 * A reader's choice of what counts (data-model.md). Whoever holds a lens decides for themselves
 * only: a lens never changes a claim.
 */
export interface Lens {
  /** Which kinds this reader wants. Absent: all. Meta verbs follow `trusted` instead. */
  kinds?: readonly ClaimKind[];
  /**
   * Whose word about someone else counts. Absent or empty: nobody's, so no outside writer can
   * change what this reader sees. 'everyone' is the open view, and has to be asked for.
   * An account's word about itself and a snapshot's hash need no trust.
   */
  trusted?: readonly EntityRef[] | 'everyone';
  /** Stated, sourced and inferred claims need at least this, from a writer in `trusted`. */
  minConfidence?: ConfidenceBand;
  /** Disputed claims show as contested (default), or, when false, are hidden. */
  showDisputed?: boolean;
  /** Retracted or replaced claims show with a caveat when true. Default: off. */
  showRetracted?: boolean;
}

export type ShowAs = 'plain' | 'caveated' | 'contested' | 'hidden';

/** What the policy says about one claim. Surfaces decide how this looks, not what's true. */
export interface Shown {
  claim: Claim;
  show: ShowAs;
  /** In plain words. */
  why: string;
  /** Ids of answers from the subject's own account. Every lens carries them. */
  beside: string[];
  /** Distinct writers challenging it: those this lens counts, and those it doesn't. */
  challenges: { counted: number; outside: number };
  /** The lowest band from writers this lens counts, and how many rated it. */
  confidence?: { band: ConfidenceBand; raters: number };
}

/** Plain counts, not a verdict (SYS-062). */
export interface ClaimerRecord {
  by: EntityRef;
  claims: number;
  challenges_received: number;
  /** Distinct writers behind `challenges_received`. */
  challengers: number;
  retractions: number;
}

/** Aggregates over claims. Use `facts` or `subjects` where a raw row count would overcount. */
export interface DistinctCounts {
  /** What came in, duplicates included. */
  rows: number;
  /** Distinct claim ids. */
  claims: number;
  /** Distinct subject, verb and object: many writers saying one thing is one fact. */
  facts: number;
  subjects: number;
}
