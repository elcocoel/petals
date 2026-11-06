// Thin typed functions over the tables (specs/002-system/data-model.md). Behaviour lives in the
// packages that use them; what is here is only what has to be one atomic step in the database.
// Times are ISO strings from the caller, money is in USD.
import type { Db } from './open.ts';

export interface PersonRow {
  id: string;
  created_at: string;
}
export interface WalletBindingRow {
  person: string;
  /** near:testnet: and near:mainnet: are different wallets */
  network: string;
  caip10_encrypted: string;
  caip10_hash: string;
  proved_at: string;
}
/** `subject` is a person id, or an anonymous handle before sign-in. */
export interface SessionRow {
  hash: string;
  subject: string;
  /** the network of the wallet that signed in; null for an anonymous handle */
  network: string | null;
  /** the sponsored invite this session holds */
  invite: string | null;
  expires_at: string;
}
export type ChallengeCheck = 'ok' | 'unknown' | 'used' | 'expired';

export interface RunRow {
  id: string;
  /** a person id or an anonymous handle; never part of what a run's reader sees */
  owner: string | null;
  exploration: string | null;
  status: string;
  model: string | null;
  /** JSON, in the shape the run store chooses */
  body: string;
  /** a conversation's name: its first question until a person renames it; null on an older run */
  title?: string | null;
  /** JSON: the provider, model, effort and permissions picked. `model` above is what answered */
  settings?: string | null;
  hidden_at?: string | null;
  created_at: string;
  updated_at: string;
}
export type RunSummaryRow = Omit<RunRow, 'body'>;
/** A run in a person's list. `body` comes only when there's no title to show without it. */
export type ConversationRow = RunSummaryRow & { body: string | null };
export interface RunEventRow {
  run: string;
  seq: number;
  type: string;
  /** JSON */
  data: string;
  at: string;
}

export interface LedgerRow {
  day: string;
  usd: number;
  reserved_usd: number;
}
export interface CreditRow {
  account_key: string;
  balance_usd: number;
  reserved_usd: number;
}
export interface CreditEntryRow {
  id: string;
  account_key: string;
  delta_usd: number;
  reason: string;
  at: string;
}
export interface InviteRow {
  id: string;
  token_hash: string;
  budget_usd: number;
  spent_usd: number;
  expires_at: string | null;
  revoked_at: string | null;
}

export interface DraftRow {
  sha256: string;
  body: string;
  created_at: string;
}
export interface PublishDraftRow {
  entry_sha256: string;
  /** JSON */
  body: string;
  used_at: string | null;
  expires_at: string | null;
}

export interface ExplorationRow {
  id: string;
  owner: string | null;
  question: string;
  target: string | null;
  head: string | null;
  visibility: string;
  share_token_hash: string | null;
  forked_from: string | null;
  created_at: string;
  updated_at: string;
}
export interface StepRow {
  exploration: string;
  seq: number;
  parent: string | null;
  spec_sha256: string | null;
  recipe_sha256: string | null;
  snapshot_sha256: string | null;
  door: string | null;
  /** who wrote it, as a reader may see it: `owner` or `link:<id>`, never a person id */
  author: string | null;
  note: string | null;
  at: string;
}
export interface NoteRow {
  exploration: string;
  seq: number;
  /** who wrote it, as a reader may see it: `owner` or `link:<id>`, never a person id */
  author: string;
  door: string | null;
  text: string;
  at: string;
}
/** A bookmark on something a person is following. It points, and proves nothing about who owns it. */
export interface FollowRow {
  id: string;
  owner: string;
  /** `account` or `network` */
  kind: string;
  /** an account's EntityRef, or `network:<target_key>` */
  ref: string;
  label: string | null;
  /** the flower it last opened as */
  spec_sha256: string | null;
  created_at: string;
  updated_at: string;
}
/**
 * A person's own note, private to them. It keeps what a claim would need if it's ever published:
 * `about` is the subject, `author` the `by`, `created_at` the `issued_at`, `evidence` the evidence.
 */
export interface WorkspaceNoteRow {
  id: string;
  owner: string;
  /** `owner` today; never a person id */
  author: string;
  about: string;
  text: string;
  /** JSON: a list in the shape of a claim's evidence */
  evidence: string;
  created_at: string;
  updated_at: string;
}
/** One thing search can find. With no text it's only a marker: indexed as of `at`, and never a hit. */
export interface SearchDoc {
  owner: string;
  kind: string;
  ref: string;
  title: string;
  about: string | null;
  at: string;
}
export type SearchHit = Omit<SearchDoc, 'owner'> & { snippet: string };
/** What marks a match inside a hit's snippet. Stripped from anything indexed, so no text can forge one. */
export const SEARCH_HIT_OPEN = '\uE000';
export const SEARCH_HIT_CLOSE = '\uE001';
/** A way into an exploration without being its owner. Only the token's hash is stored. */
export interface ExplorationLinkRow {
  id: string;
  exploration: string;
  scope: string;
  token_hash: string;
  created_at: string;
  revoked_at: string | null;
}

