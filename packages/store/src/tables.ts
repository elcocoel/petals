// Thin typed functions over the tables (specs/002-system/data-model.md). Behaviour lives in the
// packages that use them; what is here is only what has to be one atomic step in the database.
// Times are ISO strings from the caller, money is in USD. Every function answers later (db.ts), and one
// SQL text serves SQLite and Postgres; only search is written per engine.
import type { Db } from './db.ts';

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
  /** what opened it: `wallet:<binding hash>`; null for an anonymous handle */
  credential?: string | null;
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
  /** the folder it sits in, the owner's own; null at the top */
  folder?: string | null;
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
  /** the credential that started it */
  credential?: string | null;
  /** where its owner put it, as a conversation from another door; null at the top */
  folder?: string | null;
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
  /** the credential that authorised it: `wallet:…` or `link:…` */
  credential?: string | null;
  at: string;
}
export interface NoteRow {
  exploration: string;
  seq: number;
  /** who wrote it, as a reader may see it: `owner` or `link:<id>`, never a person id */
  author: string;
  door: string | null;
  text: string;
  /** the credential that authorised it */
  credential?: string | null;
  at: string;
}
/** A job handed out in a project (an exploration): open, taken by someone's agent, then done or failed. */
export interface JobRow {
  id: string;
  exploration: string;
  /** the page agent's run that handed it out, if a run did */
  run: string | null;
  kind: 'map';
  title: string;
  /** plain words for the agent that takes it */
  brief: string;
  inputs: Record<string, unknown>;
  status: 'open' | 'taken' | 'done' | 'failed';
  result: { summary: string; steps?: number[]; notes?: string } | null;
  failed: string | null;
  created_at: string;
  updated_at: string;
}
interface JobRecord extends Omit<JobRow, 'inputs' | 'result'> {
  seq: number;
  inputs: string;
  result: string | null;
}
const jobOf = (r: JobRecord): JobRow => ({
  id: r.id,
  exploration: r.exploration,
  run: r.run,
  kind: r.kind,
  title: r.title,
  brief: r.brief,
  inputs: JSON.parse(r.inputs) as Record<string, unknown>,
  status: r.status,
  result: r.result ? (JSON.parse(r.result) as JobRow['result']) : null,
  failed: r.failed,
  created_at: r.created_at,
  updated_at: r.updated_at,
});

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
  /** the credential that made it */
  credential?: string | null;
  created_at: string;
  updated_at: string;
}
/** A person's own folder (004-workspace, W4): named, nested and arranged by them, and private to them. */
export interface FolderRow {
  id: string;
  owner: string;
  name: string;
  /** the folder it sits in; null at the top */
  parent: string | null;
  /** where it sits among its siblings: lower first, then by name */
  position: number;
  /** the credential that made it */
  credential?: string | null;
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
  /** the credential that wrote it */
  credential?: string | null;
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

/** A person's words as FTS5 takes them: each quoted, so nothing typed is syntax; the last a prefix. */
function fts5Match(words: readonly string[]): string {
  return words
    .map((w, i) => `"${w.replaceAll('"', '""')}"${i === words.length - 1 ? '*' : ''}`)
    .join(' ');
}

/**
 * The same words as Postgres's to_tsquery takes them: each word's letters and digits as quoted lexemes,
 * all of them required, and the last one a prefix. Nothing typed can be tsquery syntax.
 */
function tsQuery(words: readonly string[]): string {
  const parts = words.flatMap((w) => w.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  return parts
    .map(
      (p, i) =>
        `'${p.replaceAll('\\', '\\\\').replaceAll("'", "''")}'${i === parts.length - 1 ? ':*' : ''}`,
    )
    .join(' & ');
}

export function tables(db: Db) {
  const nextSeq = async (
    table: 'run_event' | 'step' | 'note' | 'job',
    column: string,
    id: string,
  ): Promise<number> =>
    (
      (await db.get<{ next: number }>(
        `SELECT COALESCE(MAX(seq) + 1, 0) AS next FROM ${table} WHERE ${column} = ?`,
        id,
      )) as { next: number }
    ).next;

  const ledgerRow = async (day: string): Promise<LedgerRow> =>
    (await db.get<LedgerRow>('SELECT day, usd, reserved_usd FROM ledger WHERE day = ?', day)) ?? {
      day,
      usd: 0,
      reserved_usd: 0,
    };
  const writeLedger = async (r: LedgerRow) => {
    await db.run(
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
  const writeCredit = async (r: CreditRow) => {
    await db.run(
      `INSERT INTO credit (account_key, balance_usd, reserved_usd) VALUES (?, ?, ?)
       ON CONFLICT (account_key) DO UPDATE SET
         balance_usd = excluded.balance_usd, reserved_usd = excluded.reserved_usd`,
      r.account_key,
      r.balance_usd,
      r.reserved_usd,
    );
  };

  const count = async (sql: string, ...params: string[]): Promise<number> =>
    ((await db.get<{ n: number }>(sql, ...params)) as { n: number }).n;

  return {
    meta: {
      get: async (key: string) =>
        (await db.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', key))?.value ??
        null,
      async set(key: string, value: string) {
        await db.run(
          `INSERT INTO meta (key, value) VALUES (?, ?)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
          key,
          value,
        );
      },
    },

    person: {
      async create(r: PersonRow) {
        await db.run('INSERT INTO person (id, created_at) VALUES (?, ?)', r.id, r.created_at);
      },
      get: (id: string) => db.get<PersonRow>('SELECT * FROM person WHERE id = ?', id),
      list: () => db.all<PersonRow>('SELECT * FROM person ORDER BY created_at, id'),
    },

    walletBinding: {
      /** False when this wallet is already bound, to anyone. */
      bind: async (r: WalletBindingRow) =>
        (await db.run(
          `INSERT INTO wallet_binding (person, network, caip10_encrypted, caip10_hash, proved_at)
           VALUES (?, ?, ?, ?, ?) ON CONFLICT (caip10_hash) DO NOTHING`,
          r.person,
          r.network,
          r.caip10_encrypted,
          r.caip10_hash,
          r.proved_at,
        )) === 1,
      byHash: (hash: string) =>
        db.get<WalletBindingRow>('SELECT * FROM wallet_binding WHERE caip10_hash = ?', hash),
      ofPerson: (person: string) =>
        db.all<WalletBindingRow>('SELECT * FROM wallet_binding WHERE person = ?', person),
    },

    session: {
      async put(r: Pick<SessionRow, 'hash' | 'subject' | 'expires_at'> & Partial<SessionRow>) {
        await db.run(
          `INSERT INTO session (hash, subject, network, invite, credential, expires_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          r.hash,
          r.subject,
          r.network ?? null,
          r.invite ?? null,
          r.credential ?? null,
          r.expires_at,
        );
      },
      async setInvite(hash: string, invite: string) {
        await db.run('UPDATE session SET invite = ? WHERE hash = ?', invite, hash);
      },
      /** Null once expired. */
      get: (hash: string, now: string) =>
        db.get<SessionRow>('SELECT * FROM session WHERE hash = ? AND expires_at > ?', hash, now),
      async delete(hash: string) {
        await db.run('DELETE FROM session WHERE hash = ?', hash);
      },
      async deleteExpired(now: string) {
        await db.run('DELETE FROM session WHERE expires_at <= ?', now);
      },
    },

    /** Single-use nonces: reserved while a proof is checked, spent or released after. */
    challenge: {
      async put(nonce: string, expiresAt: string, now: string) {
        await db.run('DELETE FROM challenge WHERE expires_at <= ?', now);
        await db.run('INSERT INTO challenge (nonce, expires_at) VALUES (?, ?)', nonce, expiresAt);
      },
      /** One UPDATE, so one caller gets 'ok', from any connection. */
      async reserve(nonce: string, now: string): Promise<ChallengeCheck> {
        const took = await db.run(
          `UPDATE challenge SET state = 'checking'
           WHERE nonce = ? AND state = 'issued' AND expires_at > ?`,
          nonce,
          now,
        );
        if (took === 1) return 'ok';
        const row = await db.get<{ state: string }>(
          'SELECT state FROM challenge WHERE nonce = ?',
          nonce,
        );
        if (!row) return 'unknown';
        return row.state === 'issued' ? 'expired' : 'used';
      },
      async spend(nonce: string, now: string) {
        await db.run(
          `UPDATE challenge SET state = 'used', used_at = ? WHERE nonce = ?`,
          now,
          nonce,
        );
      },
      async release(nonce: string) {
        await db.run(
          `UPDATE challenge SET state = 'issued' WHERE nonce = ? AND state = 'checking'`,
          nonce,
        );
      },
    },

    run: {
      async insert(r: RunRow) {
        await db.run(
          `INSERT INTO run (id, owner, exploration, status, model, body, title, settings, folder,
                            created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          r.id,
          r.owner,
          r.exploration,
          r.status,
          r.model,
          r.body,
          r.title ?? null,
          r.settings ?? null,
          r.folder ?? null,
          r.created_at,
          r.updated_at,
        );
      },
      get: (id: string) => db.get<RunRow>('SELECT * FROM run WHERE id = ?', id),
      async update(id: string, f: Pick<RunRow, 'status' | 'model' | 'body' | 'updated_at'>) {
        await db.run(
          'UPDATE run SET status = ?, model = ?, body = ?, updated_at = ? WHERE id = ?',
          f.status,
          f.model,
          f.body,
          f.updated_at,
          id,
        );
      },
      /** Compare and swap: false unless the current owner is `from` (default none). */
      setOwner: async (id: string, owner: string, from: string | null = null) =>
        (from === null
          ? await db.run('UPDATE run SET owner = ? WHERE id = ? AND owner IS NULL', owner, id)
          : await db.run(
              'UPDATE run SET owner = ? WHERE id = ? AND owner = ?',
              owner,
              id,
              from,
            )) === 1,
      /** Every run of `from` now belongs to `to`, in one statement. Returns how many moved. */
      moveOwner: (from: string, to: string): Promise<number> =>
        db.run('UPDATE run SET owner = ? WHERE owner = ?', to, from),
      idsWithStatus: async (status: string) =>
        (await db.all<{ id: string }>('SELECT id FROM run WHERE status = ?', status)).map(
          (r) => r.id,
        ),
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
      async setExploration(id: string, exploration: string) {
        await db.run('UPDATE run SET exploration = ? WHERE id = ?', exploration, id);
      },
      /** A person's list, newest first: the hidden ones, or the rest. */
      conversations: (owner: string, limit: number, hidden: boolean) =>
        db.all<ConversationRow>(
          `SELECT id, owner, exploration, status, model, title, settings, hidden_at, folder,
                  created_at, updated_at, CASE WHEN title IS NULL THEN body END AS body
           FROM run WHERE owner = ? AND hidden_at IS ${hidden ? 'NOT ' : ''}NULL
           ORDER BY updated_at DESC LIMIT ?`,
          owner,
          limit,
        ),
      // These three leave updated_at alone: renaming or hiding one isn't talking in it.
      async setTitle(id: string, title: string) {
        await db.run('UPDATE run SET title = ? WHERE id = ?', title, id);
      },
      async setSettings(id: string, settings: string) {
        await db.run('UPDATE run SET settings = ? WHERE id = ?', settings, id);
      },
      async setHidden(id: string, at: string | null) {
        await db.run('UPDATE run SET hidden_at = ? WHERE id = ?', at, id);
      },
      async setFolder(id: string, folder: string | null) {
        await db.run('UPDATE run SET folder = ? WHERE id = ?', folder, id);
      },
      /** The run that last worked on this exploration, if any. */
      latestOfExploration: async (exploration: string) =>
        (
          await db.get<{ id: string }>(
            'SELECT id FROM run WHERE exploration = ? ORDER BY updated_at DESC LIMIT 1',
            exploration,
          )
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
      append: (run: string, type: string, data: string, at: string): Promise<number> =>
        db.tx(async () => {
          const seq = await nextSeq('run_event', 'run', run);
          await db.run(
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
      async save(run: string, messages: string, at: string) {
        await db.run(
          `INSERT INTO run_thread (run, messages, updated_at) VALUES (?, ?, ?)
           ON CONFLICT (run) DO UPDATE SET
             messages = excluded.messages, updated_at = excluded.updated_at`,
          run,
          messages,
          at,
        );
      },
      get: async (run: string) =>
        (await db.get<{ messages: string }>('SELECT messages FROM run_thread WHERE run = ?', run))
          ?.messages ?? null,
    },

    /** One row a day. What counts against the cap is usd + reserved_usd. */
    ledger: {
      get: ledgerRow,
      add: (day: string, usd: number): Promise<void> =>
        db.tx(async () => {
          const r = await ledgerRow(day);
          await writeLedger({ ...r, usd: r.usd + usd });
        }),
      /** Holds up to `usd` under the cap. Returns the amount held, or null when nothing is left. */
      reserve: (day: string, usd: number, capUsd: number): Promise<number | null> =>
        db.tx(async () => {
          const r = await ledgerRow(day);
          const held = holdable(usd, capUsd - r.usd - r.reserved_usd);
          if (held !== null) await writeLedger({ ...r, reserved_usd: r.reserved_usd + held });
          return held;
        }),
      /** Swaps a hold for what was really spent. */
      settle: (day: string, heldUsd: number, actualUsd: number): Promise<void> =>
        db.tx(async () => {
          const r = await ledgerRow(day);
          await writeLedger({
            day,
            usd: r.usd + actualUsd,
            reserved_usd: Math.max(0, r.reserved_usd - heldUsd),
          });
        }),
      /**
       * Every hold on every day counted as spent, and how much that was: for when no call can be in
       * flight. What a call cut off by a crash really cost can't be known, so it's never less than this.
       */
      spendHolds: (): Promise<number> =>
        db.tx(async () => {
          const held =
            (await db.get<{ usd: number | null }>('SELECT SUM(reserved_usd) AS usd FROM ledger'))
              ?.usd ?? 0;
          await db.run(
            'UPDATE ledger SET usd = usd + reserved_usd, reserved_usd = 0 WHERE reserved_usd <> 0',
          );
          return held;
        }),
      /** A day's starting figure, if the day has none yet. */
      async seed(day: string, usd: number) {
        await db.run(
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
      apply: (e: CreditEntryRow): Promise<boolean> =>
        db.tx(async () => {
          const fresh = await db.run(
            `INSERT INTO credit_entry (id, account_key, delta_usd, reason, at)
             VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
            e.id,
            e.account_key,
            e.delta_usd,
            e.reason,
            e.at,
          );
          if (fresh !== 1) return false;
          const r = (await creditRow(e.account_key)) ?? {
            account_key: e.account_key,
            balance_usd: 0,
            reserved_usd: 0,
          };
          await writeCredit({ ...r, balance_usd: r.balance_usd + e.delta_usd });
          return true;
        }),
      entries: (account: string) =>
        db.all<CreditEntryRow>(
          'SELECT * FROM credit_entry WHERE account_key = ? ORDER BY at, id',
          account,
        ),
      /** Holds up to `usd` of the balance. Returns the amount held, or null when nothing is left. */
      reserve: (account: string, usd: number): Promise<number | null> =>
        db.tx(async () => {
          const r = await creditRow(account);
          if (!r) return null;
          const held = holdable(usd, r.balance_usd - r.reserved_usd);
          if (held !== null) await writeCredit({ ...r, reserved_usd: r.reserved_usd + held });
          return held;
        }),
      /** Every hold counted as spent, with an entry for each: the same rule as the ledger's. */
      spendHolds: (at: string): Promise<{ account_key: string; usd: number }[]> =>
        db.tx(async () => {
          const held = await db.all<CreditRow>('SELECT * FROM credit WHERE reserved_usd <> 0');
          for (const r of held) {
            await db.run(
              `INSERT INTO credit_entry (id, account_key, delta_usd, reason, at)
               VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
              `crash:${r.account_key}:${at}`,
              r.account_key,
              -r.reserved_usd,
              'held at a restart',
              at,
            );
            await writeCredit({
              ...r,
              balance_usd: r.balance_usd - r.reserved_usd,
              reserved_usd: 0,
            });
          }
          return held.map((r) => ({ account_key: r.account_key, usd: r.reserved_usd }));
        }),
      /** Swaps a hold for what was really spent. */
      settle: (account: string, heldUsd: number, actualUsd: number): Promise<void> =>
        db.tx(async () => {
          const r = await creditRow(account);
          if (!r) throw new Error(`no credit account ${account}`);
          await writeCredit({
            account_key: account,
            balance_usd: r.balance_usd - actualUsd,
            reserved_usd: Math.max(0, r.reserved_usd - heldUsd),
          });
        }),
    },

    invite: {
      async create(r: Omit<InviteRow, 'spent_usd' | 'revoked_at'>) {
        await db.run(
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
      async revoke(id: string, at: string) {
        await db.run(
          'UPDATE invite SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
          at,
          id,
        );
      },
      async addSpent(id: string, usd: number) {
        await db.run('UPDATE invite SET spent_usd = spent_usd + ? WHERE id = ?', usd, id);
      },
    },

    /** Hash-addressed draft links (SYS-043): put-if-absent. */
    draft: {
      /** False when this hash is already stored. */
      put: async (r: DraftRow) =>
        (await db.run(
          'INSERT INTO draft (sha256, body, created_at) VALUES (?, ?, ?) ON CONFLICT (sha256) DO NOTHING',
          r.sha256,
          r.body,
          r.created_at,
        )) === 1,
      get: (sha256: string) => db.get<DraftRow>('SELECT * FROM draft WHERE sha256 = ?', sha256),
    },

    /** Entries prepared for a maker's signature (prepare_publish). */
    publishDraft: {
      /** A new prepare replaces the old one, used or not: it carries a new nonce. */
      async put(entrySha256: string, body: string, expiresAt: string) {
        await db.run(
          `INSERT INTO publish_draft (entry_sha256, body, used_at, expires_at) VALUES (?, ?, NULL, ?)
           ON CONFLICT (entry_sha256) DO UPDATE SET
             body = excluded.body, used_at = NULL, expires_at = excluded.expires_at`,
          entrySha256,
          body,
          expiresAt,
        );
      },
      /** A draft from before drafts said when they expire has none, and goes too. */
      async deleteExpired(now: string) {
        await db.run('DELETE FROM publish_draft WHERE expires_at <= ? OR expires_at IS NULL', now);
      },
      get: (entrySha256: string) =>
        db.get<PublishDraftRow>('SELECT * FROM publish_draft WHERE entry_sha256 = ?', entrySha256),
      /** One UPDATE, so one caller gets true, from any connection. */
      claim: async (entrySha256: string, at: string) =>
        (await db.run(
          'UPDATE publish_draft SET used_at = ? WHERE entry_sha256 = ? AND used_at IS NULL',
          at,
          entrySha256,
        )) === 1,
    },

    exploration: {
      async create(r: ExplorationRow) {
        await db.run(
          `INSERT INTO exploration (id, owner, question, target, head, visibility,
             share_token_hash, forked_from, credential, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          r.id,
          r.owner,
          r.question,
          r.target,
          r.head,
          r.visibility,
          r.share_token_hash,
          r.forked_from,
          r.credential ?? null,
          r.created_at,
          r.updated_at,
        );
      },
      get: (id: string) => db.get<ExplorationRow>('SELECT * FROM exploration WHERE id = ?', id),
      byShareToken: (hash: string) =>
        db.get<ExplorationRow>('SELECT * FROM exploration WHERE share_token_hash = ?', hash),
      idsWithStatus: async (status: string) =>
        (await db.all<{ id: string }>('SELECT id FROM run WHERE status = ?', status)).map(
          (r) => r.id,
        ),
      /** Newest first. */
      listByOwner: (owner: string, limit = 50) =>
        db.all<ExplorationRow>(
          'SELECT * FROM exploration WHERE owner = ? ORDER BY updated_at DESC LIMIT ?',
          owner,
          limit,
        ),
      /** Compare and swap on the ref: false unless the head is still `expected`. */
      moveHead: async (id: string, expected: string | null, head: string, at: string) =>
        (expected === null
          ? await db.run(
              'UPDATE exploration SET head = ?, updated_at = ? WHERE id = ? AND head IS NULL',
              head,
              at,
              id,
            )
          : await db.run(
              'UPDATE exploration SET head = ?, updated_at = ? WHERE id = ? AND head = ?',
              head,
              at,
              id,
              expected,
            )) === 1,
      async setSharing(id: string, visibility: string, shareTokenHash: string | null, at: string) {
        await db.run(
          'UPDATE exploration SET visibility = ?, share_token_hash = ?, updated_at = ? WHERE id = ?',
          visibility,
          shareTokenHash,
          at,
          id,
        );
      },
      /** What it's about now: the target of its latest step. */
      async setTarget(id: string, target: string | null) {
        await db.run('UPDATE exploration SET target = ? WHERE id = ?', target, id);
      },
      async touch(id: string, at: string) {
        await db.run('UPDATE exploration SET updated_at = ? WHERE id = ?', at, id);
      },
      /** Where its owner put it. Leaves updated_at alone: moving it isn't working on it. */
      async setFolder(id: string, folder: string | null) {
        await db.run('UPDATE exploration SET folder = ? WHERE id = ?', folder, id);
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
      moveOwner: (from: string, to: string): Promise<number> =>
        db.run('UPDATE exploration SET owner = ? WHERE owner = ?', to, from),
      /**
       * Up to `limit` that nobody owns and nobody has touched since `before`, with their steps, notes
       * and links. Returns how many went. A limit, so one request never waits on a long delete.
       */
      deleteUnclaimed: (before: string, limit: number): Promise<number> =>
        db.tx(async () => {
          const gone = await db.all<{ id: string }>(
            'SELECT id FROM exploration WHERE owner IS NULL AND updated_at < ? LIMIT ?',
            before,
            limit,
          );
          for (const { id } of gone) {
            await db.run('DELETE FROM step WHERE exploration = ?', id);
            await db.run('DELETE FROM note WHERE exploration = ?', id);
            await db.run('DELETE FROM exploration_link WHERE exploration = ?', id);
            await db.run('DELETE FROM exploration WHERE id = ?', id);
          }
          return gone.length;
        }),
      /** Compare and swap: false unless the current owner is `from` (default none). */
      setOwner: async (id: string, owner: string, from: string | null = null) =>
        (from === null
          ? await db.run(
              'UPDATE exploration SET owner = ? WHERE id = ? AND owner IS NULL',
              owner,
              id,
            )
          : await db.run(
              'UPDATE exploration SET owner = ? WHERE id = ? AND owner = ?',
              owner,
              id,
              from,
            )) === 1,
    },

    /** Ways into an exploration: a token's hash, a scope, and a time it stopped working. */
    explorationLink: {
      async create(r: Omit<ExplorationLinkRow, 'revoked_at'>) {
        await db.run(
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
      revoke: async (exploration: string, id: string, at: string) =>
        (await db.run(
          `UPDATE exploration_link SET revoked_at = ?
           WHERE id = ? AND exploration = ? AND revoked_at IS NULL`,
          at,
          id,
          exploration,
        )) === 1,
    },

    step: {
      /** Returns the step's sequence number: 0, 1, 2… within the exploration. */
      append: (r: Omit<StepRow, 'seq' | 'author'> & { author?: string | null }): Promise<number> =>
        db.tx(async () => {
          const seq = await nextSeq('step', 'exploration', r.exploration);
          await db.run(
            `INSERT INTO step (exploration, seq, parent, spec_sha256, recipe_sha256,
               snapshot_sha256, door, author, note, credential, at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            r.exploration,
            seq,
            r.parent,
            r.spec_sha256,
            r.recipe_sha256,
            r.snapshot_sha256,
            r.door,
            r.author ?? null,
            r.note,
            r.credential ?? null,
            r.at,
          );
          return seq;
        }),
      list: (exploration: string) =>
        db.all<StepRow>('SELECT * FROM step WHERE exploration = ? ORDER BY seq', exploration),
      count: (exploration: string) =>
        count('SELECT COUNT(*) AS n FROM step WHERE exploration = ?', exploration),
    },

    note: {
      /** Returns the note's sequence number: 0, 1, 2… within the exploration. */
      append: (r: Omit<NoteRow, 'seq' | 'door'> & { door?: string | null }): Promise<number> =>
        db.tx(async () => {
          const seq = await nextSeq('note', 'exploration', r.exploration);
          await db.run(
            `INSERT INTO note (exploration, seq, author, door, text, credential, at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            r.exploration,
            seq,
            r.author,
            r.door ?? null,
            r.text,
            r.credential ?? null,
            r.at,
          );
          return seq;
        }),
      list: (exploration: string) =>
        db.all<NoteRow>('SELECT * FROM note WHERE exploration = ? ORDER BY seq', exploration),
      count: (exploration: string) =>
        count('SELECT COUNT(*) AS n FROM note WHERE exploration = ?', exploration),
    },

    job: {
      add: (r: {
        id: string;
        exploration: string;
        run: string | null;
        kind: JobRow['kind'];
        title: string;
        brief: string;
        inputs: Record<string, unknown>;
        at: string;
      }): Promise<JobRow> =>
        db.tx(async () => {
          const seq = await nextSeq('job', 'exploration', r.exploration);
          await db.run(
            `INSERT INTO job (id, exploration, seq, run, kind, title, brief, inputs, status, result,
               failed, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, NULL, ?, ?)`,
            r.id,
            r.exploration,
            seq,
            r.run,
            r.kind,
            r.title,
            r.brief,
            JSON.stringify(r.inputs),
            r.at,
            r.at,
          );
          return jobOf(
            (await db.get<JobRecord>('SELECT * FROM job WHERE id = ?', r.id)) as JobRecord,
          );
        }),
      /** Oldest first. */
      list: async (exploration: string): Promise<JobRow[]> =>
        (
          await db.all<JobRecord>(
            'SELECT * FROM job WHERE exploration = ? ORDER BY seq',
            exploration,
          )
        ).map(jobOf),
      /** The oldest open job, now taken, or null when none is open. */
      take: (exploration: string, at: string): Promise<JobRow | null> =>
        db.tx(async () => {
          const open = await db.get<JobRecord>(
            `SELECT * FROM job WHERE exploration = ? AND status = 'open' ORDER BY seq LIMIT 1`,
            exploration,
          );
          if (!open) return null;
          await db.run(
            `UPDATE job SET status = 'taken', updated_at = ? WHERE id = ? AND status = 'open'`,
            at,
            open.id,
          );
          return jobOf({ ...open, status: 'taken', updated_at: at });
        }),
      /** A taken job, done with its result or failed with why; null for any other job. */
      report: (
        exploration: string,
        id: string,
        r: { result?: JobRow['result']; failed?: string },
        at: string,
      ): Promise<JobRow | null> =>
        db.tx(async () => {
          const taken = await db.get<JobRecord>(
            `SELECT * FROM job WHERE id = ? AND exploration = ? AND status = 'taken'`,
            id,
            exploration,
          );
          if (!taken) return null;
          const failed = r.failed ?? null;
          const result = failed === null && r.result ? JSON.stringify(r.result) : null;
          const status = failed === null ? 'done' : 'failed';
          await db.run(
            'UPDATE job SET status = ?, result = ?, failed = ?, updated_at = ? WHERE id = ?',
            status,
            result,
            failed,
            at,
            id,
          );
          return jobOf({ ...taken, status, result, failed, updated_at: at });
        }),
    },

    follow: {
      /** False when this owner already follows this ref: the row they have stands. */
      insert: async (r: FollowRow) =>
        (await db.run(
          `INSERT INTO follow (id, owner, kind, ref, label, spec_sha256, credential, created_at,
             updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (owner, ref) DO NOTHING`,
          r.id,
          r.owner,
          r.kind,
          r.ref,
          r.label,
          r.spec_sha256,
          r.credential ?? null,
          r.created_at,
          r.updated_at,
        )) === 1,
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
      count: (owner: string) => count('SELECT COUNT(*) AS n FROM follow WHERE owner = ?', owner),
      async update(id: string, f: Pick<FollowRow, 'label' | 'spec_sha256' | 'updated_at'>) {
        await db.run(
          'UPDATE follow SET label = ?, spec_sha256 = ?, updated_at = ? WHERE id = ?',
          f.label,
          f.spec_sha256,
          f.updated_at,
          id,
        );
      },
      async delete(id: string) {
        await db.run('DELETE FROM follow WHERE id = ?', id);
      },
      /**
       * At sign-in. What the person already follows stays as it is, so nothing is followed twice. Written
       * so both engines take it: SQLite's UPDATE OR IGNORE has no Postgres twin.
       */
      moveOwner: (from: string, to: string): Promise<void> =>
        db.tx(async () => {
          await db.run(
            `UPDATE follow SET owner = ? WHERE owner = ?
               AND NOT EXISTS (SELECT 1 FROM follow f WHERE f.owner = ? AND f.ref = follow.ref)`,
            to,
            from,
            to,
          );
          await db.run('DELETE FROM follow WHERE owner = ?', from);
        }),
    },

    folder: {
      async insert(r: FolderRow) {
        await db.run(
          `INSERT INTO folder (id, owner, name, parent, position, credential, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          r.id,
          r.owner,
          r.name,
          r.parent,
          r.position,
          r.credential ?? null,
          r.created_at,
          r.updated_at,
        );
      },
      get: (id: string) => db.get<FolderRow>('SELECT * FROM folder WHERE id = ?', id),
      /** The owner's whole tree, flat: each folder names its parent. Siblings in their order. */
      list: (owner: string) =>
        db.all<FolderRow>(
          'SELECT * FROM folder WHERE owner = ? ORDER BY parent IS NOT NULL, parent, position, name, id',
          owner,
        ),
      count: (owner: string) => count('SELECT COUNT(*) AS n FROM folder WHERE owner = ?', owner),
      /** After the last of its siblings. */
      nextPosition: async (owner: string, parent: string | null) =>
        Number(
          (
            await db.get<{ p: number | null }>(
              parent === null
                ? 'SELECT MAX(position) AS p FROM folder WHERE owner = ? AND parent IS NULL'
                : 'SELECT MAX(position) AS p FROM folder WHERE owner = ? AND parent = ?',
              ...(parent === null ? [owner] : [owner, parent]),
            )
          )?.p ?? -1,
        ) + 1,
      async update(id: string, f: Pick<FolderRow, 'name' | 'parent' | 'position' | 'updated_at'>) {
        await db.run(
          'UPDATE folder SET name = ?, parent = ?, position = ?, updated_at = ? WHERE id = ?',
          f.name,
          f.parent,
          f.position,
          f.updated_at,
          id,
        );
      },
      /**
       * Deletes one folder and nothing in it: its folders and conversations move up to its parent, in
       * the same transaction. Returns false if the owner has no such folder.
       */
      delete: (id: string, owner: string): Promise<boolean> =>
        db.tx(async () => {
          const row = await db.get<FolderRow>(
            'SELECT * FROM folder WHERE id = ? AND owner = ?',
            id,
            owner,
          );
          if (!row) return false;
          const up = row.parent;
          await db.run('UPDATE folder SET parent = ? WHERE parent = ?', up, id);
          await db.run('UPDATE run SET folder = ? WHERE folder = ?', up, id);
          await db.run('UPDATE exploration SET folder = ? WHERE folder = ?', up, id);
          await db.run('DELETE FROM folder WHERE id = ?', id);
          return true;
        }),
      /** At sign-in, with the conversations in them: a person's folders, and an anonymous handle's. */
      async moveOwner(from: string, to: string) {
        await db.run('UPDATE folder SET owner = ? WHERE owner = ?', to, from);
      },
    },

    workspaceNote: {
      async insert(r: WorkspaceNoteRow) {
        await db.run(
          `INSERT INTO workspace_note (id, owner, author, about, text, evidence, credential,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          r.id,
          r.owner,
          r.author,
          r.about,
          r.text,
          r.evidence,
          r.credential ?? null,
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
        count('SELECT COUNT(*) AS n FROM workspace_note WHERE owner = ?', owner),
      async update(id: string, f: Pick<WorkspaceNoteRow, 'text' | 'evidence' | 'updated_at'>) {
        await db.run(
          'UPDATE workspace_note SET text = ?, evidence = ?, updated_at = ? WHERE id = ?',
          f.text,
          f.evidence,
          f.updated_at,
          id,
        );
      },
      async delete(id: string) {
        await db.run('DELETE FROM workspace_note WHERE id = ?', id);
      },
      async moveOwner(from: string, to: string) {
        await db.run('UPDATE workspace_note SET owner = ? WHERE owner = ?', to, from);
      },
    },

    /** Derived: deleting all of it loses nothing, because a search catches up on what's missing. */
    search: {
      /** One document, new or replacing what's there. No text makes it a marker. */
      put: (doc: SearchDoc, text: string | null): Promise<void> =>
        db.tx(async () => {
          const clean = (s: string) =>
            s.replaceAll(SEARCH_HIT_OPEN, ' ').replaceAll(SEARCH_HIT_CLOSE, ' ');
          const { id } = (await db.get<{ id: number }>(
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
          )) as { id: number };
          await db.run('DELETE FROM search WHERE rowid = ?', id);
          if (text !== null) {
            await db.run(
              'INSERT INTO search (rowid, title, text) VALUES (?, ?, ?)',
              id,
              clean(doc.title),
              clean(text),
            );
          }
        }),
      forget: (owner: string, kind: string, ref: string): Promise<void> =>
        db.tx(async () => {
          await db.run(
            `DELETE FROM search WHERE rowid IN
               (SELECT id FROM search_doc WHERE owner = ? AND kind = ? AND ref = ?)`,
            owner,
            kind,
            ref,
          );
          await db.run(
            'DELETE FROM search_doc WHERE owner = ? AND kind = ? AND ref = ?',
            owner,
            kind,
            ref,
          );
        }),
      /** Everything indexed as being about this one thing. */
      forgetAbout: (owner: string, about: string): Promise<void> =>
        db.tx(async () => {
          await db.run(
            `DELETE FROM search WHERE rowid IN
               (SELECT id FROM search_doc WHERE owner = ? AND about = ?)`,
            owner,
            about,
          );
          await db.run('DELETE FROM search_doc WHERE owner = ? AND about = ?', owner, about);
        }),
      /** At sign-in the work moves to another owner, and a search there indexes it again. */
      forgetOwner: (owner: string): Promise<void> =>
        db.tx(async () => {
          await db.run(
            'DELETE FROM search WHERE rowid IN (SELECT id FROM search_doc WHERE owner = ?)',
            owner,
          );
          await db.run('DELETE FROM search_doc WHERE owner = ?', owner);
        }),
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
       * Best first. `words` are a person's words, never syntax: each engine writes its own query from
       * them, the last word a prefix. A marker has no row in `search`, so it can't be a hit.
       */
      query: (owner: string, words: readonly string[], kinds: readonly string[], limit: number) => {
        const inKinds = kinds.map(() => '?').join(', ');
        if (db.engine === 'postgres') {
          return db.all<SearchHit>(
            `SELECT d.kind, d.ref, d.title, d.about, d.at,
                    ts_headline('petal_search'::regconfig, s.title || ' ' || s.text, q,
                      'StartSel=${SEARCH_HIT_OPEN}, StopSel=${SEARCH_HIT_CLOSE}, MaxWords=16, MinWords=4, ShortWord=0, MaxFragments=1, FragmentDelimiter=…') AS snippet
             FROM search s JOIN search_doc d ON d.id = s.rowid,
                  to_tsquery('petal_search'::regconfig, ?) q
             WHERE s.tsv @@ q AND d.owner = ? AND d.kind IN (${inKinds})
             ORDER BY ts_rank(s.tsv, q) DESC, d.at DESC LIMIT ?`,
            tsQuery(words),
            owner,
            ...kinds,
            limit,
          );
        }
        return db.all<SearchHit>(
          `SELECT d.kind, d.ref, d.title, d.about, d.at,
                  snippet(search, -1, '${SEARCH_HIT_OPEN}', '${SEARCH_HIT_CLOSE}', '…', 16) AS snippet
           FROM search JOIN search_doc d ON d.id = search.rowid
           WHERE search MATCH ? AND d.owner = ?
             AND d.kind IN (${inKinds})
           ORDER BY search.rank LIMIT ?`,
          fts5Match(words),
          owner,
          ...kinds,
          limit,
        );
      },
    },
  };
}

export type Tables = ReturnType<typeof tables>;
