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
  created_at: string;
  updated_at: string;
}
export type RunSummaryRow = Omit<RunRow, 'body'>;
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
  note: string | null;
  at: string;
}
export interface NoteRow {
  exploration: string;
  seq: number;
  author: string;
  text: string;
  at: string;
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

  return {
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
          `INSERT INTO run (id, owner, exploration, status, model, body, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          r.id,
          r.owner,
          r.exploration,
          r.status,
          r.model,
          r.body,
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
      /** Newest first. */
      listByOwner: (owner: string, limit = 50) =>
        db.all<RunSummaryRow>(
          `SELECT id, owner, exploration, status, model, created_at, updated_at FROM run
           WHERE owner = ? ORDER BY updated_at DESC LIMIT ?`,
          owner,
          limit,
        ),
    },

    runEvent: {
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
      /** Every hold on every day given back, and how much that was: for when no call can be in flight. */
      releaseHolds: (): number =>
        db.tx(() => {
          const held =
            db.get<{ usd: number }>('SELECT SUM(reserved_usd) AS usd FROM ledger')?.usd ?? 0;
          db.run('UPDATE ledger SET reserved_usd = 0 WHERE reserved_usd <> 0');
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
      /** Every hold given back, and how much that was: for when no call can be in flight. */
      releaseHolds: (): number =>
        db.tx(() => {
          const held =
            db.get<{ usd: number }>('SELECT SUM(reserved_usd) AS usd FROM credit')?.usd ?? 0;
          db.run('UPDATE credit SET reserved_usd = 0 WHERE reserved_usd <> 0');
          return held;
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
      put(entrySha256: string, body: string) {
        db.run(
          `INSERT INTO publish_draft (entry_sha256, body, used_at) VALUES (?, ?, NULL)
           ON CONFLICT (entry_sha256) DO UPDATE SET body = excluded.body, used_at = NULL`,
          entrySha256,
          body,
        );
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
      /** Every exploration of `from` now belongs to `to`, in one statement. */
      moveOwner: (from: string, to: string): number =>
        db.run('UPDATE exploration SET owner = ? WHERE owner = ?', to, from),
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

    step: {
      /** Returns the step's sequence number: 0, 1, 2… within the exploration. */
      append: (r: Omit<StepRow, 'seq'>): number =>
        db.tx(() => {
          const seq = nextSeq('step', 'exploration', r.exploration);
          db.run(
            `INSERT INTO step (exploration, seq, parent, spec_sha256, recipe_sha256,
               snapshot_sha256, door, note, at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            r.exploration,
            seq,
            r.parent,
            r.spec_sha256,
            r.recipe_sha256,
            r.snapshot_sha256,
            r.door,
            r.note,
            r.at,
          );
          return seq;
        }),
      list: (exploration: string) =>
        db.all<StepRow>('SELECT * FROM step WHERE exploration = ? ORDER BY seq', exploration),
    },

    note: {
      /** Returns the note's sequence number: 0, 1, 2… within the exploration. */
      append: (r: Omit<NoteRow, 'seq'>): number =>
        db.tx(() => {
          const seq = nextSeq('note', 'exploration', r.exploration);
          db.run(
            'INSERT INTO note (exploration, seq, author, text, at) VALUES (?, ?, ?, ?, ?)',
            r.exploration,
            seq,
            r.author,
            r.text,
            r.at,
          );
          return seq;
        }),
      list: (exploration: string) =>
        db.all<NoteRow>('SELECT * FROM note WHERE exploration = ? ORDER BY seq', exploration),
    },
  };
}

export type Tables = ReturnType<typeof tables>;
