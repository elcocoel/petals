// "Use it a lot and learn": the real conversations on this Mac that nobody has read yet, from every
// Petal store (the app's and each lane's). Read-only, no model. Each one that went badly becomes a case
// in scripts/stress-cases.ts. Run it from any worktree.
//
//   node scripts/new-runs.ts            what's new since the last --mark
//   node scripts/new-runs.ts --mark     the same, then remember that it's been read
//   node scripts/new-runs.ts --all      everything, ignoring the mark
//
// Recorded replays and stub models spent nothing and said nothing real, so they're left out, as are the
// harness's own questions.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const PROJECT = resolve(import.meta.dirname, '../..');
const SEEN = join(PROJECT, 'design/stress/seen.json');
const HARNESS = /^Who stands behind NEAR.s validators\? Make me a fresh flower with their backers/;

type Row = {
  id: string;
  owner: string | null;
  status: string;
  model: string | null;
  created_at: string;
};
type Event = { type: string; data: string };

const clip = (s: unknown, n: number) => {
  const t = String(s ?? '').replace(/\/draft\?spec=[\w=&;%-]+/g, '/draft?spec=…');
  return t.length > n ? `${t.slice(0, n)} …[${t.length}]` : t;
};

const HOME_DIR = join(homedir(), 'Library/Application Support/Petals');
const stores = [
  // Elco's app, since 6 Nov (scripts/serve-testnet.sh), and the container
  { name: 'elco', path: join(HOME_DIR, 'elco/private.db') },
  { name: 'container', path: join(HOME_DIR, 'data/private.db') },
  ...readdirSync(PROJECT)
    .filter((d) => d === 'build' || d.startsWith('build.'))
    .map((d) => ({ name: d, path: join(PROJECT, d, '.petal/private.db') })),
].filter((s) => existsSync(s.path));

const all = process.argv.includes('--all');
const seen: Record<string, string> =
  !all && existsSync(SEEN) ? JSON.parse(readFileSync(SEEN, 'utf8')) : {};
const next: Record<string, string> = existsSync(SEEN) ? JSON.parse(readFileSync(SEEN, 'utf8')) : {};
let shown = 0;

// The container's SQLite locks live in its own kernel, so nothing on this Mac may open a database it
// holds (coordinator/backup.sh). That one is read from a copy made from inside it.
const FOLDER_FILE = join(HOME_DIR, 'data-folder');
const held = existsSync(FOLDER_FILE)
  ? readFileSync(FOLDER_FILE, 'utf8').trim()
  : join(HOME_DIR, 'data');
const SNAP = `const { DatabaseSync, backup } = require("node:sqlite");
backup(new DatabaseSync(process.argv[1], { readOnly: true, timeout: 15000 }), process.argv[2])
  .catch((e) => { console.error(e.message); process.exit(1); });`;
const COPY = '.read-copy.db';

/** A path that's safe to open here; the second answer says there's a copy to remove afterwards. */
function safePath(path: string): { path: string; copied: boolean } {
  if (dirname(path) !== held) return { path, copied: false };
  const up = spawnSync('/opt/homebrew/bin/container', ['inspect', 'petals'], { encoding: 'utf8' });
  if (up.status !== 0 || !up.stdout.includes('"running"')) return { path, copied: false };
  const made = spawnSync(
    '/opt/homebrew/bin/container',
    ['exec', 'petals', 'node', '--no-warnings', '-e', SNAP, '/data/private.db', `/data/${COPY}`],
    { encoding: 'utf8' },
  );
  if (made.status !== 0) throw new Error(`couldn't copy from inside the container: ${made.stderr}`);
  return { path: join(held, COPY), copied: true };
}

for (const store of stores) {
  let db: DatabaseSync;
  let opened: { path: string; copied: boolean } = { path: store.path, copied: false };
  try {
    opened = safePath(store.path);
    // immutable: a copy needs no sidecar files, and none are left in the folder the container holds
    const at = opened.copied ? `file:${encodeURI(opened.path)}?immutable=1` : opened.path;
    db = new DatabaseSync(at, { readOnly: true });
  } catch (e) {
    console.log(`(can't read ${store.name}: ${String(e)})`);
    continue;
  }
  const since = seen[store.name] ?? '';
  const runs = db
    .prepare(
      'select id, owner, status, model, created_at from run where updated_at > ? order by created_at',
    )
    .all(since) as Row[];
  const newest = db.prepare('select max(updated_at) as at from run').get() as { at: string | null };
  if (newest.at) next[store.name] = newest.at;
  for (const r of runs) {
    if (!r.model || /recorded|stub/i.test(r.model)) continue;
    const events = db
      .prepare('select type, data from run_event where run = ? order by seq')
      .all(r.id) as Event[];
    const thread = db.prepare('select messages from run_thread where run = ?').get(r.id) as
      | { messages: string }
      | undefined;
    const body = thread
      ? JSON.parse(thread.messages)
      : (JSON.parse(
          (db.prepare('select body from run where id = ?').get(r.id) as { body: string }).body,
        ).messages ?? []);
    const said = (body as { role: string; content: string }[])
      .filter((m) => m.role === 'user')
      .map((m) => m.content);
    if (said.some((s) => HARNESS.test(s))) continue;
    shown++;
    console.log(
      `\n===== ${store.name} ${r.id.slice(0, 10)} ${r.created_at.slice(5, 16)} ${r.status} ${r.model}`,
    );
    for (const s of said) console.log(`YOU: ${clip(s, 300)}`);
    let usd = 0;
    for (const e of events) {
      const d = JSON.parse(e.data);
      if (e.type === 'tool_result' && !d.ok)
        console.log(`  tool failed: ${d.name}: ${clip(d.summary, 140)}`);
      if (e.type === 'approval_required') console.log('  the yes gate held a call');
      if (e.type === 'flower') console.log(`  drew ${String(d.spec_sha256).slice(0, 10)}`);
      if (e.type === 'error') console.log(`  ERROR ${d.code}: ${clip(d.message, 200)}`);
      if (e.type === 'message') console.log(`  PETAL: ${clip(d.text, 500)}`);
      if (e.type === 'done') usd += d.cost_usd ?? 0;
    }
    console.log(`  spent $${usd.toFixed(4)}`);
  }
  db.close();
  if (opened.copied) rmSync(opened.path, { force: true });
}
console.log(shown ? `\n${shown} conversations` : 'nothing new');
if (process.argv.includes('--mark')) writeFileSync(SEEN, `${JSON.stringify(next, null, 1)}\n`);
