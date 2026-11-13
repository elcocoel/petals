// T198, SC-105: deleting the index and rebuilding it changes no answer, and however a file comes to
// be missing, stale or broken, the next question still gets an answer.
import {
  chmodSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, test, vi } from 'vitest';
import { type Queries, RelationsIndex, type SnapshotSource } from '../src/index.ts';
import { evm, shaOf, snap, source, tmpDir, tmpIndexPath } from './helpers.ts';

// Under heavy load (a machine at a load of 170-190) this file's tests pass alone and time out together:
// a longer limit here only; what they check is unchanged.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const [x, y, z] = [evm(1), evm(2), evm(3)] as [string, string, string];
const group = (name: string, holders: string[], o: Parameters<typeof snap>[0] = {}) =>
  snap({
    id: 'g',
    params: { name },
    title: name,
    holders: holders.map((h, i) => [h, String(10 + i)] as [string, string]),
    ...o,
  });
const key = (name: string, chain = 'eip155:1') => `g/${chain}/name:${name}/token_balance`;

const ONE = group('one', [x, y]);
const TWO = group('two', [y, z], { participantsTotal: 50, as_of: '2020-01-01T00:00:00Z' });
const THREE = group('three', [z, x], { chain: 'eip155:8453' });
const POOLS = snap({
  id: 'stake',
  chain: 'near:mainnet',
  population: 'p',
  delegations: [
    { from: 'a.near', to: 'p1.near', amount: '1' },
    { from: 'b.near', to: 'p1.near', amount: '1' },
    { from: 'b.near', to: 'p2.near', amount: '1' },
  ],
});
const ONE_LATER = group('one', [x, z], { as_of: '2026-06-01T00:00:00Z' });
const ONE_EARLIER = group('one', [y], { as_of: '2019-01-01T00:00:00Z' });

/** Every question, as JSON: what must not change. */
const answers = (q: Queries): string =>
  JSON.stringify({
    groups: [x, y, z, 'a.near', 'b.near', `eip155:1:${x}`, `eip155:8453:${x}`].map((a) =>
      q.accountGroups(a),
    ),
    shared: q.sharedAccounts(key('one'), key('two')),
    cross: q.sharedAccounts(key('one'), key('three', 'eip155:8453')),
    related: [key('one'), key('two'), 'stake/near:mainnet/p/delegators:p1.near'].flatMap((g) => [
      q.relatedGroups(g, { by: 'count' }),
      q.relatedGroups(g, { by: 'share' }),
    ]),
    overview: q.overview(),
    paths: [
      q.path(`eip155:1:${x}`, `eip155:1:${z}`),
      q.path(x, z, { includeInferred: true }),
      q.path('near:mainnet:a.near', 'near:mainnet:p2.near'),
      q.path(`eip155:1:${x}`, 'near:mainnet:a.near'),
    ],
  });

const all = [ONE, TWO, THREE, POOLS, ONE_LATER];

describe('deleting it loses nothing', () => {
  test('delete and rebuild: every answer and every row the same', async () => {
    const path = tmpIndexPath();
    const src = source(...all);
    const index = new RelationsIndex(path);
    const before = await index.answer(src, answers);
    const rows = await index.fingerprint();
    index.close();
    rmSync(path);
    expect(existsSync(path)).toBe(false);

    const again = new RelationsIndex(path);
    expect(await again.answer(src, answers)).toBe(before);
    expect(await again.fingerprint()).toBe(rows);
    expect(existsSync(path)).toBe(true);
  });

  test('deleted under a running process: the next answer rebuilds and matches', async () => {
    const path = tmpIndexPath();
    const src = source(...all);
    const index = new RelationsIndex(path);
    const before = await index.answer(src, answers);
    rmSync(path);
    expect(await index.answer(src, answers)).toBe(before);
    expect(existsSync(path)).toBe(true);
  });

  test('a rebuild gives what a first build gave, however the store lists', async () => {
    const first = new RelationsIndex(tmpIndexPath());
    await first.rebuild(source(...all));
    const second = new RelationsIndex(tmpIndexPath());
    await second.rebuild(source(...[...all].reverse()));
    expect(await second.fingerprint()).toBe(await first.fingerprint());
  });
});

