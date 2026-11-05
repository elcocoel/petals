// The index as a file you can delete (T198, SYS-003): <stateDir>/index.db, apart from private.db.
// It holds only what stored snapshots already say. A missing, stale or corrupt file is rebuilt, never
// a failure. A rebuild writes a new file and renames it into place, so a crash leaves the old index
// or none, and never half of one. Falls back to memory where the folder can't be written, as the
// private store does, for the keyless copy on a read-only disk.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Snapshot } from '@petal/core/types';
import { Ingest } from './ingest.ts';
import { groupsOf, type ProjectedGroup } from './project.ts';
import { Queries } from './queries.ts';
import { CONTENT, INDEXES, SCHEMA_VERSION, TABLES } from './schema.ts';

/** What the index reads. @petal/inputs' SnapshotStore has this shape. */
export interface SnapshotSource {
  list(): Promise<{ sha256: string }[]>;
  get(sha256: string): Promise<Snapshot | null>;
}

export interface SkippedSnapshot {
  sha256: string;
  reason: string;
}

export interface RebuildReport {
  path: string;
  durable: boolean;
  snapshots: {
    sha256: string;
    network: string;
    title: string;
    as_of: string;
    groups: number;
    memberships: number;
    ms: number;
  }[];
  skipped: SkippedSnapshot[];
  rows: Record<
    'groups' | 'observations' | 'accounts' | 'memberships' | 'adjacency' | 'overlap',
    number
  >;
  bytes: number;
  ms: number;
}

/** How long a write waits on another process's lock before it fails. */
const BUSY_MS = 5000;

const UNREADABLE_ROWS = 'its rows could not be read as groups';

/** Node's SQLite errors for a file that isn't what this code expects: rebuild, don't fail. */
function isBrokenIndex(e: unknown): boolean {
  const err = e as { code?: string; errcode?: number };
  if (err?.code !== 'ERR_SQLITE_ERROR') return false;
  // generic (a missing table), I/O, corrupt, not a database
  return [1, 10, 11, 26].includes((err.errcode ?? 0) & 0xff);
}

function openDatabase(path: string): DatabaseSync {
  // Loaded here, not imported: node:sqlite prints an ExperimentalWarning when first loaded, and a
  // command that never opens the index shouldn't print it.
  const { DatabaseSync: Sqlite } = process.getBuiltinModule('node:sqlite');
  return new Sqlite(path, { timeout: BUSY_MS });
}

/** The folder refuses, as opposed to a bug here, which must surface and not hide in memory. */
function isUnwritable(e: unknown): boolean {
  const err = e as { code?: string; errcode?: number };
  if (err?.code === 'ERR_SQLITE_ERROR') return [8, 14].includes((err.errcode ?? 0) & 0xff);
  return ['EACCES', 'EPERM', 'EROFS', 'ENOTDIR', 'EEXIST'].includes(err?.code ?? '');
}

export class RelationsIndex {
  #path: string;
  readonly #log: (line: string) => void;
  #db: DatabaseSync | null = null;
  #queries: Queries | null = null;
  #inode: number | bigint = 0;
  #skipped: SkippedSnapshot[] = [];
  #queue: Promise<unknown> = Promise.resolve();

  constructor(path: string, opts: { log?: (line: string) => void } = {}) {
    this.#path = path;
    this.#log = opts.log ?? console.warn;
  }

  get path(): string {
    return this.#path;
  }

  /** False in memory: it ends with the process, and the next one builds its own. */
  get durable(): boolean {
    return this.#path !== ':memory:';
  }

  /** Snapshots the store lists but the index couldn't read, as of the last sync. */
  get skipped(): SkippedSnapshot[] {
    return this.#skipped;
  }

