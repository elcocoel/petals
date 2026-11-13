// The closed vocabulary of claims. A new verb is a new version: anything not listed is refused. claim/v2
// adds named, noted and linked (V2_VERBS), claim/v4 adds is_a (V4_VERBS); each version's schema lists its own.
// `same_as` is gone on purpose: it hid one address on two chains (`same_address`) and one controller
// (`declares_same_controller`, or a neutral inference). `declares_name` is gone too: names stay in
// the account's own voice, read at draw time (people.ts).
import type { ClaimKind } from './types.ts';

/** What a qualifier's value may look like. None of them can carry a sentence. */
export type QualifierClass =
  | 'decimal'
  | 'count'
  | 'slug'
  | 'symbol'
  | 'hex24'
  | 'band'
  | 'grounds'
  | 'request'
  | 'reason';

/** What a verb's object may be. `entity`: an account, a contract or a group. */
export type ObjectClass =
  | 'entity'
  | 'account'
  | 'asset'
  | 'proposal'
  | 'claim'
  | 'number'
  | 'tag'
  | 'name'
  | 'text'
  | 'link';

export interface VerbRule {
  /** The one-line definition. */
  means: string;
  kinds: readonly ClaimKind[];
  object: ObjectClass;
  qualifiers?: Readonly<Record<string, QualifierClass>>;
  required?: readonly string[];
}

const READ = ['observed', 'sourced'] as const;
/** What a person or an agent adds about an account: never read from a chain. */
const ANNOTATION = ['declared', 'stated', 'sourced', 'inferred'] as const;
const AMOUNT = { amount: 'decimal', unit: 'symbol' } as const;

export const VERBS = {
  // Read from a chain, or from a source that reports one.
  holds: {
    means: 'The account has this amount of this asset, under this measure, at this moment.',
    kinds: READ,
    object: 'asset',
    qualifiers: { ...AMOUNT, measure: 'slug', folded_count: 'count' },
    required: ['amount', 'measure'],
  },
  measured: {
    means: 'A number read for the account that is not a position, like blocks made or a supply.',
    kinds: READ,
    object: 'number',
    qualifiers: { measure: 'slug' },
    required: ['measure'],
  },
  delegates_to: {
    means: 'The account delegates stake or votes to the object.',
    kinds: READ,
    object: 'entity',
    qualifiers: { ...AMOUNT, bps: 'count', folded_count: 'count' },
  },
  owned_by: {
    means: 'The chain or the source names the object as the owner of the account.',
    kinds: READ,
    object: 'entity',
  },
  member_of: {
    means: 'The account is a member of the group or contract.',
    kinds: READ,
    object: 'entity',
    qualifiers: { ...AMOUNT, role: 'slug' },
  },
  holds_role: {
    means: 'The account holds this role in the contract.',
    kinds: READ,
    object: 'entity',
    qualifiers: { ...AMOUNT, role: 'slug' },
    required: ['role'],
  },
  voted: {
    means: 'The account voted on the proposal, with this choice.',
    kinds: READ,
    object: 'proposal',
    qualifiers: { ...AMOUNT, choice: 'slug' },
    required: ['choice'],
  },
  proposed: {
    means: 'The account submitted the proposal.',
    kinds: READ,
    object: 'proposal',
    qualifiers: AMOUNT,
  },
  reviewed: {
    means: 'The account reviewed the proposal.',
    kinds: READ,
    object: 'proposal',
    qualifiers: AMOUNT,
  },
  paid: {
    means: 'The account sent this amount to the object.',
    kinds: READ,
    object: 'entity',
    qualifiers: AMOUNT,
  },
  funded_by: {
    means:
      "The object's transfer paid for the account's first action. A deposit alone doesn't count.",
    kinds: READ,
    object: 'account',
    qualifiers: AMOUNT,
  },
  signer_of: {
    means: "The account's key can sign for the object.",
    kinds: READ,
    object: 'account',
  },
  deployed: {
    means: 'The account deployed the contract.',
    kinds: READ,
    object: 'account',
  },
  controls: {
    means: 'The account can direct the object, as the account itself or a cited source says.',
    kinds: ['declared', 'sourced'],
    object: 'entity',
    qualifiers: { role: 'slug' },
  },

  // The account's own word.
  declares_same_controller: {
    means: 'This account says it and the object have one controller. Full only when both say so.',
    kinds: ['declared'],
    object: 'account',
  },

  // Neutral inferences: what the accounts did, never what anyone is.
  shares_signer: {
    means: 'One key can sign for both accounts.',
    kinds: ['inferred'],
    object: 'account',
    qualifiers: { grounds: 'grounds' },
    required: ['grounds'],
  },
  moves_with: {
    means: 'The two accounts act in step.',
    kinds: ['inferred'],
    object: 'account',
    qualifiers: { grounds: 'grounds' },
    required: ['grounds'],
  },
  same_funder: {
    means: "One account paid for both accounts' first actions.",
    kinds: ['inferred'],
    object: 'account',
    qualifiers: { grounds: 'grounds' },
    required: ['grounds'],
  },
  same_address: {
    means: 'The same address exists on two chains. It says nothing about who controls either.',
    kinds: ['inferred'],
    object: 'account',
    qualifiers: { grounds: 'grounds' },
    required: ['grounds'],
  },

  // Existing rows on the map, read as claims. The text stays on the row.
  labelled: {
    means: 'A row on the map labels this account under this tag. Its text is read at draw time.',
    kinds: ['declared', 'sourced', 'inferred'],
    object: 'tag',
    qualifiers: { grounds: 'grounds' },
  },
  requests_correction: {
    means: 'This account asks for a label or identity link about the object to change or go.',
    kinds: ['declared'],
    object: 'account',
    qualifiers: { request: 'request', flower_id: 'hex24', correction_id: 'hex24' },
    required: ['request'],
  },

  // Claims about claims. The speaker is always the subject.
  challenges: {
    means: 'The speaker says the claim is wrong, and shows why.',
    kinds: ['declared'],
    object: 'claim',
    qualifiers: { reason: 'reason' },
  },
  responds: {
    means: "The speaker answers the claim. From the subject's own account, it always shows.",
    kinds: ['declared'],
    object: 'claim',
  },
  retracts: {
    means:
      'The author withdraws their own claim, which stays readable. Final: say it anew instead.',
    kinds: ['declared'],
    object: 'claim',
  },
  supersedes: {
    means: 'The author replaces their own earlier claim. The old one stays readable.',
    kinds: ['declared'],
    object: 'claim',
  },
  // Annotations (v2): what a person or an agent adds, in words. Kept in a person's own project; a name
  // is never published yet (people.ts).
  named: {
    means:
      "Someone says the account goes by this name: a handle, a person's, an organisation's or a role's.",
    kinds: ANNOTATION,
    object: 'name',
    qualifiers: { grounds: 'grounds' },
  },
  noted: {
    means: 'A note or research about the account, in words.',
    kinds: ANNOTATION,
    object: 'text',
    qualifiers: { grounds: 'grounds' },
  },
  linked: {
    means: 'A page about the account.',
    kinds: ANNOTATION,
    object: 'link',
    qualifiers: { grounds: 'grounds' },
  },
  // v4: types are data, claims with evidence, any value, several at once
  is_a: {
    means:
      'The account is of this type, in any word: a form, a role or a declared nature. One per claim.',
    kinds: ['observed', 'declared', 'stated', 'sourced', 'inferred'],
    object: 'text',
    qualifiers: { grounds: 'grounds' },
  },

  confidence: {
    means: 'How sure a named person or a named model is of the claim. It overwrites nothing.',
    kinds: ['declared', 'inferred'],
    object: 'claim',
    qualifiers: { band: 'band' },
    required: ['band'],
  },
} as const satisfies Record<string, VerbRule>;