describe('one snapshot at a time gives what a rebuild gives', () => {
  const orders = [
    [ONE, TWO, THREE, POOLS, ONE_LATER, ONE_EARLIER],
    [ONE_LATER, POOLS, THREE, ONE_EARLIER, TWO, ONE],
    [POOLS, ONE_EARLIER, ONE_LATER, TWO, ONE, THREE],
  ];

  test.each(orders.map((o, i) => [i, o] as const))('arrival order %i', async (_i, order) => {
    const rebuilt = new RelationsIndex(tmpIndexPath());
    await rebuilt.rebuild(source(...order));

    const [start, ...rest] = order;
    const src = source(start as (typeof order)[number]);
    const index = new RelationsIndex(tmpIndexPath());
    await index.sync(src);
    for (const s of rest) {
      src.add(s);
      await index.sync(src);
    }
    expect(await index.fingerprint()).toBe(await rebuilt.fingerprint());
    expect(await index.answer(src, answers)).toBe(await rebuilt.answer(src, answers));
  });

  test('a new snapshot goes in without building a new file', async () => {
    const path = tmpIndexPath();
    const src = source(ONE, TWO);
    const index = new RelationsIndex(path);
    await index.sync(src);
    const inode = statSync(path).ino;
    src.add(THREE);
    const related = await index.answer(src, (q) => q.relatedGroups(key('one')));
    expect(related.related.map((r) => r.group.group_id)).toContain(key('three', 'eip155:8453'));
    expect(statSync(path).ino).toBe(inode);
  });

  test('a newer date replaces a group’s overlaps; an older one leaves them alone', async () => {
    const src = source(ONE, TWO);
    const index = new RelationsIndex(tmpIndexPath());
    const shared = () => index.answer(src, (q) => q.sharedAccounts(key('one'), key('two')));
    expect(await shared()).toMatchObject({ shared: 1, a: { observations: 1 } });

    src.add(ONE_EARLIER);
    const older = await shared();
    expect(older).toMatchObject({ shared: 1, a: { observations: 2, latest: true } });
    expect(older.a.as_of).toBe(ONE.snapshot.as_of);

    src.add(ONE_LATER);
    const newer = await shared();
    expect(newer.a.as_of).toBe(ONE_LATER.snapshot.as_of);
    expect(newer.accounts.map((r) => r.account_a)).toEqual([`eip155:1:${z}`]);
    const related = await index.answer(src, (q) => q.relatedGroups(key('two')));
    expect(related.related[0]?.as_of_b).toBe(ONE_LATER.snapshot.as_of);
    expect(related.related).toHaveLength(1);
  });

  test('adding one twice changes nothing', async () => {
    const src = source(ONE, TWO);
    const index = new RelationsIndex(tmpIndexPath());
    await index.sync(src);
    const before = await index.fingerprint();
    await index.addSnapshot(shaOf(ONE), ONE);
    expect(await index.fingerprint()).toBe(before);
  });

  test('a cross-chain link appears when the second chain arrives', async () => {
    const src = source(ONE);
    const index = new RelationsIndex(tmpIndexPath());
    await index.sync(src);
    const q = () =>
      index.answer(src, (q) =>
        q.path(`eip155:1:${x}`, `eip155:8453:${z}`, { includeInferred: true }),
      );
    expect((await q()).found).toBe(false);
    src.add(THREE);
    const r = await q();
    expect(r.found).toBe(true);
    expect(r.hops.some((h) => h.via === 'same_address')).toBe(true);
  });
});