/** How much of `wanted` fits in what is left, or null when nothing is. */
function holdable(wanted: number, left: number): number | null {
  return left > 0 ? Math.min(wanted, left) : null;
}

export function tables(db: Db) {
  const nextSeq = (table: 'run_event' | 'step' | 'note', column: string, id: string): number =>
    (
      db.get<{ next: number }>(
        `SELECT COALESCE(MAX(seq) + 1, 0) AS next FROM ${table} WHERE ${column} = ?`,
        id,
      ) as { next: number }
    ).next;

  const ledgerRow = (day: string): LedgerRow =>
    db.get<LedgerRow>('SELECT day, usd, reserved_usd FROM ledger WHERE day = ?', day) ?? {
      day,
      usd: 0,
      reserved_usd: 0,
    };
  const writeLedger = (r: LedgerRow) => {
    db.run(
      `INSERT INTO ledger (day, usd, reserved_usd) VALUES (?, ?, ?)
       ON CONFLICT (day) DO UPDATE SET usd = excluded.usd, reserved_usd = excluded.reserved_usd`,
      r.day,
      r.usd,
      r.reserved_usd,
    );
  };

  const creditRow = (account: string) =>
    db.get<CreditRow>(
      'SELECT account_key, balance_usd, reserved_usd FROM credit WHERE account_key = ?',
      account,
    );
  const writeCredit = (r: CreditRow) => {
    db.run(
      `INSERT INTO credit (account_key, balance_usd, reserved_usd) VALUES (?, ?, ?)
       ON CONFLICT (account_key) DO UPDATE SET
         balance_usd = excluded.balance_usd, reserved_usd = excluded.reserved_usd`,
      r.account_key,
      r.balance_usd,
      r.reserved_usd,
    );
  };

  const countOf = (what: string, day: string) =>
    db.get<{ n: number }>('SELECT n FROM daily_count WHERE day = ? AND what = ?', day, what)?.n ??
    0;

  return {
    /** One number a day for each thing capped: the caps a restart must not reset. */
    dailyCount: {
      get: countOf,
      /** Counts one more of `what` today, and true; false, and no change, at the cap. */
      take: (what: string, day: string, cap: number): boolean =>
        db.tx(() => {
          db.run('DELETE FROM daily_count WHERE day < ?', day);
          if (countOf(what, day) >= cap) return false;
          db.run(
            `INSERT INTO daily_count (day, what, n) VALUES (?, ?, 1)
             ON CONFLICT (day, what) DO UPDATE SET n = n + 1`,
            day,
            what,
          );
          return true;
        }),
    },

    meta: {
      get: (key: string) =>
        db.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', key)?.value ?? null,
      set(key: string, value: string) {
        db.run(
          `INSERT INTO meta (key, value) VALUES (?, ?)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
          key,
          value,
        );
      },
    },

    person: {
      create(r: PersonRow) {
        db.run('INSERT INTO person (id, created_at) VALUES (?, ?)', r.id, r.created_at);
      },
      get: (id: string) => db.get<PersonRow>('SELECT * FROM person WHERE id = ?', id),
      list: () => db.all<PersonRow>('SELECT * FROM person ORDER BY created_at, id'),
    },

    walletBinding: {
      /** False when this wallet is already bound, to anyone. */
      bind: (r: WalletBindingRow) =>
        db.run(
          `INSERT INTO wallet_binding (person, network, caip10_encrypted, caip10_hash, proved_at)
           VALUES (?, ?, ?, ?, ?) ON CONFLICT (caip10_hash) DO NOTHING`,
          r.person,
          r.network,
          r.caip10_encrypted,
          r.caip10_hash,
          r.proved_at,
        ) === 1,
      byHash: (hash: string) =>
        db.get<WalletBindingRow>('SELECT * FROM wallet_binding WHERE caip10_hash = ?', hash),
      ofPerson: (person: string) =>
        db.all<WalletBindingRow>('SELECT * FROM wallet_binding WHERE person = ?', person),
    },

    session: {
      put(r: Pick<SessionRow, 'hash' | 'subject' | 'expires_at'> & Partial<SessionRow>) {
        db.run(
          'INSERT INTO session (hash, subject, network, invite, expires_at) VALUES (?, ?, ?, ?, ?)',
          r.hash,
          r.subject,
          r.network ?? null,
          r.invite ?? null,
          r.expires_at,
        );
      },
      setInvite(hash: string, invite: string) {
        db.run('UPDATE session SET invite = ? WHERE hash = ?', invite, hash);
      },
      /** Null once expired. */
      get: (hash: string, now: string) =>
        db.get<SessionRow>('SELECT * FROM session WHERE hash = ? AND expires_at > ?', hash, now),
      delete(hash: string) {
        db.run('DELETE FROM session WHERE hash = ?', hash);
      },
      deleteExpired(now: string) {
        db.run('DELETE FROM session WHERE expires_at <= ?', now);
      },
    },

    /** Single-use nonces: reserved while a proof is checked, spent or released after. */
    challenge: {
      put(nonce: string, expiresAt: string, now: string) {
        db.run('DELETE FROM challenge WHERE expires_at <= ?', now);
        db.run('INSERT INTO challenge (nonce, expires_at) VALUES (?, ?)', nonce, expiresAt);
      },
      /** One UPDATE, so one caller gets 'ok', from any connection. */
      reserve(nonce: string, now: string): ChallengeCheck {
        const took = db.run(
          `UPDATE challenge SET state = 'checking'
           WHERE nonce = ? AND state = 'issued' AND expires_at > ?`,
          nonce,
          now,
        );
        if (took === 1) return 'ok';
        const row = db.get<{ state: string }>('SELECT state FROM challenge WHERE nonce = ?', nonce);
        if (!row) return 'unknown';
        return row.state === 'issued' ? 'expired' : 'used';
      },
      spend(nonce: string, now: string) {
        db.run(`UPDATE challenge SET state = 'used', used_at = ? WHERE nonce = ?`, now, nonce);
      },
      release(nonce: string) {
        db.run(
          `UPDATE challenge SET state = 'issued' WHERE nonce = ? AND state = 'checking'`,
          nonce,
        );
      },
    },

    run: {
      insert(r: RunRow) {
        db.run(
          `INSERT INTO run (id, owner, exploration, status, model, body, title, settings,
                            created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          r.id,
          r.owner,
          r.exploration,
          r.status,
          r.model,
          r.body,
          r.title ?? null,
          r.settings ?? null,
          r.created_at,
          r.updated_at,
        );
      },
      get: (id: string) => db.get<RunRow>('SELECT * FROM run WHERE id = ?', id),
      update(id: string, f: Pick<RunRow, 'status' | 'model' | 'body' | 'updated_at'>) {
        db.run(
          'UPDATE run SET status = ?, model = ?, body = ?, updated_at = ? WHERE id = ?',
          f.status,
          f.model,
          f.body,
          f.updated_at,
          id,
        );
      },
      /** Compare and swap: false unless the current owner is `from` (default none). */
      setOwner: (id: string, owner: string, from: string | null = null) =>
        (from === null
          ? db.run('UPDATE run SET owner = ? WHERE id = ? AND owner IS NULL', owner, id)
          : db.run('UPDATE run SET owner = ? WHERE id = ? AND owner = ?', owner, id, from)) === 1,
      /** Every run of `from` now belongs to `to`, in one statement. Returns how many moved. */
      moveOwner: (from: string, to: string): number =>
        db.run('UPDATE run SET owner = ? WHERE owner = ?', to, from),
      idsWithStatus: (status: string) =>
        db.all<{ id: string }>('SELECT id FROM run WHERE status = ?', status).map((r) => r.id),
      /** How many runs each owner holds, none first. What a one-off script needs to see a store's shape. */
      ownerCounts: () =>
        db.all<{ owner: string | null; n: number }>(
          'SELECT owner, count(*) AS n FROM run GROUP BY owner ORDER BY owner IS NOT NULL, owner',
        ),
      /** The runs nobody owns, older than owners: anyone with the id can read them. */
      withoutOwner: () =>
        db.all<{ id: string; exploration: string | null }>(
          'SELECT id, exploration FROM run WHERE owner IS NULL',
        ),
      /** Newest first. */
      listByOwner: (owner: string, limit = 50) =>
        db.all<RunSummaryRow>(
          `SELECT id, owner, exploration, status, model, created_at, updated_at FROM run
           WHERE owner = ? ORDER BY updated_at DESC LIMIT ?`,
          owner,
          limit,
        ),
      setExploration(id: string, exploration: string) {
        db.run('UPDATE run SET exploration = ? WHERE id = ?', exploration, id);
      },
      /** A person's list, newest first: the hidden ones, or the rest. */
      conversations: (owner: string, limit: number, hidden: boolean) =>
        db.all<ConversationRow>(
          `SELECT id, owner, exploration, status, model, title, settings, hidden_at, created_at,
                  updated_at, CASE WHEN title IS NULL THEN body END AS body
           FROM run WHERE owner = ? AND hidden_at IS ${hidden ? 'NOT ' : ''}NULL
           ORDER BY updated_at DESC LIMIT ?`,
          owner,
          limit,
        ),
      // These three leave updated_at alone: renaming or hiding one isn't talking in it.
      setTitle(id: string, title: string) {
        db.run('UPDATE run SET title = ? WHERE id = ?', title, id);
      },
      setSettings(id: string, settings: string) {
        db.run('UPDATE run SET settings = ? WHERE id = ?', settings, id);
      },
      setHidden(id: string, at: string | null) {
        db.run('UPDATE run SET hidden_at = ? WHERE id = ?', at, id);
      },
      /** The run that last worked on this exploration, if any. */
      latestOfExploration: (exploration: string) =>
        db.get<{ id: string }>(
          'SELECT id FROM run WHERE exploration = ? ORDER BY updated_at DESC LIMIT 1',
          exploration,
        )?.id ?? null,
    },

    runEvent: {
      /** Only the events of one type, oldest first: a turn's figures are in its `done`. */
      ofType: (run: string, type: string) =>
        db.all<RunEventRow>(
          'SELECT * FROM run_event WHERE run = ? AND type = ? ORDER BY seq',
          run,
          type,
        ),
      /** Append-only. Returns the event's sequence number: 0, 1, 2… within the run. */
      append: (run: string, type: string, data: string, at: string): number =>
        db.tx(() => {
          const seq = nextSeq('run_event', 'run', run);
          db.run(
            'INSERT INTO run_event (run, seq, type, data, at) VALUES (?, ?, ?, ?, ?)',
            run,
            seq,
            type,
            data,
            at,
          );
          return seq;
        }),
      /** From sequence number `from` on, oldest first. */
      list: (run: string, from = 0) =>
        db.all<RunEventRow>(
          'SELECT * FROM run_event WHERE run = ? AND seq >= ? ORDER BY seq',
          run,
          from,
        ),
    },

    runThread: {
      save(run: string, messages: string, at: string) {
        db.run(
          `INSERT INTO run_thread (run, messages, updated_at) VALUES (?, ?, ?)
           ON CONFLICT (run) DO UPDATE SET
             messages = excluded.messages, updated_at = excluded.updated_at`,
          run,
          messages,
          at,
        );
      },
      get: (run: string) =>
        db.get<{ messages: string }>('SELECT messages FROM run_thread WHERE run = ?', run)
          ?.messages ?? null,
    },

    /** One row a day. What counts against the cap is usd + reserved_usd. */
    ledger: {
      get: ledgerRow,
      add: (day: string, usd: number) =>
        db.tx(() => {
          const r = ledgerRow(day);
          writeLedger({ ...r, usd: r.usd + usd });
        }),
      /** Holds up to `usd` under the cap. Returns the amount held, or null when nothing is left. */
      reserve: (day: string, usd: number, capUsd: number): number | null =>
        db.tx(() => {
          const r = ledgerRow(day);
          const held = holdable(usd, capUsd - r.usd - r.reserved_usd);
          if (held !== null) writeLedger({ ...r, reserved_usd: r.reserved_usd + held });
          return held;
        }),
      /** Swaps a hold for what was really spent. */
      settle: (day: string, heldUsd: number, actualUsd: number) =>
        db.tx(() => {
          const r = ledgerRow(day);
          writeLedger({
            day,
            usd: r.usd + actualUsd,
            reserved_usd: Math.max(0, r.reserved_usd - heldUsd),
          });
        }),
      /**
       * Every hold on every day counted as spent, and how much that was: for when no call can be in
       * flight. What a call cut off by a crash really cost can't be known, so it's never less than this.
       */
      spendHolds: (): number =>
        db.tx(() => {
          const held =
            db.get<{ usd: number }>('SELECT SUM(reserved_usd) AS usd FROM ledger')?.usd ?? 0;
          db.run(
            'UPDATE ledger SET usd = usd + reserved_usd, reserved_usd = 0 WHERE reserved_usd <> 0',
          );
          return held;
        }),
      /** A day's starting figure, if the day has none yet. */
      seed(day: string, usd: number) {
        db.run(
          'INSERT INTO ledger (day, usd, reserved_usd) VALUES (?, ?, 0) ON CONFLICT (day) DO NOTHING',
          day,
          usd,
        );
      },
    },

    /** A generic account balance. An entry's id can only ever count once. */
    credit: {
      get: creditRow,
      /** False, and no change, when this id was already applied. */
      apply: (e: CreditEntryRow): boolean =>
        db.tx(() => {
          const fresh = db.run(
            `INSERT INTO credit_entry (id, account_key, delta_usd, reason, at)
             VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
            e.id,
            e.account_key,
            e.delta_usd,
            e.reason,
            e.at,
          );
          if (fresh !== 1) return false;
          const r = creditRow(e.account_key) ?? {
            account_key: e.account_key,
            balance_usd: 0,
            reserved_usd: 0,
          };
          writeCredit({ ...r, balance_usd: r.balance_usd + e.delta_usd });
          return true;
        }),
      entries: (account: string) =>
        db.all<CreditEntryRow>(
          'SELECT * FROM credit_entry WHERE account_key = ? ORDER BY at, id',
          account,
        ),
      /** Holds up to `usd` of the balance. Returns the amount held, or null when nothing is left. */
      reserve: (account: string, usd: number): number | null =>
        db.tx(() => {
          const r = creditRow(account);
          if (!r) return null;
          const held = holdable(usd, r.balance_usd - r.reserved_usd);
          if (held !== null) writeCredit({ ...r, reserved_usd: r.reserved_usd + held });
          return held;
        }),
      /** Every hold counted as spent, with an entry for each: the same rule as the ledger's. */
      spendHolds: (at: string): { account_key: string; usd: number }[] =>
        db.tx(() => {
          const held = db.all<CreditRow>('SELECT * FROM credit WHERE reserved_usd <> 0');
          for (const r of held) {
            db.run(
              `INSERT INTO credit_entry (id, account_key, delta_usd, reason, at)
               VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
              `crash:${r.account_key}:${at}`,
              r.account_key,
              -r.reserved_usd,
              'held at a restart',
              at,
            );
            writeCredit({ ...r, balance_usd: r.balance_usd - r.reserved_usd, reserved_usd: 0 });
          }
          return held.map((r) => ({ account_key: r.account_key, usd: r.reserved_usd }));
        }),
      /** Swaps a hold for what was really spent. */
      settle: (account: string, heldUsd: number, actualUsd: number) =>
        db.tx(() => {
          const r = creditRow(account);
          if (!r) throw new Error(`no credit account ${account}`);
          writeCredit({
            account_key: account,
            balance_usd: r.balance_usd - actualUsd,
            reserved_usd: Math.max(0, r.reserved_usd - heldUsd),
          });
        }),
    },

    invite: {
      create(r: Omit<InviteRow, 'spent_usd' | 'revoked_at'>) {
        db.run(
          'INSERT INTO invite (id, token_hash, budget_usd, expires_at) VALUES (?, ?, ?, ?)',
          r.id,
          r.token_hash,
          r.budget_usd,
          r.expires_at,
        );
      },
      get: (id: string) => db.get<InviteRow>('SELECT * FROM invite WHERE id = ?', id),
      byTokenHash: (hash: string) =>
        db.get<InviteRow>('SELECT * FROM invite WHERE token_hash = ?', hash),
      revoke(id: string, at: string) {
        db.run('UPDATE invite SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', at, id);
      },
      addSpent(id: string, usd: number) {
        db.run('UPDATE invite SET spent_usd = spent_usd + ? WHERE id = ?', usd, id);
      },
    },

    /** Hash-addressed draft links (SYS-043): put-if-absent. */
    draft: {
      /** False when this hash is already stored. */
      put: (r: DraftRow) =>
        db.run(
          'INSERT INTO draft (sha256, body, created_at) VALUES (?, ?, ?) ON CONFLICT (sha256) DO NOTHING',
          r.sha256,
          r.body,
          r.created_at,
        ) === 1,
      get: (sha256: string) => db.get<DraftRow>('SELECT * FROM draft WHERE sha256 = ?', sha256),
    },

    /** Entries prepared for a maker's signature (prepare_publish). */
    publishDraft: {
      /** A new prepare replaces the old one, used or not: it carries a new nonce. */
      put(entrySha256: string, body: string, expiresAt: string) {
        db.run(
          `INSERT INTO publish_draft (entry_sha256, body, used_at, expires_at) VALUES (?, ?, NULL, ?)
           ON CONFLICT (entry_sha256) DO UPDATE SET
             body = excluded.body, used_at = NULL, expires_at = excluded.expires_at`,
          entrySha256,
          body,
          expiresAt,
        );
      },
      /** A draft from before drafts said when they expire has none, and goes too. */
      deleteExpired(now: string) {
        db.run('DELETE FROM publish_draft WHERE expires_at <= ? OR expires_at IS NULL', now);
      },
      get: (entrySha256: string) =>
        db.get<PublishDraftRow>('SELECT * FROM publish_draft WHERE entry_sha256 = ?', entrySha256),
      /** One UPDATE, so one caller gets true, from any connection. */
      claim: (entrySha256: string, at: string) =>
        db.run(
          'UPDATE publish_draft SET used_at = ? WHERE entry_sha256 = ? AND used_at IS NULL',
          at,
          entrySha256,
        ) === 1,
    },

    exploration: {
      create(r: ExplorationRow) {
        db.run(
          `INSERT INTO exploration (id, owner, question, target, head, visibility,
             share_token_hash, forked_from, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          r.id,
          r.owner,
          r.question,
          r.target,
          r.head,
          r.visibility,
          r.share_token_hash,
          r.forked_from,
          r.created_at,
          r.updated_at,
        );
      },
      get: (id: string) => db.get<ExplorationRow>('SELECT * FROM exploration WHERE id = ?', id),
      byShareToken: (hash: string) =>
        db.get<ExplorationRow>('SELECT * FROM exploration WHERE share_token_hash = ?', hash),
      idsWithStatus: (status: string) =>
        db.all<{ id: string }>('SELECT id FROM run WHERE status = ?', status).map((r) => r.id),
      /** Newest first. */
      listByOwner: (owner: string, limit = 50) =>
        db.all<ExplorationRow>(
          'SELECT * FROM exploration WHERE owner = ? ORDER BY updated_at DESC LIMIT ?',
          owner,
          limit,
        ),
      /** Compare and swap on the ref: false unless the head is still `expected`. */
      moveHead: (id: string, expected: string | null, head: string, at: string) =>
        (expected === null
          ? db.run(
              'UPDATE exploration SET head = ?, updated_at = ? WHERE id = ? AND head IS NULL',
              head,
              at,
              id,
            )
          : db.run(
              'UPDATE exploration SET head = ?, updated_at = ? WHERE id = ? AND head = ?',
              head,
              at,
              id,
              expected,
            )) === 1,
      setSharing(id: string, visibility: string, shareTokenHash: string | null, at: string) {
        db.run(
          'UPDATE exploration SET visibility = ?, share_token_hash = ?, updated_at = ? WHERE id = ?',
          visibility,
          shareTokenHash,
          at,
          id,
        );
      },
      /** What it's about now: the target of its latest step. */
      setTarget(id: string, target: string | null) {
        db.run('UPDATE exploration SET target = ? WHERE id = ?', target, id);
      },
      touch(id: string, at: string) {
        db.run('UPDATE exploration SET updated_at = ? WHERE id = ?', at, id);
      },
      /** Work from another door: theirs, and no conversation on this site has touched it. */
      withoutRun: (owner: string, limit: number) =>
        db.all<ExplorationRow>(
          `SELECT * FROM exploration e WHERE e.owner = ?
             AND NOT EXISTS (SELECT 1 FROM run r WHERE r.exploration = e.id)
           ORDER BY e.updated_at DESC LIMIT ?`,
          owner,
          limit,
        ),
      /** Every exploration of `from` now belongs to `to`, in one statement. */
      moveOwner: (from: string, to: string): number =>
        db.run('UPDATE exploration SET owner = ? WHERE owner = ?', to, from),
      /**
       * Up to `limit` that nobody owns and nobody has touched since `before`, with their steps, notes
       * and links. Returns how many went. A limit, so one request never waits on a long delete.
       */
      deleteUnclaimed: (before: string, limit: number): number =>
        db.tx(() => {
          const gone = db.all<{ id: string }>(
            'SELECT id FROM exploration WHERE owner IS NULL AND updated_at < ? LIMIT ?',
            before,
            limit,
          );
          for (const { id } of gone) {
            db.run('DELETE FROM step WHERE exploration = ?', id);
            db.run('DELETE FROM note WHERE exploration = ?', id);
            db.run('DELETE FROM exploration_link WHERE exploration = ?', id);
            db.run('DELETE FROM exploration WHERE id = ?', id);
          }
          return gone.length;
        }),
      /** Compare and swap: false unless the current owner is `from` (default none). */
      setOwner: (id: string, owner: string, from: string | null = null) =>
        (from === null
          ? db.run('UPDATE exploration SET owner = ? WHERE id = ? AND owner IS NULL', owner, id)
          : db.run(
              'UPDATE exploration SET owner = ? WHERE id = ? AND owner = ?',
              owner,
              id,
              from,
            )) === 1,
    },

    /** Ways into an exploration: a token's hash, a scope, and a time it stopped working. */
    explorationLink: {
      create(r: Omit<ExplorationLinkRow, 'revoked_at'>) {
        db.run(
          `INSERT INTO exploration_link (id, exploration, scope, token_hash, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          r.id,
          r.exploration,
          r.scope,
          r.token_hash,
          r.created_at,
        );
      },
      /** Revoked links too: the caller decides what that means. */
      byTokenHash: (hash: string) =>
        db.get<ExplorationLinkRow>('SELECT * FROM exploration_link WHERE token_hash = ?', hash),
      /** Oldest first. */
      list: (exploration: string) =>
        db.all<ExplorationLinkRow>(
          'SELECT * FROM exploration_link WHERE exploration = ? ORDER BY created_at, id',
          exploration,
        ),
      /** False when this exploration has no such link, or it's already revoked. */
      revoke: (exploration: string, id: string, at: string) =>
        db.run(
          `UPDATE exploration_link SET revoked_at = ?
           WHERE id = ? AND exploration = ? AND revoked_at IS NULL`,
          at,
          id,
          exploration,
        ) === 1,
    },

    step: {
      /** Returns the step's sequence number: 0, 1, 2… within the exploration. */
      append: (r: Omit<StepRow, 'seq' | 'author'> & { author?: string | null }): number =>
        db.tx(() => {
          const seq = nextSeq('step', 'exploration', r.exploration);
          db.run(
            `INSERT INTO step (exploration, seq, parent, spec_sha256, recipe_sha256,
               snapshot_sha256, door, author, note, at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            r.exploration,
            seq,
            r.parent,
            r.spec_sha256,
            r.recipe_sha256,
            r.snapshot_sha256,
            r.door,
            r.author ?? null,
            r.note,
            r.at,
          );
          return seq;
        }),
      list: (exploration: string) =>
        db.all<StepRow>('SELECT * FROM step WHERE exploration = ? ORDER BY seq', exploration),
      count: (exploration: string) =>
        (
          db.get<{ n: number }>(
            'SELECT COUNT(*) AS n FROM step WHERE exploration = ?',
            exploration,
          ) as { n: number }
        ).n,
    },

    note: {
      /** Returns the note's sequence number: 0, 1, 2… within the exploration. */
      append: (r: Omit<NoteRow, 'seq' | 'door'> & { door?: string | null }): number =>
        db.tx(() => {
          const seq = nextSeq('note', 'exploration', r.exploration);
          db.run(
            'INSERT INTO note (exploration, seq, author, door, text, at) VALUES (?, ?, ?, ?, ?, ?)',
            r.exploration,
            seq,
            r.author,
            r.door ?? null,
            r.text,
            r.at,
          );
          return seq;
        }),
      list: (exploration: string) =>
        db.all<NoteRow>('SELECT * FROM note WHERE exploration = ? ORDER BY seq', exploration),
      count: (exploration: string) =>
        (
          db.get<{ n: number }>(
            'SELECT COUNT(*) AS n FROM note WHERE exploration = ?',
            exploration,
          ) as { n: number }
        ).n,
    },

    follow: {
      /** False when this owner already follows this ref: the row they have stands. */
      insert: (r: FollowRow) =>
        db.run(
          `INSERT INTO follow (id, owner, kind, ref, label, spec_sha256, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (owner, ref) DO NOTHING`,
          r.id,
          r.owner,
          r.kind,
          r.ref,
          r.label,
          r.spec_sha256,
          r.created_at,
          r.updated_at,
        ) === 1,
      get: (id: string) => db.get<FollowRow>('SELECT * FROM follow WHERE id = ?', id),
      byRef: (owner: string, ref: string) =>
        db.get<FollowRow>('SELECT * FROM follow WHERE owner = ? AND ref = ?', owner, ref),
      /** Newest first. */
      list: (owner: string, limit: number) =>
        db.all<FollowRow>(
          'SELECT * FROM follow WHERE owner = ? ORDER BY updated_at DESC LIMIT ?',
          owner,
          limit,
        ),
      count: (owner: string) =>
        (
          db.get<{ n: number }>('SELECT COUNT(*) AS n FROM follow WHERE owner = ?', owner) as {
            n: number;
          }
        ).n,
      update(id: string, f: Pick<FollowRow, 'label' | 'spec_sha256' | 'updated_at'>) {
        db.run(
          'UPDATE follow SET label = ?, spec_sha256 = ?, updated_at = ? WHERE id = ?',
          f.label,
          f.spec_sha256,
          f.updated_at,
          id,
        );
      },
      delete(id: string) {
        db.run('DELETE FROM follow WHERE id = ?', id);
      },
      /** At sign-in. What the person already follows stays as it is, so nothing is followed twice. */
      moveOwner(from: string, to: string) {
        db.run('UPDATE OR IGNORE follow SET owner = ? WHERE owner = ?', to, from);
        db.run('DELETE FROM follow WHERE owner = ?', from);
      },
    },

    workspaceNote: {
      insert(r: WorkspaceNoteRow) {
        db.run(
          `INSERT INTO workspace_note (id, owner, author, about, text, evidence, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          r.id,
          r.owner,
          r.author,
          r.about,
          r.text,
          r.evidence,
          r.created_at,
          r.updated_at,
        );
      },
      get: (id: string) =>
        db.get<WorkspaceNoteRow>('SELECT * FROM workspace_note WHERE id = ?', id),
      /** Newest first; `about` narrows it to one thing. */
      list: (owner: string, about: string | null, limit: number) =>
        about === null
          ? db.all<WorkspaceNoteRow>(
              'SELECT * FROM workspace_note WHERE owner = ? ORDER BY updated_at DESC LIMIT ?',
              owner,
              limit,
            )
          : db.all<WorkspaceNoteRow>(
              `SELECT * FROM workspace_note WHERE owner = ? AND about = ?
               ORDER BY updated_at DESC LIMIT ?`,
              owner,
              about,
              limit,
            ),
      count: (owner: string) =>
        (
          db.get<{ n: number }>(
            'SELECT COUNT(*) AS n FROM workspace_note WHERE owner = ?',
            owner,
          ) as { n: number }
        ).n,
      update(id: string, f: Pick<WorkspaceNoteRow, 'text' | 'evidence' | 'updated_at'>) {
        db.run(
          'UPDATE workspace_note SET text = ?, evidence = ?, updated_at = ? WHERE id = ?',
          f.text,
          f.evidence,
          f.updated_at,
          id,
        );
      },
      delete(id: string) {
        db.run('DELETE FROM workspace_note WHERE id = ?', id);
      },
      moveOwner(from: string, to: string) {
        db.run('UPDATE workspace_note SET owner = ? WHERE owner = ?', to, from);
      },
    },

    /** Derived: deleting all of it loses nothing, because a search catches up on what's missing. */
    search: {
      /** One document, new or replacing what's there. No text makes it a marker. */
      put: (doc: SearchDoc, text: string | null) =>
        db.tx(() => {
          const clean = (s: string) =>
            s.replaceAll(SEARCH_HIT_OPEN, ' ').replaceAll(SEARCH_HIT_CLOSE, ' ');
          const { id } = db.get<{ id: number }>(
            `INSERT INTO search_doc (owner, kind, ref, title, about, at) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (owner, kind, ref) DO UPDATE SET
               title = excluded.title, about = excluded.about, at = excluded.at
             RETURNING id`,
            doc.owner,
            doc.kind,
            doc.ref,
            doc.title,
            doc.about,
            doc.at,
          ) as { id: number };
          db.run('DELETE FROM search WHERE rowid = ?', id);
          if (text !== null) {
            db.run(
              'INSERT INTO search (rowid, title, text) VALUES (?, ?, ?)',
              id,
              clean(doc.title),
              clean(text),
            );
          }
        }),
      forget(owner: string, kind: string, ref: string) {
        db.tx(() => {
          db.run(
            `DELETE FROM search WHERE rowid IN
               (SELECT id FROM search_doc WHERE owner = ? AND kind = ? AND ref = ?)`,
            owner,
            kind,
            ref,
          );
          db.run(
            'DELETE FROM search_doc WHERE owner = ? AND kind = ? AND ref = ?',
            owner,
            kind,
            ref,
          );
        });
      },
      /** Everything indexed as being about this one thing. */
      forgetAbout(owner: string, about: string) {
        db.tx(() => {
          db.run(
            `DELETE FROM search WHERE rowid IN
               (SELECT id FROM search_doc WHERE owner = ? AND about = ?)`,
            owner,
            about,
          );
          db.run('DELETE FROM search_doc WHERE owner = ? AND about = ?', owner, about);
        });
      },
      /** At sign-in the work moves to another owner, and a search there indexes it again. */
      forgetOwner(owner: string) {
        db.tx(() => {
          db.run(
            'DELETE FROM search WHERE rowid IN (SELECT id FROM search_doc WHERE owner = ?)',
            owner,
          );
          db.run('DELETE FROM search_doc WHERE owner = ?', owner);
        });
      },
      // What changed since it was indexed, or was never indexed. Each is bounded by what one owner has.
      staleRuns: (owner: string) =>
        db.all<RunRow>(
          `SELECT r.* FROM run r
           LEFT JOIN search_doc d ON d.owner = r.owner AND d.kind = 'conversation' AND d.ref = r.id
           WHERE r.owner = ? AND (d.id IS NULL OR d.at < r.updated_at)`,
          owner,
        ),
      staleExplorations: (owner: string) =>
        db.all<ExplorationRow>(
          `SELECT e.* FROM exploration e
           LEFT JOIN search_doc d ON d.owner = e.owner AND d.kind = 'exploration' AND d.ref = e.id
           WHERE e.owner = ? AND (d.id IS NULL OR d.at < e.updated_at)`,
          owner,
        ),
      staleFollows: (owner: string) =>
        db.all<FollowRow>(
          `SELECT f.* FROM follow f
           LEFT JOIN search_doc d ON d.owner = f.owner AND d.kind = 'follow' AND d.ref = f.id
           WHERE f.owner = ? AND (d.id IS NULL OR d.at < f.updated_at)`,
          owner,
        ),
      staleNotes: (owner: string) =>
        db.all<WorkspaceNoteRow>(
          `SELECT n.* FROM workspace_note n
           LEFT JOIN search_doc d ON d.owner = n.owner AND d.kind = 'note' AND d.ref = n.id
           WHERE n.owner = ? AND (d.id IS NULL OR d.at < n.updated_at)`,
          owner,
        ),
      /**
       * Best first. `match` is FTS5 syntax, and a bad one throws, so it must never be a person's words
       * as typed. A marker has no row in `search`, so it can't be a hit.
       */
      query: (owner: string, match: string, kinds: readonly string[], limit: number) =>
        db.all<SearchHit>(
          `SELECT d.kind, d.ref, d.title, d.about, d.at,
                  snippet(search, -1, '${SEARCH_HIT_OPEN}', '${SEARCH_HIT_CLOSE}', '…', 16) AS snippet
           FROM search JOIN search_doc d ON d.id = search.rowid
           WHERE search MATCH ? AND d.owner = ?
             AND d.kind IN (${kinds.map(() => '?').join(', ')})
           ORDER BY search.rank LIMIT ?`,
          match,
          owner,
          ...kinds,
          limit,
        ),
    },
  };
}

export type Tables = ReturnType<typeof tables>;
