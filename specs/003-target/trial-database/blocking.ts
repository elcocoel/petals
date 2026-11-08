// Does one waiting SQLite call hold up everyone else in the same Node process? A second process holds the
// database's write lock for 2 seconds, as a backup or a script on the same file might. Meanwhile:
//   A. the main thread writes, as Petals' store does today (node:sqlite, synchronous, 5 s busy timeout);
//   B. a worker thread writes, and the main thread only waits for its answer.
// A timer that should tick every 10 ms stands in for every other visitor's request. The longest gap
// between ticks is how long everyone else was kept waiting.
//   node blocking.ts <scratch folder>
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

const dir = mkdtempSync(join(process.argv[2] as string, 'blocking-'));
const file = join(dir, 'demo.db');
const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
const setup = new DatabaseSync(file);
setup.exec('PRAGMA journal_mode = WAL; CREATE TABLE t (v TEXT)');
setup.close();

/** Another process takes the write lock and keeps it for `ms`. Resolves once it holds it. */
function holdLock(ms: number): Promise<void> {
  const child = spawn(process.execPath, [
    '--no-warnings',
    '-e',
    `const { DatabaseSync } = require('node:sqlite');
     const db = new DatabaseSync(${JSON.stringify(file)});
     db.exec('BEGIN IMMEDIATE'); console.log('held');
     Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${ms});
     db.exec('COMMIT');`,
  ]);
  return new Promise((resolve) => child.stdout.once('data', () => resolve()));
}

/** Runs `f` while a 10 ms timer ticks, and reports the longest gap between ticks. */
async function measure(label: string, f: () => Promise<void> | void) {
  let last = performance.now();
  let worst = 0;
  const t = setInterval(() => {
    const now = performance.now();
    worst = Math.max(worst, now - last);
    last = now;
  }, 10);
  const start = performance.now();
  await f();
  const took = performance.now() - start;
  await new Promise((r) => setTimeout(r, 50));
  clearInterval(t);
  console.log(`${label}: the write took ${Math.round(took)} ms; everyone else waited up to ${Math.round(worst)} ms`);
}

await holdLock(2000);
await measure('A. synchronous, on the main thread (today)', () => {
  const db = new DatabaseSync(file, { timeout: 5000 });
  db.prepare('INSERT INTO t VALUES (?)').run('a');
  db.close();
});

await new Promise((r) => setTimeout(r, 2200));
await holdLock(2000);
await measure('B. the same write on a worker thread', async () => {
  const w = new Worker(
    `const { DatabaseSync } = require('node:sqlite');
     const { parentPort, workerData } = require('node:worker_threads');
     const db = new DatabaseSync(workerData, { timeout: 5000 });
     db.prepare('INSERT INTO t VALUES (?)').run('b');
     db.close(); parentPort.postMessage('done');`,
    { eval: true, workerData: file },
  );
  await new Promise((r) => w.once('message', r));
  await w.terminate();
});