describe('a bad file rebuilds rather than fails', () => {
  async function built() {
    const path = tmpIndexPath();
    const src = source(...all);
    const index = new RelationsIndex(path);
    const before = await index.answer(src, answers);
    index.close();
    return { path, src, before };
  }

  test('not a database at all', async () => {
    const { path, src, before } = await built();
    writeFileSync(path, 'not sqlite, and long enough to be read as a header');
    expect(await new RelationsIndex(path).answer(src, answers)).toBe(before);
  });

  test('cut off halfway', async () => {
    const { path, src, before } = await built();
    const bytes = readFileSync(path);
    writeFileSync(path, bytes.subarray(0, Math.floor(bytes.length / 2)));
    expect(await new RelationsIndex(path).answer(src, answers)).toBe(before);
  });

  test('damaged in the middle, with a sound header', async () => {
    const { path, src, before } = await built();
    const bytes = readFileSync(path);
    bytes.fill(0xff, 8192, bytes.length - 4096);
    writeFileSync(path, bytes);
    expect(await new RelationsIndex(path).answer(src, answers)).toBe(before);
  });

  test('an empty file', async () => {
    const { path, src, before } = await built();
    writeFileSync(path, '');
    expect(await new RelationsIndex(path).answer(src, answers)).toBe(before);
  });

  test('from another version of the schema', async () => {
    const { path, src, before } = await built();
    const db = new DatabaseSync(path);
    db.exec('PRAGMA user_version = 999');
    db.close();
    expect(await new RelationsIndex(path).answer(src, answers)).toBe(before);
    const check = new DatabaseSync(path);
    const row = check.prepare('PRAGMA user_version').get() as { user_version: number };
    check.close();
    expect(row.user_version).toBeLessThan(999);
  });

  test('a build that never finished is no index', async () => {
    const { path, src, before } = await built();
    const db = new DatabaseSync(path);
    db.exec(`DELETE FROM meta`);
    db.close();
    expect(await new RelationsIndex(path).answer(src, answers)).toBe(before);
  });

  test('broken while open, between two questions', async () => {
    const path = tmpIndexPath();
    const src = source(...all);
    const index = new RelationsIndex(path);
    const before = await index.answer(src, answers);
    const db = new DatabaseSync(path);
    db.exec('DROP TABLE group_overlap');
    db.close();
    expect(await index.answer(src, answers)).toBe(before);
  });
});

describe('what the store says wins', () => {
  test('a snapshot gone from the store goes from the index', async () => {
    const src = source(ONE, TWO);
    const index = new RelationsIndex(tmpIndexPath());
    await index.sync(src);
    src.remove(TWO);
    const o = await index.answer(src, (q) => q.overview());
    expect(o.groups.map((g) => g.id)).toEqual([key('one')]);
    expect(o.pairs).toEqual([]);
  });

  test('a listed snapshot with no file is reported, the rest still answers, and it can come back', async () => {
    const src = source(ONE, TWO);
    const missing = shaOf(THREE);
    src.list_only(missing);
    const index = new RelationsIndex(tmpIndexPath());
    const o = await index.answer(src, (q) => q.overview());
    expect(o.index.snapshots).toBe(2);
    expect(index.skipped).toEqual([
      { sha256: missing, reason: 'listed, but the store has no such file' },
    ]);
    src.add(THREE);
    await index.sync(src);
    expect(index.skipped).toEqual([]);
    expect((await index.answer(src, (q) => q.overview())).index.snapshots).toBe(3);
  });

  test('an unreadable snapshot is skipped with a reason that names no path', async () => {
    const src = source(ONE);
    const bad: SnapshotSource = {
      list: async () => [{ sha256: shaOf(ONE) }, { sha256: 'b'.repeat(64) }],
      get: async (sha) => {
        if (sha === shaOf(ONE)) return ONE;
        throw new Error('store: /a/secret/path holds bytes with the wrong hash');
      },
    };
    const index = new RelationsIndex(tmpIndexPath());
    await index.rebuild(bad);
    expect(index.skipped[0]?.reason).not.toMatch(/secret/);
    expect((await index.answer(src, (q) => q.overview())).groups).toHaveLength(1);
  });

  test('a snapshot that can’t be read as groups is skipped, and writes nothing', async () => {
    const broken = group('broken', [x], { as_of: 'not a date' });
    const src = source(ONE, broken);
    const path = tmpIndexPath();
    const index = new RelationsIndex(path);
    const o = await index.answer(src, (q) => q.overview());
    expect(o.index.snapshots).toBe(1);
    expect(index.skipped.map((s) => s.sha256)).toEqual([shaOf(broken)]);
  });
});