  /** One at a time: a rebuild is async between snapshots, and a query must not see it half done. */
  #enqueue<T>(job: () => Promise<T> | T): Promise<T> {
    const run = this.#queue.then(job, job);
    this.#queue = run.catch(() => undefined);
    return run;
  }

  /** Sync with what's stored, then answer. A file that turns out to be broken is rebuilt once. */
  answer<T>(source: SnapshotSource, fn: (q: Queries) => T): Promise<T> {
    return this.#enqueue(async () => {
      await this.#sync(source);
      try {
        return fn(this.#queries as Queries);
      } catch (e) {
        if (!isBrokenIndex(e)) throw e;
        await this.#rebuild(source);
        return fn(this.#queries as Queries);
      }
    });
  }

  /** Bring the index up to date: first build, or just the snapshots stored since. */
  sync(source: SnapshotSource): Promise<void> {
    return this.#enqueue(() => this.#sync(source));
  }

  rebuild(
    source: SnapshotSource,
    onSnapshot?: (s: RebuildReport['snapshots'][number]) => void,
  ): Promise<RebuildReport> {
    return this.#enqueue(() => this.#rebuild(source, onSnapshot));
  }

  /** Add one stored snapshot. Nothing happens if it's already in. */
  addSnapshot(sha256: string, s: Snapshot): Promise<void> {
    return this.#enqueue(() => {
      if (!this.#connected()) throw new Error('relations: no index yet: sync or rebuild first');
      this.#add(sha256, s);
    });
  }

  /** A hash of every row. Two indexes with one fingerprint give one answer to anything. */
  fingerprint(): Promise<string> {
    return this.#enqueue(() => {
      if (!this.#connected()) throw new Error('relations: no index yet: sync or rebuild first');
      const h = createHash('sha256');
      for (const [table, order] of CONTENT) {
        h.update(`${table}\n`);
        const rows = (this.#db as DatabaseSync)
          .prepare(`SELECT * FROM ${table} ORDER BY ${order}`)
          .iterate();
        for (const row of rows) h.update(`${JSON.stringify(row)}\n`);
      }
      return h.digest('hex');
    });
  }

  close(): void {
    this.#disconnect();
  }

  #disconnect(): void {
    try {
      if (this.#db?.isOpen) this.#db.close();
    } catch {
      // closing a broken file must not stop its replacement
    }
    this.#db = null;
    this.#queries = null;
  }

  /** Use a connection that matches the file now on disk, or none. */
  #connected(): boolean {
    if (this.#path === ':memory:') return this.#db !== null;
    const stat = statOrNull(this.#path);
    if (!stat) {
      this.#disconnect();
      return false;
    }
    // Someone else's rebuild renamed a new file into place, or an old one was put back.
    if (this.#db && stat.ino !== this.#inode) this.#disconnect();
    if (this.#db) return true;
    let db: DatabaseSync | null = null;
    try {
      db = openDatabase(this.#path);
      db.exec(
        'PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY; PRAGMA cache_size = -65536; PRAGMA mmap_size = 2147483648;',
      );
      const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
      const done = db.prepare(`SELECT value FROM meta WHERE key = 'complete'`).get();
      if (version.user_version !== SCHEMA_VERSION || !done) {
        db.close();
        return false;
      }
    } catch {
      if (db?.isOpen) db.close();
      return false;
    }
    this.#db = db;
    this.#queries = new Queries(db);
    this.#inode = stat.ino;
    return true;
  }

  async #sync(source: SnapshotSource): Promise<void> {
    const listed = (await source.list()).map((r) => r.sha256);
    if (!this.#connected()) {
      await this.#rebuild(source);
      return;
    }
    try {
      const db = this.#db as DatabaseSync;
      const have = new Set(
        (db.prepare('SELECT sha256 FROM snapshot').all() as { sha256: string }[]).map(
          (r) => r.sha256,
        ),
      );
      const wanted = new Set(listed);
      // Snapshots don't change, but a cache folder can go: then this index says too much.
      if ([...have].some((sha) => !wanted.has(sha))) {
        await this.#rebuild(source);
        return;
      }
      const skipped: SkippedSnapshot[] = [];
      for (const sha256 of listed) {
        if (have.has(sha256)) continue;
        const s = await readOrSkip(source, sha256, skipped);
        if (s) this.#add(sha256, s, skipped);
      }
      this.#skipped = skipped;
    } catch (e) {
      // A read-only file can still answer, until a new snapshot needs writing: then a new file,
      // or memory where the folder refuses too.
      if (!isBrokenIndex(e) && !isUnwritable(e)) throw e;
      await this.#rebuild(source);
    }
  }

  #add(sha256: string, s: Snapshot, skipped?: SkippedSnapshot[]): void {
    const db = this.#db as DatabaseSync;
    // First: nothing is written for a snapshot that can't be read as groups.
    let groups: ProjectedGroup[];
    try {
      groups = groupsOf(s);
    } catch (e) {
      if (!skipped) throw e;
      skipped.push({ sha256, reason: UNREADABLE_ROWS });
      return;
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      const known = db.prepare('SELECT 1 FROM snapshot WHERE sha256 = ?').get(sha256);
      if (!known) {
        const ingest = new Ingest(db, false);
        ingest.loadSnapshot(sha256, s, groups);
        ingest.settle();
      }
      db.exec('COMMIT');
    } catch (e) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw e;
    }
  }

  /** Where the new file goes while it's built; in memory if this folder can't be written. */
  #target(): { db: DatabaseSync; tmp: string | null } {
    if (this.#path !== ':memory:') {
      const dir = dirname(this.#path);
      const tmp = `${this.#path}.${process.pid}.tmp`;
      try {
        mkdirSync(dir, { recursive: true });
        // A crash leaves these behind, and each could be as big as the index.
        const prefix = `${basename(this.#path)}.`;
        for (const f of readdirSync(dir)) {
          if (f.startsWith(prefix) && f.endsWith('.tmp')) rmSync(join(dir, f), { force: true });
        }
        const db = openDatabase(tmp);
        db.exec('PRAGMA user_version = 0');
        return { db, tmp };
      } catch (e) {
        if (!isUnwritable(e)) throw e;
        this.#log(
          `petal: the relations index is in memory for this process, because ${dir} can't be written (${(e as Error).message}).`,
        );
        this.#path = ':memory:';
      }
    }
    return { db: openDatabase(':memory:'), tmp: null };
  }

  async #rebuild(
    source: SnapshotSource,
    onSnapshot?: (s: RebuildReport['snapshots'][number]) => void,
  ): Promise<RebuildReport> {
    const started = performance.now();
    this.#disconnect();
    const { db, tmp } = this.#target();
    const report: RebuildReport['snapshots'] = [];
    const skipped: SkippedSnapshot[] = [];
    try {
      db.exec(`
        PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; PRAGMA temp_store = MEMORY;
        PRAGMA cache_size = -524288; PRAGMA locking_mode = EXCLUSIVE;
      `);
      db.exec(TABLES);
      const ingest = new Ingest(db, true);
      db.exec('BEGIN');
      // Always the same order, whatever the store lists first.
      const listed = (await source.list()).map((r) => r.sha256).sort();
      for (const sha256 of listed) {
        const t0 = performance.now();
        const s = await readOrSkip(source, sha256, skipped);
        if (!s) continue;
        let projected: ProjectedGroup[];
        try {
          projected = groupsOf(s);
        } catch {
          skipped.push({ sha256, reason: UNREADABLE_ROWS });
          continue;
        }
        const { groups, memberships } = ingest.loadSnapshot(sha256, s, projected);
        const row = {
          sha256,
          network: s.network.id,
          title: s.network.title,
          as_of: s.snapshot.as_of,
          groups,
          memberships,
          ms: Math.round(performance.now() - t0),
        };
        report.push(row);
        onSnapshot?.(row);
      }
      db.exec(INDEXES);
      ingest.settle();
      db.exec(`INSERT INTO meta (key, value) VALUES ('complete', '1')`);
      db.exec('COMMIT');
      db.exec('ANALYZE');
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    } catch (e) {
      if (db.isOpen) db.close();
      if (tmp) rmSync(tmp, { force: true });
      throw e;
    }
    this.#skipped = skipped;

    const count = (table: string) =>
      (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
    const rows = {
      groups: count('grp'),
      observations: count('observation'),
      accounts: count('account'),
      memberships: count('membership'),
      adjacency: count('adj'),
      overlap: count('group_overlap') / 2,
    };

    let bytes: number;
    if (tmp) {
      db.close();
      rmSync(`${this.#path}-journal`, { force: true });
      renameSync(tmp, this.#path);
      bytes = statSync(this.#path).size;
      if (!this.#connected()) throw new Error(`relations: could not open ${this.#path}`);
    } else {
      const page = db.prepare('PRAGMA page_count').get() as { page_count: number };
      const size = db.prepare('PRAGMA page_size').get() as { page_size: number };
      bytes = page.page_count * size.page_size;
      db.exec('PRAGMA locking_mode = NORMAL; PRAGMA temp_store = MEMORY;');
      this.#db = db;
      this.#queries = new Queries(db);
    }
    return {
      path: this.#path,
      durable: this.durable,
      snapshots: report,
      skipped,
      rows,
      bytes,
      ms: Math.round(performance.now() - started),
    };
  }
}

function statOrNull(path: string) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

async function readOrSkip(
  source: SnapshotSource,
  sha256: string,
  skipped: SkippedSnapshot[],
): Promise<Snapshot | null> {
  try {
    const s = await source.get(sha256);
    if (!s) skipped.push({ sha256, reason: 'listed, but the store has no such file' });
    return s;
  } catch {
    // Not the error's own text: tools return this, and it can name a path on this machine.
    skipped.push({ sha256, reason: 'the file could not be read, or does not match its hash' });
    return null;
  }
}

const open = new Map<string, RelationsIndex>();

/** The process's one index for a state folder. Nothing touches the disk until it's asked something. */
export function stateIndex(stateDir: string): RelationsIndex {
  const path = join(stateDir, 'index.db');
  let index = open.get(path);
  if (!index) {
    index = new RelationsIndex(path);
    open.set(path, index);
  }
  return index;
}