export type Verb = keyof typeof VERBS;

export const VERB_RULES: Readonly<Record<Verb, VerbRule>> = VERBS;
export const isVerb = (v: string): v is Verb => Object.hasOwn(VERBS, v);

const META = new Set<Verb>(['challenges', 'responds', 'retracts', 'supersedes', 'confidence']);
/** A claim about a claim. */
export const isMetaVerb = (v: Verb): boolean => META.has(v);

/** The verbs claim/v2 added. A v1 claim can't use them: its schema doesn't list them. */
export const V2_VERBS: ReadonlySet<Verb> = new Set<Verb>(['named', 'noted', 'linked']);
/** The verb claim/v4 added. Older claims can't use it: their schemas don't list it. */
export const V4_VERBS: ReadonlySet<Verb> = new Set<Verb>(['is_a']);

export const CLAIM_KINDS = ['observed', 'declared', 'stated', 'sourced', 'inferred'] as const;
export const CONFIDENCE_BANDS = ['low', 'medium', 'high'] as const;
/**
 * claim/v3's kinds of evidence, and the field each names: a reading (snapshot_sha256), a transaction (tx), a
 * proposal (proposal), a web page or a post on a platform (url), another claim (claim_id), a note alone (note).
 */
export const EVIDENCE_FIELD = {
  snapshot: 'snapshot_sha256',
  tx: 'tx',
  proposal: 'proposal',
  page: 'url',
  post: 'url',
  claim: 'claim_id',
  note: 'note',
} as const;
export const EVIDENCE_TYPES = Object.keys(EVIDENCE_FIELD) as (keyof typeof EVIDENCE_FIELD)[];
/**
 * What an inference may rest on. `inbound_transfers` can't be the only one (people.ts). `research`
 * (reading proposals, pages and posts) is claim/v2's.
 */
export const GROUNDS = [
  'funding_lineage',
  'inbound_transfers',
  'research',
  'same_address',
  'shared_signer',
  'synchronised_behaviour',
] as const;
export const CHALLENGE_REASONS = ['names_a_person', 'stale', 'unsupported', 'wrong'] as const;
/** Tags a map label may be read under. Add to this when real label rows appear. */
export const LABEL_TAGS = [
  'contract',
  'custodian',
  'exchange',
  'identity',
  'name',
  'organisation',
  'role',
  'staking_pool',
  'treasury',
  'validator',
] as const;