describe('where the file lives', () => {
  test('a failed rebuild leaves the old index, and no temporary file', async () => {
    const path = tmpIndexPath();
    const src = source(ONE, TWO);
    const index = new RelationsIndex(path);
    const before = await index.answer(src, answers2);
    const failing: SnapshotSource = {
      list: async () => {
        throw new Error('the store is down');
      },
      get: async () => null,
    };
    await expect(index.rebuild(failing)).rejects.toThrow(/down/);
    expect(readdirSync(dirname(path))).toEqual(['index.db']);
    expect(await index.answer(src, answers2)).toBe(before);
  });

  test('what a crashed build left behind is cleared by the next', async () => {
    const path = tmpIndexPath();
    writeFileSync(`${path}.12345.tmp`, 'left by a crash');
    await new RelationsIndex(path).rebuild(source(ONE));
    expect(readdirSync(dirname(path))).toEqual(['index.db']);
  });

  test('a folder that can’t be written: in memory, with one line, and still right', async () => {
    const dir = tmpDir();
    chmodSync(dir, 0o555);
    const lines: string[] = [];
    const src = source(...all);
    const index = new RelationsIndex(join(dir, 'state', 'index.db'), {
      log: (l) => lines.push(l),
    });
    const inMemory = await index.answer(src, answers);
    expect(index.durable).toBe(false);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/in memory/);
    src.add(ONE_EARLIER);
    expect(await index.answer(src, (q) => q.overview().index.snapshots)).toBe(6);
    chmodSync(dir, 0o755);

    const onDisk = new RelationsIndex(tmpIndexPath());
    expect(inMemory).toBe(await onDisk.answer(source(...all), answers));
  });

  test('a read-only file answers, then moves aside when a snapshot needs writing', async () => {
    const path = tmpIndexPath();
    const src = source(ONE, TWO);
    const first = new RelationsIndex(path);
    await first.sync(src);
    first.close();
    chmodSync(path, 0o444);
    const index = new RelationsIndex(path);
    expect((await index.answer(src, (q) => q.overview())).index.snapshots).toBe(2);
    src.add(THREE);
    expect((await index.answer(src, (q) => q.overview())).index.snapshots).toBe(3);
  });

  test('a build another process finished is picked up', async () => {
    const path = tmpIndexPath();
    const a = new RelationsIndex(path);
    const b = new RelationsIndex(path);
    const src = source(ONE, TWO);
    await a.sync(src);
    expect(await b.answer(src, (q) => q.overview().index.snapshots)).toBe(2);
    src.add(THREE);
    await a.rebuild(src);
    expect(await b.answer(src, (q) => q.overview().index.snapshots)).toBe(3);
  });

  test('questions arriving together share one build', async () => {
    const path = tmpIndexPath();
    let lists = 0;
    const inner = source(...all);
    const src: SnapshotSource = {
      list: async () => {
        lists++;
        return inner.list();
      },
      get: inner.get,
    };
    const index = new RelationsIndex(path);
    const outs = await Promise.all(
      Array.from({ length: 8 }, () => index.answer(src, (q) => q.overview().pairs_total)),
    );
    expect(new Set(outs).size).toBe(1);
    expect(lists).toBeGreaterThan(0);
    expect(readdirSync(dirname(path))).toEqual(['index.db']);
  });

  test('nothing touches the disk until something is asked', () => {
    const path = tmpIndexPath();
    new RelationsIndex(path);
    expect(existsSync(path)).toBe(false);
  });
});

function answers2(q: Queries): string {
  return JSON.stringify(q.overview());
}
