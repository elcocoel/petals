// The index's tables (T198, data-model.md of spec 002). A property graph in plain SQL: no graph
// engine. Public, derived data only: every row comes from a stored snapshot, and the whole file can
// be deleted and rebuilt. Change the DDL and bump SCHEMA_VERSION: an index of another version is
// rebuilt, never migrated.
//
// Integer ids are hashes of what they name, so they don't depend on the order snapshots arrived in
// and a traversal's tie-breaks survive a rebuild. Answers never show them.
export const SCHEMA_VERSION = 1;

export const TABLES = `
CREATE TABLE snapshot (
  sha256 TEXT PRIMARY KEY,
  network TEXT NOT NULL,
  title TEXT NOT NULL,
  as_of TEXT NOT NULL
) WITHOUT ROWID;

-- A group over time: its module and parameters. "group" is reserved in SQL.
CREATE TABLE grp (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  chain TEXT NOT NULL,
  kind TEXT NOT NULL,
  measure TEXT NOT NULL,
  unit TEXT NOT NULL,
  title TEXT NOT NULL
);

-- A group at a date. latest = 1 on the one group_overlap compares.
CREATE TABLE observation (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL,
  snapshot_sha256 TEXT NOT NULL,
  as_of TEXT NOT NULL,
  as_of_s INTEGER NOT NULL,
  block_height INTEGER,
  final INTEGER NOT NULL,
  anchor_account INTEGER,
  members_named INTEGER NOT NULL,
  members_total INTEGER,
  tail_accounts INTEGER,
  amount_total TEXT NOT NULL,
  amount_named TEXT NOT NULL,
  named_share REAL NOT NULL,
  read_window TEXT,
  complete INTEGER NOT NULL,
  why_partial TEXT NOT NULL,
  latest INTEGER NOT NULL DEFAULT 0
);

-- An address string where it means one thing: eip155 across EVM chains, otherwise one chain.
CREATE TABLE node (
  id INTEGER PRIMARY KEY,
  scope TEXT NOT NULL,
  address TEXT NOT NULL
);

-- One id per chain: the same address on two chains is two accounts, and a match is an inference.
CREATE TABLE account (
  id INTEGER PRIMARY KEY,
  node_id INTEGER NOT NULL,
  chain TEXT NOT NULL
);

CREATE TABLE membership (
  observation_id INTEGER NOT NULL,
  node_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  amount TEXT NOT NULL,
  share REAL NOT NULL,
  rnk INTEGER NOT NULL,
  kind TEXT,
  identity TEXT,
  PRIMARY KEY (observation_id, node_id)
) WITHOUT ROWID;

-- What a traversal walks: accounts positive, observations negative. inferred = 1 joins two accounts
-- with one address on two EVM chains.
CREATE TABLE adj (
  src INTEGER NOT NULL,
  dst INTEGER NOT NULL,
  inferred INTEGER NOT NULL,
  PRIMARY KEY (src, dst)
) WITHOUT ROWID;

-- The latest observation of each group against the latest of every other, in both directions.
-- Weight is the sum of min(share_a, share_b): units don't add up across groups, and shares do.
CREATE TABLE group_overlap (
  a INTEGER NOT NULL,
  b INTEGER NOT NULL,
  a_obs INTEGER NOT NULL,
  b_obs INTEGER NOT NULL,
  shared INTEGER NOT NULL,
  weight REAL NOT NULL,
  share_a REAL NOT NULL,
  share_b REAL NOT NULL,
  inferred INTEGER NOT NULL,
  PRIMARY KEY (a, b)
) WITHOUT ROWID;

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
`;

/** Built after a full load, which is quicker than keeping them up to date during it. */
export const INDEXES = `
CREATE UNIQUE INDEX node_address ON node (address, scope);
CREATE UNIQUE INDEX account_node ON account (node_id, chain);
CREATE INDEX membership_by_node ON membership (node_id, observation_id, share);
CREATE INDEX observation_group ON observation (group_id, as_of_s);
CREATE INDEX observation_snapshot ON observation (snapshot_sha256);
CREATE INDEX observation_anchor ON observation (anchor_account) WHERE anchor_account IS NOT NULL;
CREATE INDEX observation_latest ON observation (latest, group_id);
CREATE INDEX group_overlap_count ON group_overlap (a, shared, b);
CREATE INDEX group_overlap_weight ON group_overlap (a, weight, b);
CREATE INDEX group_overlap_pairs ON group_overlap (shared, a, b);
`;

/** Tables whose rows are the index's whole content, each with an order that doesn't vary. */
export const CONTENT: readonly [table: string, order: string][] = [
  ['snapshot', 'sha256'],
  ['grp', 'id'],
  ['observation', 'id'],
  ['node', 'id'],
  ['account', 'id'],
  ['membership', 'observation_id, node_id'],
  ['adj', 'src, dst'],
  ['group_overlap', 'a, b'],
];
