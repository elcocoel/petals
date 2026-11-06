// Fold real conversations from one store into another, so a lane can go without losing what someone
// said to it, and one person's work has one home. Whole rows are copied; the source isn't touched.
// A run already in the target stays as it is, so running this twice changes nothing.
//
//   node scripts/fold-runs.ts --from <private.db> --to <private.db> [--dry]
//   node scripts/fold-runs.ts --from <db> --to <db> --only <id prefix,…> --owner <owner>
//   node scripts/fold-runs.ts --adopt <db> --owner <owner> [--dry]
//
// Real means a real model answered and it isn't a harness's question. --owner gives what's folded to
// that owner, since a lane's anonymous owner means nothing in another store: put it first, because
// a later run won't change a row. --adopt gives a store's unowned runs, from before runs had owners,
// to that owner, recorded replays included: those were still someone's real questions.

import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';

const { values: o } = parseArgs({
  options: {
    from: { type: 'string' },
    to: { type: 'string' },
    adopt: { type: 'string' },
    only: { type: 'string' },
    owner: { type: 'string' },
    dry: { type: 'boolean', default: false },
  },
});

const HARNESS = /^Who stands behind NEAR.s validators\? Make me a fresh flower with their backers/;
type Row = Record<string, string | number | null>;

function saidIn(body: string): string[] {
  try {
    const messages = (JSON.parse(body) as { messages?: { role: string; content: string }[] })
      .messages;
    return (messages ?? []).filter((m) => m.role === 'user').map((m) => m.content);
  } catch {
    return [];
  }
}

const isReal = (r: Row) =>
  Boolean(r.model) &&
  !/recorded|stub/i.test(String(r.model)) &&
  !saidIn(String(r.body)).some((s) => HARNESS.test(s));

const columns = (db: DatabaseSync, table: string) =>
  (db.prepare(`pragma table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

function copy(from: DatabaseSync, to: DatabaseSync, table: string, rows: Row[], change: Row = {}) {
  const shared = columns(from, table).filter((c) => columns(to, table).includes(c));
  const put = to.prepare(
    `insert or ignore into ${table} (${shared.join(',')}) values (${shared.map(() => '?').join(',')})`,
  );
  let n = 0;
  for (const row of rows) {
    const out = { ...row, ...change };
    n += Number(put.run(...shared.map((c) => out[c] ?? null)).changes);
  }
  return n;
}

function adopt(path: string, owner: string) {
  const db = new DatabaseSync(path);
  const rows = db.prepare('select id, body from run where owner is null').all() as Row[];
  const ids = rows
    .filter((r) => !saidIn(String(r.body)).some((s) => HARNESS.test(s)))
    .map((r) => r.id);
  if (!o.dry) {
    const set = db.prepare('update run set owner = ? where id = ? and owner is null');
    for (const id of ids) set.run(owner, id);
  }
  console.log(`${o.dry ? 'would adopt' : 'adopted'} ${ids.length} of ${rows.length} unowned runs`);
  db.close();
}

function fold(fromPath: string, toPath: string) {
  const from = new DatabaseSync(fromPath, { readOnly: true });
  const to = new DatabaseSync(toPath);
  const prefixes = o.only?.split(',');
  const runs = (from.prepare('select * from run').all() as Row[]).filter(
    (r) => isReal(r) && (!prefixes || prefixes.some((p) => String(r.id).startsWith(p))),
  );
  let done = 0;
  if (!o.dry) {
    to.exec('BEGIN IMMEDIATE');
    try {
      for (const r of runs) {
        const owned: Row = o.owner ? { owner: o.owner } : {};
        if (!copy(from, to, 'run', [r], owned)) continue;
        done++;
        const of = (table: string, key: string, value: unknown) =>
          from.prepare(`select * from ${table} where ${key} = ?`).all(value as string) as Row[];
        copy(from, to, 'run_event', of('run_event', 'run', r.id));
        copy(from, to, 'run_thread', of('run_thread', 'run', r.id));
        // the work behind it comes too, or its link would point at nothing
        if (r.exploration) {
          copy(from, to, 'exploration', of('exploration', 'id', r.exploration), owned);
          copy(from, to, 'step', of('step', 'exploration', r.exploration));
          copy(from, to, 'note', of('note', 'exploration', r.exploration));
        }
      }
      to.exec('COMMIT');
    } catch (e) {
      to.exec('ROLLBACK');
      throw e;
    }
  }
  console.log(
    `${o.dry ? `would fold ${runs.length}` : `folded ${done} new, of ${runs.length}`} real conversations from ${fromPath}`,
  );
  from.close();
  to.close();
}

if (o.adopt && o.owner) adopt(o.adopt, o.owner);
else if (o.from && o.to) fold(o.from, o.to);
else {
  console.error(
    'usage: fold-runs.ts --from <db> --to <db> [--only ids --owner o] | --adopt <db> --owner o',
  );
  process.exitCode = 2;
}
