// Shared types for every package: `import type { ... } from '@petal/core/types'`.
// Generated from the JSON Schemas (generated/, `pnpm gen:types`), plus hand-written shapes taken
// from contracts/tools.md, renderer.md, http-api.md, packages.md and shared-map.md.
// Part of packages/v1 (frozen at T023): changes go through the lead and bump the version.

import type {
  Correction,
  Encoding,
  EntryV1,
  EntryV2,
  Interpretation,
  ModelSignature,
  Nep413Proof,
  OrderEncoding,
  Sha256,
  SourceIds,
  Spec,
} from './generated/flower.ts';
import type {
  Datetime,
  Decimal,
  Identity,
  Kind,
  PetalSnapshotCommonTableV1,
} from './generated/snapshot.ts';

// claim/v1 (specs/002-system/contracts/claims.md)
export type {
  Claim,
  ClaimDraft,
  ClaimEvidence,
  ClaimerRecord,
  ClaimKind,
  ClaimProof,
  ClaimValue,
  ConfidenceBand,
  DistinctCounts,
  EntityRef,
  Lens,
  MapRead,
  ParsedRef,
  ShowAs,
  Shown,
  SkippedRow,
  SnapshotRead,
  Verb,
  VerbRule,
} from '../claims/index.ts';

// ---------------------------------------------------------------------------------------------
// Generated (contracts/*.schema.json)

export type {
  Correction,
  Datetime,
  Decimal,
  Encoding,
  EntryV1,
  EntryV2,
  Identity,
  Interpretation,
  Kind,
  ModelSignature,
  Nep413Proof,
  OrderEncoding,
  Sha256,
  SourceIds,
  Spec,
};

/** snapshot/v1, the common table (common-table.schema.json). */
export type Snapshot = PetalSnapshotCommonTableV1;
/** A published flower entry; its `petal` says how to verify it (shared-map.md, Entry versions). */
export type Entry = EntryV1 | EntryV2;
/** An entry before it has an id. */
export type EntryWithoutId = Omit<EntryV1, 'id'> | Omit<EntryV2, 'id'>;

export type SnapshotNetwork = Snapshot['network'];
export type SnapshotMoment = Snapshot['snapshot'];
export type Coverage = Snapshot['coverage'];
export type Source = Snapshot['sources'][number];
export type SourceKind = Source['kind'];
export type Participant = Snapshot['participants'][number];
export type Holding = Snapshot['holdings'][number];
export type Relationship = Snapshot['relationships'][number];
export type SnapshotEvent = Snapshot['events'][number];
export type ModuleStamp = Snapshot['module'];
export type IdentityStatus = Identity['status'];

/** Drawable properties (data-model.md, Visual primitive). */
export type PrimitiveId =
  | 'width'
  | 'height'
  | 'colour'
  | 'outline'
  | 'segments'
  | 'lines'
  | 'markings'
  | 'order'
  | 'texture'
  | 'extrusion'
  | 'opacity';
/** The primitives a spec can carry (`encodings` keys). */
export type SpecPrimitive = keyof Spec['encodings'];
export type OrderBy = OrderEncoding['by'];
export type Scale = NonNullable<Encoding['scale']>;

// ---------------------------------------------------------------------------------------------
// Small shared pieces

/** Network parameters, e.g. `{ dao: "marmaj.sputnik-dao.near" }`. */
export type Params = Record<string, string>;

/** `at` in get_snapshot: latest, an ISO date, or a block. */
export type At = 'latest' | string | { block_height: number };
export interface ResolvedAt {
  block_height: number;
  as_of: Datetime;
}

