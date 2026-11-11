// @petal/store (T189): private data, apart from public facts (SYS-002). Facts stay files by hash. The
// only way into the database: Postgres, or SQLite as the starting point (specs/003-target/proposal-database.md).

export {
  compareWithSqlite,
  copyFromSqlite,
  migrateAndGrant,
  ownerConnection,
  type TableCheck,
} from './admin.ts';
export type { Db, Engine, Param } from './db.ts';
export { MIGRATIONS, pgMigrations } from './migrations.ts';
export { openStore, type Store, type StoreSize, stateStore } from './open.ts';
export { type PgLimits, pgLimitsOf, redacted } from './postgres.ts';
export type {
  AgentLinkRow,
  AgentRow,
  AnnotationRow,
  ChallengeCheck,
  ConversationRow,
  CreditEntryRow,
  CreditRow,
  DatasetVersionRow,
  DraftRow,
  ExplorationLinkRow,
  ExplorationRow,
  FolderRow,
  FollowRow,
  InviteRow,
  JobRow,
  LayerRow,
  LedgerRow,
  MarkRow,
  MediaRow,
  NoteRow,
  PersonProfileRow,
  PersonRow,
  PersonViewRow,
  ProjectDataRow,
  ProposalsRow,
  PublishDraftRow,
  RunEventRow,
  RunRow,
  RunSummaryRow,
  SearchDoc,
  SearchHit,
  SearchText,
  SearchVectorRow,
  SessionRow,
  StepRow,
  TopUpRow,
  UsageRow,
  ValueRow,
  WalletBindingRow,
  WorkspaceNoteRow,
} from './tables.ts';
export { SEARCH_HIT_CLOSE, SEARCH_HIT_OPEN } from './tables.ts';
