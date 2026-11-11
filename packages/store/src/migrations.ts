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
  // 3: coming back. An exploration has any number of links, each a token stored only as a hash, each
  // revocable, so share_token_hash (one token, no scope) stays unused. Steps and notes say which door
  // and who wrote them, and a run can be found from its exploration.
  `
  CREATE TABLE exploration_link (
    id TEXT PRIMARY KEY,
    exploration TEXT NOT NULL REFERENCES exploration(id),
    scope TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    revoked_at TEXT
  );
  CREATE INDEX exploration_link_exploration ON exploration_link(exploration);
  ALTER TABLE step ADD COLUMN author TEXT;
  ALTER TABLE note ADD COLUMN door TEXT;
  CREATE INDEX run_exploration ON run(exploration, updated_at);
  `,
  // 4: hardening before public (T300). What a stranger's request prunes has an index, so no request
  // scans a table a stranger can grow. A draft says when it expires, so an old one can go. The daily
  // caps are counted here: one row a day for each thing capped, so a restart can't reset one.
  `
  CREATE INDEX challenge_expires ON challenge(expires_at);
  CREATE INDEX session_expires ON session(expires_at);
  ALTER TABLE publish_draft ADD COLUMN expires_at TEXT;
  CREATE INDEX publish_draft_expires ON publish_draft(expires_at);
  CREATE TABLE daily_count (
    day TEXT NOT NULL,
    what TEXT NOT NULL,
    n INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, what)
  );
  `,
  // 5: the workspace (T310; design/workspace-data.md). A run is a conversation, so it gains what a
  // person can change about one. A follow points at a wallet, address, DAO or network, and proves
  // nothing. A workspace_note is a person's own, and private: it stands apart from `note`, which link
  // holders read. search_doc and search are derived, and rebuild themselves if deleted. FTS5 is the one
  // thing here that isn't portable, and only the store's `search` knows about it.
  `
  ALTER TABLE run ADD COLUMN title TEXT;
  ALTER TABLE run ADD COLUMN settings TEXT;
  ALTER TABLE run ADD COLUMN hidden_at TEXT;

  CREATE TABLE follow (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    kind TEXT NOT NULL,
    ref TEXT NOT NULL,
    label TEXT,
    spec_sha256 TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (owner, ref)
  );
  CREATE INDEX follow_owner ON follow(owner, updated_at);

  CREATE TABLE workspace_note (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    author TEXT NOT NULL,
    about TEXT NOT NULL,
    text TEXT NOT NULL,
    evidence TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX workspace_note_owner ON workspace_note(owner, updated_at);
  CREATE INDEX workspace_note_about ON workspace_note(owner, about, updated_at);

  CREATE TABLE search_doc (
    id INTEGER PRIMARY KEY,
    owner TEXT NOT NULL,
    kind TEXT NOT NULL,
    ref TEXT NOT NULL,
    title TEXT NOT NULL,
    about TEXT,
    at TEXT NOT NULL,
    UNIQUE (owner, kind, ref)
  );
  CREATE INDEX search_doc_about ON search_doc(owner, about);
  CREATE VIRTUAL TABLE search USING fts5(
    title, text, tokenize = 'unicode61 remove_diacritics 2'
  );
  `,
  // 6: the credential behind each action (specs/003-target, TGT-005). An account is an id with many
  // linked wallets, and maybe many people: what authorised an action is the credential, kept with it, so
  // a later revocation never rewrites history. `wallet:<the binding's keyed hash>` for a session a
  // wallet opened, `link:<id>` for a continue link; null where there's none (an anonymous session).
  `
  ALTER TABLE session ADD COLUMN credential TEXT;
  ALTER TABLE exploration ADD COLUMN credential TEXT;
  ALTER TABLE step ADD COLUMN credential TEXT;
  ALTER TABLE note ADD COLUMN credential TEXT;
  ALTER TABLE follow ADD COLUMN credential TEXT;
  ALTER TABLE workspace_note ADD COLUMN credential TEXT;
  `,
  // 7: folders (004-workspace, W4): a person's own, named and arranged as in any IDE, and nested. A
  // conversation sits in one folder or at the top: a run if it's the site's, an exploration if it came
  // from another door. A folder's parent is checked at the end of its transaction, so a copy can add a
  // tree in any order.
  `
  CREATE TABLE folder (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    parent TEXT REFERENCES folder(id) DEFERRABLE INITIALLY DEFERRED,
    position INTEGER NOT NULL,
    credential TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX folder_owner ON folder(owner, parent, position);
  ALTER TABLE run ADD COLUMN folder TEXT REFERENCES folder(id);
  ALTER TABLE exploration ADD COLUMN folder TEXT REFERENCES folder(id);
  CREATE INDEX run_folder ON run(folder);
  CREATE INDEX exploration_folder ON exploration(folder);
  `,
  // 8: jobs (Elco, 9 Nov, B with C). Petals' agent on the page hands a job out in a project (an
  // exploration); the person's own agent takes it, does it on their machine and reports back. seq
  // keeps them in the order they were handed out. inputs and result are JSON.
  `
  CREATE TABLE job (
    id TEXT PRIMARY KEY,
    exploration TEXT NOT NULL REFERENCES exploration(id),
    seq INTEGER NOT NULL,
    run TEXT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    brief TEXT NOT NULL,
    inputs TEXT NOT NULL,
    status TEXT NOT NULL,
    result TEXT,
    failed TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX job_order ON job(exploration, seq);
  `,
  // 9: layers kept on the site (005, data.md, Elco 9 Nov: "anyone can add, fork and use the prior"; private
  // first). A layer is named by its hash and kept under its author, never changed. A dataset version is a
  // set of layer hashes about one address, and the version it came from (parent); seq orders an author's
  // versions of one address, so the last is their latest.
  `
  CREATE TABLE layer (
    owner TEXT NOT NULL,
    hash TEXT NOT NULL,
    about TEXT NOT NULL,
    standing TEXT NOT NULL,
    body TEXT NOT NULL,
    credential TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (owner, hash)
  );
  CREATE INDEX layer_about ON layer(owner, about);
  CREATE TABLE dataset_version (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    about TEXT NOT NULL,
    seq INTEGER NOT NULL,
    parent TEXT,
    layers TEXT NOT NULL,
    credential TEXT,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX dataset_version_order ON dataset_version(owner, about, seq);
  `,
  // 10: who made a layer, the git way, outside its hash (systems check, step 2): beside the author (owner),
  // the credential and the time that 9 keeps, the brain version the agent was given and the recipe it read
  // with. Empty for the layers kept before.
  `
  ALTER TABLE layer ADD COLUMN brain TEXT;
  ALTER TABLE layer ADD COLUMN recipe TEXT;
  `,
  // 11: agents across a person's projects (Elco, 9 Nov, agent-house-test.md). An agent link is a person's,
  // only its hash kept; it can only wait for jobs. An agent is a name a person's link was used with (`as`),
  // seen last at some time. A job can be sent to one agent by name, and says who took it.
  `
  CREATE TABLE agent_link (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    revoked_at TEXT
  );
  CREATE INDEX agent_link_owner ON agent_link(owner);
  CREATE TABLE agent (
    owner TEXT NOT NULL,
    key TEXT NOT NULL,
    name TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    PRIMARY KEY (owner, key)
  );
  ALTER TABLE job ADD COLUMN assignee TEXT;
  ALTER TABLE job ADD COLUMN taken_by TEXT;
  `,
  // 12: the person disconnects one of their agents (Elco, 10 Nov: "i dont see a way to disconnect my agents").
  // From then, no key made before it lets that name in; a key made after connects it again.
  `
  ALTER TABLE agent ADD COLUMN disconnected_at TEXT;
  `,
  // 13: one map (Elco, 10 Nov): a stored view gets a name and who made it, beside its hash and outside it, so
  // the map can be searched by name and says by whom. Empty for views nobody named.
  `
  ALTER TABLE draft ADD COLUMN name TEXT;
  ALTER TABLE draft ADD COLUMN made_by TEXT;
  `,
  // 14: conversations are named (Elco, 10 Nov): Petals' agent names its own after its first answer and
  // renames it when the subject changes; the person's own agents send a title with a note. A run says when
  // its title became a name, so until then it's still the first question. Empty for what nobody named.
  `
  ALTER TABLE run ADD COLUMN named_at TEXT;
  ALTER TABLE exploration ADD COLUMN title TEXT;
  `,
  // 15: a person's own (Elco, 10 Nov). Their view, the glasses every petal they see is drawn through
  // (one-source.md, step 1): views by their hash, and each person's current one. Their profile, in NEAR
  // Social's own shape (api2.near.social/standard.md, social-kv/1), so publishing later is a straight copy.
  // And the pictures in it, by their sha256, served from here so they show without anything on chain.
  // Each is the person's, not a wallet's; who saved it (the credential) and when are kept beside it.
  `
  CREATE TABLE view_doc (
    hash TEXT PRIMARY KEY,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE person_view (
    person TEXT PRIMARY KEY REFERENCES person(id),
    view TEXT NOT NULL REFERENCES view_doc(hash),
    credential TEXT,
    set_at TEXT NOT NULL
  );
  CREATE TABLE person_profile (
    person TEXT PRIMARY KEY REFERENCES person(id),
    body TEXT NOT NULL,
    credential TEXT,
    saved_at TEXT NOT NULL
  );
  CREATE TABLE media (
    sha256 TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    body TEXT NOT NULL,
    person TEXT,
    created_at TEXT NOT NULL
  );
  `,
  // 16: a conversation from another door can be archived too (Elco, 10 Nov: Archive and Delete in the
  // panel), as a run is with hidden_at. Empty for what nobody archived.
  `
  ALTER TABLE exploration ADD COLUMN hidden_at TEXT;
  `,
  // 17: a usage record for every model call (Elco, 10 Nov: "count usage like pros"; pricing-protocol.md):
  // usage/v1 as body, keyed by NEAR AI's inference id, with whose account paid, and NEAR AI's own bill once
  // it's known. Nothing rewrites a record but its bill and when it was reconciled.
  `
  CREATE TABLE usage (
    id TEXT PRIMARY KEY,
    account_key TEXT,
    run TEXT NOT NULL,
    at TEXT NOT NULL,
    body TEXT NOT NULL,
    billed_usd REAL,
    reconciled_at TEXT
  );
  CREATE INDEX usage_account ON usage(account_key, at);
  `,
  // 18: a person's tip (Elco, 10 Nov: price/v1's fees "multiplied by a user defined 'tip' rate"): theirs to
  // set, the price's default while it's empty.
  `
  ALTER TABLE person ADD COLUMN tip REAL;
  `,
  // 19: top-ups through NEAR Intents (Elco, 10 Nov: "let users pay with anything from anywhere"): each quote's
  // deposit address, whose it is, what was asked and quoted, where its swap stands, and what it became on
  // their credit once it landed.
  `
  CREATE TABLE top_up (
    deposit_address TEXT PRIMARY KEY,
    person TEXT NOT NULL,
    usd REAL NOT NULL,
    quote TEXT NOT NULL,
    status TEXT NOT NULL,
    credited_usd REAL,
    created_at TEXT NOT NULL,
    settled_at TEXT
  );
  CREATE INDEX top_up_person ON top_up(person, created_at);
  `,
  // 20: several workers per agent (Elco, 10 Nov, swarm.md step 1): each window or sub-agent that joins as
  // "Codex" waits as its own worker, so the page lists "Codex" and "Codex 2", each holding its own job.
  `
  CREATE TABLE agent_worker (
    owner TEXT NOT NULL,
    key TEXT NOT NULL,
    worker TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    PRIMARY KEY (owner, key, worker)
  );
  ALTER TABLE job ADD COLUMN taken_worker TEXT;
  `,
  // 21: annotations, what a person or an agent adds about an account (Elco, 10 Nov: "the agent and the
  // person can go CRAZY adding annotation"; coordinator/annotation-layer.md step 2). Each is a claim/v2,
  // kept privately under the project's owner, with the project it was added in. Names are allowed here.
  `
  CREATE TABLE annotation (
    owner TEXT NOT NULL,
    id TEXT NOT NULL,
    exploration TEXT NOT NULL,
    subject TEXT NOT NULL,
    verb TEXT NOT NULL,
    kind TEXT NOT NULL,
    body TEXT NOT NULL,
    credential TEXT,
    created_at TEXT NOT NULL,
    place INTEGER NOT NULL,
    PRIMARY KEY (owner, id)
  );
  CREATE INDEX annotation_exploration ON annotation(owner, exploration, created_at);
  CREATE INDEX annotation_subject ON annotation(owner, subject, created_at);
  `,
  // 22: a conversation per job (Elco, 10 Nov, swarm.md step 2): the job's work goes in its own exploration,
  // in the same folder, so the conversation that handed it out stays small however much the job reads.
  `
  ALTER TABLE job ADD COLUMN conversation TEXT;
  `,
  // 23: supervising a job without timers (Elco, 10 Nov, swarm.md step 3): the continue link its worker got, so
  // that worker's calls mark it alive (last_seen), and once it's stopped or handed on, are told so. Each link
  // a job was ever handed out on stays known, so an old worker is told, not just refused.
  `
  ALTER TABLE job ADD COLUMN link TEXT;
  ALTER TABLE job ADD COLUMN last_seen TEXT;
  CREATE TABLE job_link (
    link TEXT PRIMARY KEY,
    job TEXT NOT NULL
  );
  `,
  // 24: a job in parts (Elco, 10 Nov, swarm.md step 4): each part is a job of its own, for any worker, and
  // all share one group, so when the last one reports they're taken up together, as one.
  `
  ALTER TABLE job ADD COLUMN part_of TEXT;
  `,
  // 25: what tells one organisation on the map from another (board #85, Elco's pick, 11 Nov: the chain first,
  // then curated lists): one mark/v1 per map, named by the map's address, its name, symbol and logo each
  // saying where it came from. Its logo is a picture in media. Read again, a map's mark is replaced.
  `
  CREATE TABLE mark (
    about TEXT PRIMARY KEY,
    body TEXT NOT NULL,
    read_at TEXT NOT NULL
  );
  `,
];

