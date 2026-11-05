// The schema: a numbered list, applied in order, once each. To change it, add to the end and never
// edit what has shipped. Columns follow specs/002-system/data-model.md. The SQL stays portable,
// because Postgres is a likely later move: DOUBLE PRECISION for money, ISO text for times.
export const MIGRATIONS: readonly string[] = [
  // 1: the tables the vertical line needs
  `
  CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE person (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  );
  CREATE TABLE wallet_binding (
    person TEXT NOT NULL REFERENCES person(id),
    caip10_encrypted TEXT NOT NULL,
    caip10_hash TEXT NOT NULL UNIQUE,
    proved_at TEXT NOT NULL
  );
  CREATE INDEX wallet_binding_person ON wallet_binding(person);
  CREATE TABLE session (
    hash TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE challenge (
    nonce TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'issued',
    used_at TEXT
  );

  CREATE TABLE run (
    id TEXT PRIMARY KEY,
    owner TEXT,
    exploration TEXT,
    status TEXT NOT NULL,
    model TEXT,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX run_owner ON run(owner, updated_at);
  CREATE TABLE run_event (
    run TEXT NOT NULL REFERENCES run(id),
    seq INTEGER NOT NULL,
    type TEXT NOT NULL,
    data TEXT NOT NULL,
    at TEXT NOT NULL,
    PRIMARY KEY (run, seq)
  );
  CREATE TABLE run_thread (
    run TEXT PRIMARY KEY REFERENCES run(id),
    messages TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE ledger (
    day TEXT PRIMARY KEY,
    usd DOUBLE PRECISION NOT NULL DEFAULT 0,
    reserved_usd DOUBLE PRECISION NOT NULL DEFAULT 0
  );
  CREATE TABLE credit (
    account_key TEXT PRIMARY KEY,
    balance_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
    reserved_usd DOUBLE PRECISION NOT NULL DEFAULT 0
  );
  CREATE TABLE credit_entry (
    id TEXT PRIMARY KEY,
    account_key TEXT NOT NULL,
    delta_usd DOUBLE PRECISION NOT NULL,
    reason TEXT NOT NULL,
    at TEXT NOT NULL
  );
  CREATE INDEX credit_entry_account ON credit_entry(account_key, at);
  CREATE TABLE invite (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    budget_usd DOUBLE PRECISION NOT NULL,
    spent_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
    expires_at TEXT,
    revoked_at TEXT
  );

  CREATE TABLE draft (
    sha256 TEXT PRIMARY KEY,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE publish_draft (
    entry_sha256 TEXT PRIMARY KEY,
    body TEXT NOT NULL,
    used_at TEXT
  );

  CREATE TABLE exploration (
    id TEXT PRIMARY KEY,
    owner TEXT,
    question TEXT NOT NULL,
    target TEXT,
    head TEXT,
    visibility TEXT NOT NULL DEFAULT 'private',
    share_token_hash TEXT UNIQUE,
    forked_from TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX exploration_owner ON exploration(owner, updated_at);
  CREATE TABLE step (
    exploration TEXT NOT NULL REFERENCES exploration(id),
    seq INTEGER NOT NULL,
    parent TEXT,
    spec_sha256 TEXT,
    recipe_sha256 TEXT,
    snapshot_sha256 TEXT,
    door TEXT,
    note TEXT,
    at TEXT NOT NULL,
    PRIMARY KEY (exploration, seq)
  );
  CREATE TABLE note (
    exploration TEXT NOT NULL REFERENCES exploration(id),
    seq INTEGER NOT NULL,
    author TEXT NOT NULL,
    text TEXT NOT NULL,
    at TEXT NOT NULL,
    PRIMARY KEY (exploration, seq)
  );
  `,
  // 2: sign-in. near:testnet: and near:mainnet: are different wallets, so every binding and session
  // says which. A session can hold a sponsored invite, anonymous or signed in.
  `
  ALTER TABLE wallet_binding ADD COLUMN network TEXT NOT NULL DEFAULT 'unknown';
  ALTER TABLE session ADD COLUMN network TEXT;
  ALTER TABLE session ADD COLUMN invite TEXT REFERENCES invite(id);
  `,
];
