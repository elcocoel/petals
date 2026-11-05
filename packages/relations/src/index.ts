// @petal/relations (T198): relations between groups, as rows in an index that can be deleted and
// rebuilt from stored snapshots. Public data only. SQLite through node:sqlite, no graph engine.
export {
  type RebuildReport,
  RelationsIndex,
  type SkippedSnapshot,
  type SnapshotSource,
  stateIndex,
} from './open.ts';
export {
  type Coverage,
  type GroupKind,
  groupBase,
  groupsOf,
  type Member,
  normalise,
  type ProjectedGroup,
  scopeOf,
} from './project.ts';
export {
  ABSENCE_IS_NOT_PROOF,
  DEFAULT_BUDGET,
  DEFAULT_MAX_DEPTH,
  type GroupObservation,
  type IndexFacts,
  MAX_BUDGET,
  MAX_DEPTH,
  type Match,
  type MembershipRow,
  NOT_COORDINATION,
  type PairFacts,
  type PathEnd,
  type PathHop,
  parseAccount,
  Queries,
  type RelatedRow,
  RelationsError,
  type SharedAccountRow,
} from './queries.ts';
export { SCHEMA_VERSION } from './schema.ts';
