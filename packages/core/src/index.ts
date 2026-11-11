// @petal/core (W1): schemas, types, canonical hash, validation, counting, conventions, renderer.
// No network, no disk (Biome refuses node: imports under src/). Signatures: contracts/packages.md.

export {
  BLOCS_DEFAULTS,
  BLOCS_METHOD,
  type BlocPair,
  type Blocs,
  type BlocsAsk,
  blocClaims,
  votingBlocs,
} from './blocs.ts';
export {
  accountRef,
  applyPolicy,
  assetRef,
  CHALLENGE_REASONS,
  CLAIM_KINDS,
  CONFIDENCE_BANDS,
  claimerRecord,
  claimId,
  claimRef,
  claimsFromMap,
  DEFAULT_LENS,
  distinctCounts,
  EVIDENCE_FIELD,
  EVIDENCE_TYPES,
  GROUNDS,
  groupRef,
  isMetaVerb,
  isVerb,
  kindOfIdentityStatus,
  LABEL_TAGS,
  makeClaim,
  observedClaims,
  parseRef,
  proposalRef,
  readSnapshot,
  SNAPSHOT_READER,
  targetOf,
  V2_VERBS,
  V4_VERBS,
  VERB_RULES,
  VERBS,
  validateClaim,
} from './claims/index.ts';
export {
  buildSpec,
  choicesFromSpec,
  DEFAULT_CONVENTION,
  diffSpecs,
  recipeHash,
  recipeOf,
} from './convention/index.ts';
export { exactValues, formatDecimal } from './decimal.ts';
export { BadInputError, InvalidSpecError } from './errors.ts';
export { compareFigures, computeFigures } from './figures/index.ts';
export { canonicalJson, entryId, sha256Hex, signedPart, specHash } from './hash.ts';
export {
  type Added,
  COMPOSED,
  checkLayer,
  composeView,
  LAYER_ROWS_MAX,
  LAYER_VERSION,
  type Layer,
  LayerError,
  layerHash,
  MEASURE_KINDS,
  type MeasureKind,
  SEAM_VERSION,
  type Standing,
} from './layers.ts';
export {
  MARK_VERSION,
  type Mark,
  type MarkLogo,
  type MarkSaid,
  type MarkStatus,
  validateMark,
} from './marks.ts';
export { NotImplementedError, notImplemented } from './not-implemented.ts';
export {
  baseFee,
  type Price,
  type Priced,
  priceHash,
  tipAllowed,
  tipOn,
  tipPercentOf,
} from './price.ts';
export { PRIMITIVES } from './primitives.ts';
export {
  type Outcome,
  PROPOSALS_VERSION,
  type Proposal,
  type Proposals,
  type ProposalVote,
  titleOf,
  type Vote,
  validateProposals,
} from './proposals.ts';
export { categoryOf, type ReadOptions, readFlower, readingHash } from './reading/index.ts';
export { PAINT, pictureQuery, renderFlower, SKINS } from './render/index.ts';
export { type LegendLook, legendItem } from './render/legend.ts';
export type { Skin } from './render/types.ts';
export { lookFills } from './render/wedge/keys.ts';
export { runSignal, setRunSignalSource } from './run-signal.ts';
export { schemas } from './schema/index.ts';
export {
  aboutKey,
  aboutOf,
  DATA_KINDS,
  type DataKind,
  mapOf,
  namePieces,
  SEAM_DOCUMENT_VERSION,
  type Seam,
  type SeamPiece,
  sameAbout,
  seamHash,
  seamOf,
  typePieces,
} from './seam.ts';
export { backerSegments } from './segments/backers.ts';
export { selectPetals } from './select.ts';
export type * from './types/index.ts';
export { validateSnapshot, validateSpec } from './validate/index.ts';
export {
  usdString,
  VALUE_VERSION,
  type Value,
  type ValuePrice,
  type ValueSupply,
  type ValueTotal,
  validateValue,
  valuePieces,
  valueTotals,
} from './values.ts';
export * from './versions.ts';
export { isView, viewProblem } from './view/check.ts';
export type { Dimension, Piece } from './view/index.ts';
export {
  ACCEPTS,
  DEFAULT_HASHES,
  DEFAULT_VIEW,
  DEFAULT_VIEW_V1,
  DEFAULT_VIEW_V2_0,
  DIMENSIONS,
  EVERY_FLOWER,
  FORMER_DEFAULTS,
  FROM_ANNOTATIONS,
  fits,
  inUse,
  latestView,
  viewHash,
} from './view/index.ts';