/**
 * What Postgres needs before the migrations: accent-folding search (D8). `unaccent` is a trusted
 * extension, so the database's owner can add it. Run every start; it changes nothing the second time.
 */
export const PG_SETUP = `
  CREATE EXTENSION IF NOT EXISTS unaccent;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'petal_search') THEN
      CREATE TEXT SEARCH CONFIGURATION petal_search (COPY = simple);
      ALTER TEXT SEARCH CONFIGURATION petal_search
        ALTER MAPPING FOR hword, hword_part, word WITH unaccent, simple;
    END IF;
  END $$;
`;

/** The FTS5 table's Postgres twin: the same rowid, title and text, with its words kept for search. */
const PG_SEARCH = `CREATE TABLE search (
    rowid BIGINT PRIMARY KEY,
    title TEXT NOT NULL,
    text TEXT NOT NULL,
    tsv tsvector GENERATED ALWAYS AS (to_tsvector('petal_search'::regconfig, title || ' ' || text)) STORED
  );
  CREATE INDEX search_tsv ON search USING GIN (tsv);`;

/**
 * The same migrations, as Postgres takes them. The 2026-11-08 trial found only two differences in the
 * schema: SQLite's FTS5 search table, and the one id SQLite numbers by itself. Everything else is the
 * same text, so the two schemas can't drift apart.
 */
export function pgMigrations(migrations: readonly string[] = MIGRATIONS): string[] {
  return migrations.map((m) =>
    m
      .replace(/CREATE VIRTUAL TABLE search USING fts5\([\s\S]*?\);/, PG_SEARCH)
      .replace(
        /\bid INTEGER PRIMARY KEY,/g,
        'id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,',
      ),
  );
}