/** One validation problem (validate_spec output). */
export interface ValidationIssue {
  path: string;
  rule: string;
  message: string;
}
/** validate_spec output (without tools_version). */
export interface Validation {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
/** What a validator returns for a document: the typed value, or why not. */
export type Result<T> = { ok: true; value: T } | { ok: false; errors: ValidationIssue[] };

/** Progress from long tools (tools.md, Shared rules). */
export interface ProgressEvent {
  stage: string;
  message: string;
  done?: number;
  total?: number;
}
/** The progress callback tools and input modules accept. */
export type Progress = (event: ProgressEvent) => void;

/** Error codes (tools.md, Shared rules). HTTP status per code in http-api.md. */
export type ToolErrorCode =
  | 'bad_input'
  | 'not_found'
  | 'cannot_read'
  | 'source_failed'
  | 'rate_limited'
  | 'invalid_spec'
  | 'unauthorised'
  | 'invite_required'
  | 'budget_exhausted'
  /** additive: a public site refuses what a person's own agent does on their machine (PETAL_PUBLIC) */
  | 'not_on_this_site'
  | 'internal';
/** Errors are returned, not thrown across a door. */
export interface ToolError {
  error: { code: ToolErrorCode; message: string; hint?: string; retry_after_s?: number };
}
/**
 * Additive (J4): what Petal's own agent loop answers a held tool with, until the person has said yes.
 * It never crosses a door, so it has no HTTP status and isn't one of the ToolErrorCodes above, each of
 * which has one. A wallet approval (SYS-053) would attach to the event of the same name.
 */
export interface ApprovalRequiredError {
  error: { code: 'approval_required'; message: string; hint: string };
}

// ---------------------------------------------------------------------------------------------
// Networks (data-model.md, Network; tools.md, list_networks)

/** A parameter a network takes, e.g. `dao` for near-sputnik-dao. */
export interface ParamSpec {
  description: string;
  required: boolean;
  pattern?: string;
  example?: string;
  /** what leaving it out means; a spec that names this value is the same spec without it */
  default?: string;
}

/** What a network population can show, from its input module (not from data). */
export interface Capabilities {
  /** holdings measures, e.g. validator_stake_current_epoch. The first is the default. */
  measures: { id: string; unit: string; label: string }[];
  /** allowed `by` values per primitive in this population (validator rule 3). */
  by: Partial<Record<SpecPrimitive, string[]>>;
  /** segment kinds this population supports, e.g. ['backers']. */
  segments: string[];
  /** relationship types present, e.g. delegates_to, owned_by. */
  relationships: string[];
  /** population defaults applied on top of default/v1, e.g. `{ segments: 'backers' }`. */
  defaults: Partial<Record<SpecPrimitive, string>> & { measure?: string; petals?: number };
  /** standard meaning and source ids per primitive and `by`, keyed `<primitive>:<by>`. */
  meanings: Record<string, { meaning: string; sources: string[] }>;
}

/** An input module's description of what it reads (tools.md `Network`). */
export interface NetworkDescriptor {
  id: string;
  /** CAIP-2 chain id, e.g. near:mainnet, or 'none'. */
  chain: string;
  population: string;
  kind: 'chain' | 'protocol' | 'dao' | 'other';
  title: string;
  description: string;
  params: Record<string, ParamSpec>;
  capabilities: Capabilities;
  /** true when the module can fetch now; false for stored-only data. */
  live: boolean;
  /** rough cost of one live fetch. */
  cost: { calls: number; seconds: number; note?: string };
  sources: { id: string; kind: SourceKind; url: string }[];
}

// ---------------------------------------------------------------------------------------------
// Snapshots: store, index, get_snapshot (packages.md @petal/inputs; tools.md get_snapshot)

/** Where a snapshot was found. */
export type SnapshotWhere = 'fixture' | 'cache' | 'map';

/** One row of a store index (fixtures/snapshots/index.json, cache/index.json). */
export interface IndexRow {
  sha256: Sha256;
  network: string;
  chain: string;
  population: string;
  params?: Params;
  block_height: number | null;
  as_of: Datetime;
  final: boolean;
  /** canonical JSON bytes, uncompressed */
  bytes: number;
  /** bytes of the .json.gz on disk */
  gz_bytes: number;
  /** file name relative to the store folder */
  file: string;
  where: Exclude<SnapshotWhere, 'map'>;
  module: ModuleStamp;
}

/** How importSpike folds rows to fit the fixture budget (declared in coverage.grouped). */
export interface GroupingRules {
  /** relationships of this type are candidates for folding, e.g. delegates_to. */
  relationship: string;
  /** keep rows with amount >= this (decimal string, in the human unit), fold the rest. */
  min_amount: Decimal;
  unit: string;
  /** fold into one group row per target and backer class. */
  group_by: ('to' | 'backer_class')[];
}

/** get_snapshot input (tools.md). */
export interface SnapshotRequest {
  network: string;
  params?: Params;
  at?: At;
  fresh?: boolean;
}

/** get_snapshot output without tools_version (tools.md). The body is never included. */
export interface SnapshotResult {
  sha256: Sha256;
  reused: boolean;
  where: SnapshotWhere | 'fetched';
  network: SnapshotNetwork;
  snapshot: { as_of: Datetime; block_height?: number; final: boolean };
  coverage: Coverage;
  sources: Source[];
  counts: { participants: number; holdings: number; relationships: number; events: number };
  body_url: string;
}

/** The map value at petal/v1/snapshot/<sha256> (shared-map.md). */
export interface SnapshotRef {
  petal: 'snapshot-ref/v1';
  sha256: Sha256;
  bytes: number;
  gz_bytes: number;
  rows: number;
  network: { id: string; chain: string; population: string };
  as_of: Datetime;
  block_height: number | null;
  final: boolean;
  module: ModuleStamp;
  urls: string[];
}

/** The map side of snapshot reuse, as getSnapshot needs it. @petal/tools adapts a MapReader. */
export interface MapIndex {
  lookup(key: { chain: string; population: string; block_height: number }): Promise<Sha256 | null>;
  /** write petal/v1/snapshot/<sha256> and the index key; null when the map is not configured. */
  record(ref: SnapshotRef): Promise<{ tx_hash: string } | null>;
}

// ---------------------------------------------------------------------------------------------
// Counting (tools.md compute_figures, compare_figures; data-model.md Figures)

/** A group judged to be under common control, from evidence rules only (FR-014). */
export interface Fusion {
  id: string;
  members: string[];
  evidence: {
    type: 'shared_owner' | 'shared_signer' | 'funding' | 'sync';
    detail: string;
    source: string;
    status: IdentityStatus;
  }[];
}

/** compute_figures output without tools_version. Shares rounded to 6 decimals. */
export interface Figures {
  measure: string;
  unit: string;
  total: Decimal;
  participants_total: number;
  participants_included: number;
  /** the top `petals` only */
  shares: { id: string; label: string; amount: Decimal; share: number; rank: number }[];
  /** keys are the k values, e.g. "1", "5", "10", "100" */
  top_k_share: Record<string, number>;
  nakamoto: { threshold: number; count: number };
  hhi: number;
  gini: number;
  tail: { count: number; amount: Decimal; share: number };
  fusions: Fusion[];
  /** e.g. fig:total, fig:nakamoto, fig:top_k_share.10 */
  figure_ids: string[];
}

export interface Change<T = number> {
  a: T;
  b: T;
  change: T;
}

/** compare_figures output without tools_version (US5). `a` is the earlier snapshot. */
export interface FigureChanges {
  measure: string;
  unit: string;
  a: { as_of: Datetime; block_height?: number };
  b: { as_of: Datetime; block_height?: number };
  total: Change<Decimal>;
  nakamoto: Change & { threshold: number };
  hhi: Change;
  top_k_share: Record<string, Change>;
  joined: { id: string; label: string; share: number }[];
  left: { id: string; label: string; share: number }[];
  /** largest changes first */
  moved: {
    id: string;
    label: string;
    share_a: number;
    share_b: number;
    change: number;
    rank_a: number;
    rank_b: number;
  }[];
  moments: { at: Datetime; title: string; kind: 'event' | 'curated'; source: string }[];
  figure_ids: string[];
}

/** One petal as selected from a snapshot: top N by the order, plus the declared tail. */
export interface PetalRow {
  index: number;
  id: string;
  label: string;
  kind: Kind;
  identity: Identity | null;
  amount: Decimal;
  share: number;
  rank: number;
  /** true for the grouped "everyone else" petal (data-p="__tail") */
  tail?: boolean;
  /** tail only: how many participants it folds */
  count?: number;
}

/** One band of a bar (backers: lockup, liquid, large, other). */
export interface Segment {
  key: string;
  label: string;
  amount: Decimal;
  frac: number;
}

// ---------------------------------------------------------------------------------------------
// Conventions and proposing (data-model.md Convention; tools.md propose_spec)

/** A convention's choice for one primitive; sources come from the network descriptor. */
export interface ConventionEncoding {
  by: string;
  scale?: Scale;
  max_ratio?: number;
  meaning: string;
}

/** A mapping from behaviours to primitives. default/v1 is the sketch's defaults. */
export interface Convention {
  id: string;
  petals: number;
  tail: { group: boolean; label: string };
  encodings: {
    width: ConventionEncoding;
    height: ConventionEncoding;
    colour: ConventionEncoding;
    outline: ConventionEncoding | null;
    segments: ConventionEncoding | null;
    lines: ConventionEncoding | null;
    markings: ConventionEncoding | null;
    order: { by: OrderBy; meaning: string };
  };
}

/** The choices an agent may make; the tool fills everything else. */
export interface ProposeChoices {
  measure?: string;
  petals?: number;
  width?: 'r1.5' | 'r2' | 'r3' | 'equal';
  height?: 'sqrt' | 'linear' | 'log' | 'equal' | `m:${string}`;
  colour?: 'kind' | 'identity' | 'single';
  outline?: 'identity_status' | 'none';
  segments?: 'none' | 'backers' | 'time' | 'ops' | 'roles';
  lines?: 'none' | string;
  markings?: 'none' | 'fusion';
  order?: OrderBy;
}

/** propose_spec input (tools.md). */
export interface ProposeInput {
  network: string;
  params?: Params;
  sha256: Sha256;
  choices?: ProposeChoices;
  /** spec_sha256 of the spec this one changes; comes with `parent`, and must be its hash */
  variation_of?: Sha256;
  /** the spec this one changes: its recipe is the start, `choices` and `meanings` go on top */
  parent?: Spec;
  meanings?: Partial<Record<SpecPrimitive, string>>;
}

/** recipe/v1: the reusable part of a flower, with no target and no date. buildSpec compiles it. */
export interface Recipe {
  petal: 'recipe/v1';
  /** what it says beyond the network's defaults, so the same choices are one recipe anywhere */
  choices: ProposeChoices;
  /** words that replace a primitive's standard meaning */
  meanings?: Partial<Record<SpecPrimitive, string>>;
}

/** One change between two specs: a primitive, or the network, snapshot, labels, measure or petals. */
export interface DiffChange {
  what: string;
  from: unknown;
  to: unknown;
  /** plain words: the meaning it has now, or what kind of change it is */
  says: string;
}

/** diffSpecs: what changed, apart by subject (network), data (snapshot) and design (the recipe). */
export interface SpecDiff {
  same_recipe: boolean;
  subject: DiffChange[];
  data: DiffChange[];
  design: DiffChange[];
  /** the whole of it, e.g. "same recipe, newer data" */
  says: string;
}

// ---------------------------------------------------------------------------------------------
// Rendering (renderer.md)

export interface RenderOptions {
  /** default 800 */
  size?: number;
  thumb?: boolean;
}

export interface LegendItem {
  primitive: SpecPrimitive | 'tail';
  meaning: string;
  sources: string[];
  keys?: { swatch: string; label: string }[];
}

export interface PetalDetail {
  index: number;
  id: string;
  label: string;
  kind: string;
  identity: { name: string; source: string; status: IdentityStatus } | null;
  amount: string;
  share: number;
  rank: number;
  values: { primitive: string; value: string | number; explains: string }[];
  segments?: { key: string; label: string; amount: string; frac: number }[];
  interactions?: { type: string; with: string; amount?: string }[];
  count?: number;
}

export interface RenderResult {
  svg: string;
  legend: LegendItem[];
  petals: PetalDetail[];
  render_sha256: Sha256;
}

// ---------------------------------------------------------------------------------------------
// The reading (renderer.md, reading/v1): all a drawing needs, and no pixels

/** One petal as read: the row, and what each encoding resolves to for it. */
export interface ReadingPetal extends PetalRow {
  /** what a label calls it: the identity's name, unless that name is only inferred */
  name: string;
  /** the width encoding: a factor in [1, max_ratio] */
  width: number;
  /** the height encoding: a value in [0.03, 1], unrounded */
  height: number;
  /** the colour encoding: a kind, `named`, `anonymous` or `single`; `tail` for the tail */
  colour: string;
  /** the outline encoding: `asserted` (self-declared or verified), `inferred`, or none */
  outline: 'asserted' | 'inferred' | null;
  /** the segments encoding, bottom to top, as fractions of the bar; empty when not split */
  segments: Segment[];
}

/** A legend line before it has a look: each key says what it stands for, not its swatch. */
export interface ReadingLegendItem {
  primitive: SpecPrimitive | 'tail';
  meaning: string;
  sources: string[];
  keys?: { key: string; label: string }[];
}

export interface Reading {
  petal: 'reading/v1';
  spec_sha256: Sha256;
  title: string;
  /** CAIP-2. A petal's `id` is the snapshot's account id, so two readings on one chain compare */
  chain: string;
  /** what each encoding is driven by and what it means, as the spec says */
  encodings: Spec['encodings'];
  petals: ReadingPetal[];
  legend: ReadingLegendItem[];
  details: PetalDetail[];
}

// ---------------------------------------------------------------------------------------------
// The shared map (shared-map.md; packages.md @petal/near)

/** One row read from FastData KV. */
export interface MapRow {
  key: string;
  value: unknown;
  /** predecessor_id: who wrote it */
  writer: string;
  /** current_account_id: the map's receiver */
  receiver: string;
  tx_hash: string;
  block_height: number;
  block_timestamp: number;
}

// ---------------------------------------------------------------------------------------------
// Payments (tools.md quote_payment; FR-031: dry only)

export interface QuoteRequest {
  purpose: 'sponsor_refresh' | 'sponsor_coverage';
  /** default 1 */
  amount_usd?: number;
  /** 1Click asset id; default Base USDC */
  origin_asset?: string;
  network?: string;
}

export interface QuoteResult {
  dry: true;
  amount_in: Decimal;
  amount_in_usd: Decimal;
  min_amount_in: Decimal;
  time_estimate_s: number;
  fees: Record<string, string>;
  correlation_id: string;
  quoted_at: Datetime;
  note: string;
}

// ---------------------------------------------------------------------------------------------
// Agent chat and runs (http-api.md, Agent chat (SSE); data-model.md Run)

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Draft {
  spec?: Spec;
  entry?: Partial<Entry>;
}

/** POST /api/v1/agent/chat body. */
export interface ChatInput {
  messages: ChatMessage[];
  draft?: Draft;
  run_id?: string;
}

export type Stage =
  | 'recorded'
  | 'thinking'
  | 'reading_map'
  | 'fetching'
  | 'counting'
  | 'proposing'
  | 'validating'
  | 'drawing';

/** The `flower` event's data. */
export interface FlowerResult {
  spec: Spec;
  spec_sha256: Sha256;
  render_sha256: Sha256;
  view_url: string;
  legend: LegendItem[];
  interpretation: Interpretation;
  validation: Validation;
}

/**
 * An `error` event. Besides the tool codes, two say how a run ended early (T190): `stopped`, someone
 * pressed Stop; `interrupted`, the server restarted during it, and no `done` follows.
 */
export type AgentError = Omit<ToolError['error'], 'code'> & {
  code: ToolErrorCode | 'stopped' | 'interrupted';
};

/** One SSE event of a chat, in order: run, stage/progress/tool_call/tool_result/message…, flower, signature, done. */
export type AgentEvent =
  | { event: 'run'; data: { run_id: string; resume_url: string } }
  | { event: 'stage'; data: { stage: Stage; message: string } }
  | { event: 'progress'; data: ProgressEvent }
  | { event: 'tool_call'; data: { id: string; name: string; args: unknown } }
  | {
      event: 'tool_result';
      data: { id: string; name: string; ok: boolean; summary: string; ms: number };
    }
  | { event: 'message'; data: { text: string } }
  /** additive (J4): a new map is waiting for a yes, at most once per target per chat */
  | {
      event: 'approval_required';
      data: {
        tool: string;
        network: string;
        params?: Record<string, unknown>;
        target_key: string;
      };
    }
  | { event: 'flower'; data: FlowerResult }
  | { event: 'signature'; data: ModelSignature }
  | { event: 'error'; data: AgentError }
  | { event: 'heartbeat'; data: Record<string, never> }
  | {
      event: 'done';
      data: {
        turns: number;
        model: string;
        fallback_used: boolean;
        tokens: { in: number; out: number };
        cost_usd: number;
        /** additive (T168): the completion that wrote the answer; null when it got no signature */
        signature?: ModelSignature | null;
        /**
         * additive (T311): the prompt size of the chat's last model call, which is what the model is
         * holding. `tokens.in` adds up every call in the chat, so it can't say that.
         */
        context_tokens?: number;
        /**
         * additive (T370): what the conversation picked, when it picked. `model` is what answered, so
         * they differ after a fallback, and with `turns: 0` nothing answered at all.
         */
        picked?: string;
      };
    };

export type AgentEventName = AgentEvent['event'];

/** A stored chat (RunStore; GET /api/v1/agent/runs/:id). */
export interface Run {
  run_id: string;
  /** additive (T190): `stopped` by a person; `interrupted` by a restart. Both can be continued. */
  status: 'running' | 'done' | 'failed' | 'stopped' | 'interrupted';
  messages: ChatMessage[];
  events: AgentEvent[];
  draft?: Draft;
  flower?: FlowerResult;
  /** additive (T194): the exploration its flowers are saved in, once it has drawn one */
  exploration?: string;
  created_at: Datetime;
  updated_at: Datetime;
}
