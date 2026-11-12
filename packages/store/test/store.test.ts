// T189: the store itself. What must survive, what must count once, and what happens when the state
// folder can't be written.
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, test } from 'vitest';
import { MIGRATIONS, openStore, type Store, stateStore } from '../src/index.ts';

const AT = '2026-11-05T12:00:00.000Z';
const LATER = '2026-11-05T12:10:00.000Z';
const dbPath = () => join(mkdtempSync(join(tmpdir(), 'petal-store-')), 'private.db');

/** Calls interleaved on the event loop, the way concurrent requests are. */
const together = <T>(n: number, f: () => T) =>
  Promise.all(Array.from({ length: n }, async () => (await null, f())));

const runRow = (id: string, owner: string | null = null) => ({
  id,
  owner,
  exploration: null,
  status: 'running',
  model: null,
  body: '{}',
  created_at: AT,
  updated_at: AT,
});

describe('openStore', () => {
  test('a file gets WAL, and is durable; :memory: works and says it is not', async () => {
    const path = dbPath();
    const store = openStore(path);
    expect(store.durable).toBe(true);
    await store.close();
    const raw = new DatabaseSync(path);
    expect(raw.prepare('PRAGMA journal_mode').get()).toMatchObject({ journal_mode: 'wal' });
    raw.close();

    const memory = openStore(':memory:');
    expect(memory.durable).toBe(false);
    await memory.person.create({ id: 'p1', created_at: AT });
    expect(await memory.person.get('p1')).toEqual({ id: 'p1', created_at: AT, tip: null });
  });

  test('migrations run once each, in order; a new one applies on the next open', async () => {
    const path = dbPath();
    const first = openStore(path);
    await first.person.create({ id: 'p1', created_at: AT });
    first.close();

    const next = [...MIGRATIONS, 'CREATE TABLE added (a TEXT);'];
    const second = openStore(path, next);
    expect(await second.person.get('p1')).toMatchObject({ id: 'p1' });
    second.close();
    // a third open runs nothing again: re-running either migration would fail on its tables
    openStore(path, next).close();

    const raw = new DatabaseSync(path);
    const rows = raw.prepare('SELECT version FROM schema_migration ORDER BY version').all();
    expect(rows.map((r) => r.version)).toEqual(next.map((_, i) => i + 1));
    expect(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'added'").get()).toBeTruthy();
    raw.close();
  });

  test('a failing migration leaves nothing behind, and the open throws', async () => {
    const path = dbPath();
    openStore(path).close();
    expect(() =>
      openStore(path, [...MIGRATIONS, 'CREATE TABLE half (a TEXT); THIS IS NOT SQL;']),
    ).toThrow();
    const raw = new DatabaseSync(path);
    expect(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'half'").get()).toBeUndefined();
    raw.close();
  });

  test('tx: all or nothing; nested calls join it', async () => {
    const store = openStore(':memory:');
    await expect(
      store.tx(async () => {
        await store.person.create({ id: 'gone', created_at: AT });
        await store.tx(async () => await store.person.create({ id: 'gone too', created_at: AT }));
        throw new Error('no');
      }),
    ).rejects.toThrow('no');
    expect(await store.person.get('gone')).toBeNull();
    expect(await store.person.get('gone too')).toBeNull();
    await store.person.create({ id: 'after', created_at: AT });
    expect(await store.person.get('after')).not.toBeNull();
  });

  test('after close, every call throws: a store that is down is never read as empty', async () => {
    const store = openStore(dbPath());
    await store.close();
    await expect(store.ledger.get('2026-11-05')).rejects.toThrow();
    await expect(store.ledger.reserve('2026-11-05', 1, 3)).rejects.toThrow();
    expect(() => store.close()).not.toThrow();
  });
});

describe('a restart loses nothing', () => {
  /** Each table, written by one connection. */
  async function write(s: Store) {
    await s.person.create({ id: 'p1', created_at: AT });
    await s.walletBinding.bind({
      person: 'p1',
      network: 'testnet',
      caip10_encrypted: 'enc',
      caip10_hash: 'h1',
      proved_at: AT,
    });
    await s.session.put({ hash: 's1', subject: 'p1', expires_at: LATER });
    await s.challenge.put('n1', LATER, AT);
    await s.challenge.reserve('n1', AT);
    await s.challenge.spend('n1', AT);
    await s.run.insert(runRow('r1', 'p1'));
    await s.runEvent.append('r1', 'run', '{"a":1}', AT);
    await s.runEvent.append('r1', 'message', '{"a":2}', AT);
    await s.runThread.save('r1', '[]', AT);
    await s.ledger.settle('2026-11-05', 0, 0.25);
    await s.ledger.reserve('2026-11-05', 0.05, 3);
    await s.credit.apply({ id: 'c1', account_key: 'a', delta_usd: 2, reason: 'test', at: AT });
    await s.invite.create({ id: 'i1', token_hash: 't1', budget_usd: 5, expires_at: null });
    await s.draft.put({ sha256: 'd1', body: 'x', created_at: AT });
    await s.publishDraft.put('e1', '{}', AT);
    await s.publishDraft.claim('e1', AT);
    await s.exploration.create({
      id: 'x1',
      owner: 'p1',
      question: 'who?',
      target: null,
      head: null,
      visibility: 'private',
      share_token_hash: null,
      forked_from: null,
      created_at: AT,
      updated_at: AT,
    });
    await s.step.append({
      exploration: 'x1',
      parent: null,
      spec_sha256: 'sp',
      recipe_sha256: null,
      snapshot_sha256: null,
      door: 'site',
      note: null,
      at: AT,
    });
    await s.note.append({ exploration: 'x1', author: 'p1', text: 'hi', at: AT });
  }

  async function expectAll(s: Store) {
    expect(await s.person.get('p1')).toMatchObject({ id: 'p1' });
    expect(await s.walletBinding.byHash('h1')).toMatchObject({ person: 'p1' });
    expect(await s.session.get('s1', AT)).toMatchObject({ subject: 'p1' });
    expect(await s.challenge.reserve('n1', AT)).toBe('used');
    expect(await s.run.get('r1')).toMatchObject({ owner: 'p1', status: 'running' });
    expect((await s.runEvent.list('r1')).map((e) => e.seq)).toEqual([0, 1]);
    expect(await s.runThread.get('r1')).toBe('[]');
    expect(await s.ledger.get('2026-11-05')).toMatchObject({ usd: 0.25, reserved_usd: 0.05 });
    expect(await s.credit.get('a')).toMatchObject({ balance_usd: 2 });
    expect(await s.invite.get('i1')).toMatchObject({ budget_usd: 5 });
    expect(await s.draft.get('d1')).toMatchObject({ body: 'x' });
    expect(await s.publishDraft.claim('e1', LATER)).toBe(false);
    expect((await s.exploration.listByOwner('p1')).map((x) => x.id)).toEqual(['x1']);
    expect(await s.step.list('x1')).toHaveLength(1);
    expect(await s.note.list('x1')).toHaveLength(1);
  }

  test('reopening the file finds every table as it was', async () => {
    const path = dbPath();
    const a = openStore(path);
    await write(a);
    await a.close();
    const b = openStore(path);
    await expectAll(b);
    // and the log carries on from where it was
    expect(await b.runEvent.append('r1', 'done', '{}', LATER)).toBe(2);
    await b.close();
  });

  test('a process killed with SIGKILL, never closing, loses nothing it committed', async () => {
    const path = dbPath();
    const src = new URL('../src/index.ts', import.meta.url).href;
    const child = spawn(
      process.execPath,
      [
        '--disable-warning=ExperimentalWarning',
        '--input-type=module',
        '-e',
        `import { openStore } from ${JSON.stringify(src)};
         const s = openStore(${JSON.stringify(path)});
         await s.run.insert({ id: 'k1', owner: null, exploration: null, status: 'running', model: null,
           body: '{}', created_at: 'a', updated_at: 'a' });
         for (let i = 0; i < 50; i++) await s.runEvent.append('k1', 'message', String(i), 'a');
         await s.ledger.reserve('2026-11-05', 0.05, 3);
         await s.ledger.settle('2026-11-05', 0.05, 0.02);
         console.log('ready');
         setInterval(() => {}, 1000);`,
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    await new Promise<void>((ok, no) => {
      child.stdout.once('data', () => ok());
      child.once('exit', (code) => no(new Error(`child exited early: ${code}`)));
    });
    const dead = new Promise((ok) => child.once('exit', ok));
    child.kill('SIGKILL');
    await dead;

    // the WAL is still there, not yet folded into the database: this is the recovery path
    expect(existsSync(`${path}-wal`)).toBe(true);
    const s = openStore(path);
    expect(await s.runEvent.list('k1')).toHaveLength(50);
    expect(await s.ledger.get('2026-11-05')).toMatchObject({ usd: 0.02, reserved_usd: 0 });
    s.close();
  });
});

describe('the ledger', () => {
  const DAY = '2026-11-05';

  test('reserve holds under the cap, settle swaps the hold for what was spent', async () => {
    const { ledger } = openStore(':memory:');
    expect(await ledger.reserve(DAY, 0.05, 3)).toBe(0.05);
    expect(await ledger.get(DAY)).toMatchObject({ usd: 0, reserved_usd: 0.05 });
    await ledger.settle(DAY, 0.05, 0.01);
    expect(await ledger.get(DAY)).toMatchObject({ usd: 0.01, reserved_usd: 0 });
  });

  test('near the cap a hold shrinks to what is left; at the cap there is none', async () => {
    const { ledger } = openStore(':memory:');
    await ledger.add(DAY, 2.99);
    expect(await ledger.reserve(DAY, 0.05, 3)).toBeCloseTo(0.01, 9);
    expect(await ledger.reserve(DAY, 0.05, 3)).toBeNull();
    expect(await openStore(':memory:').ledger.reserve(DAY, 0.05, 0)).toBeNull();
  });

  test('concurrent chats can never hold more than the cap', async () => {
    const { ledger } = openStore(':memory:');
    const holds = await together(50, () => ledger.reserve(DAY, 0.05, 0.12));
    const held = holds.filter((h) => h !== null) as number[];
    expect(held).toHaveLength(3);
    expect(held.reduce((a, b) => a + b, 0)).toBeCloseTo(0.12, 9);
  });

  test('a hold nobody settled (a crash) still counts until the day ends', async () => {
    const path = dbPath();
    const a = openStore(path);
    await a.ledger.reserve(DAY, 3, 3);
    await a.close();
    const b = openStore(path);
    expect(await b.ledger.reserve(DAY, 0.05, 3)).toBeNull();
    expect(await b.ledger.reserve('2026-11-06', 0.05, 3)).toBe(0.05);
    await b.close();
  });

  test('seed sets a day only if it has no row yet', async () => {
    const { ledger } = openStore(':memory:');
    await ledger.seed(DAY, 1.5);
    await ledger.seed(DAY, 9);
    expect((await ledger.get(DAY)).usd).toBe(1.5);
  });
});

describe('credit', () => {
  const entry = (id: string, delta_usd = 1) => ({
    id,
    account_key: 'a',
    delta_usd,
    reason: 'test',
    at: AT,
  });

  test('one id counts once', async () => {
    const { credit } = openStore(':memory:');
    expect(await credit.apply(entry('tx1'))).toBe(true);
    expect(await credit.apply(entry('tx1'))).toBe(false);
    expect((await credit.get('a'))?.balance_usd).toBe(1);
    expect(await credit.entries('a')).toHaveLength(1);
    expect(await credit.apply(entry('tx2'))).toBe(true);
    expect((await credit.get('a'))?.balance_usd).toBe(2);
  });

  test('one id counts once under concurrent async calls, and across connections', async () => {
    const path = dbPath();
    const a = openStore(path);
    const b = openStore(path);
    const out = await together(20, () =>
      Promise.all([a.credit.apply(entry('tx1')), b.credit.apply(entry('tx1'))]),
    );
    expect(out.flat().filter(Boolean)).toHaveLength(1);
    expect((await a.credit.get('a'))?.balance_usd).toBe(1);
    await a.close();
    await b.close();
  });

  test('one id counts once across a restart', async () => {
    const path = dbPath();
    const a = openStore(path);
    await a.credit.apply(entry('tx1'));
    await a.close();
    const b = openStore(path);
    expect(await b.credit.apply(entry('tx1'))).toBe(false);
    expect((await b.credit.get('a'))?.balance_usd).toBe(1);
    await b.close();
  });

  test('reserve then settle draws the balance down; nothing left means no hold', async () => {
    const { credit } = openStore(':memory:');
    expect(await credit.reserve('nobody', 1)).toBeNull();
    await credit.apply(entry('tx1', 0.08));
    expect(await credit.reserve('a', 0.05)).toBe(0.05);
    expect(await credit.reserve('a', 0.05)).toBeCloseTo(0.03, 9);
    expect(await credit.reserve('a', 0.05)).toBeNull();
    await credit.settle('a', 0.05, 0.01);
    expect(await credit.get('a')).toMatchObject({ balance_usd: 0.07 });
    expect((await credit.get('a'))?.reserved_usd).toBeCloseTo(0.03, 9);
    await expect(credit.settle('nobody', 1, 1)).rejects.toThrow(/no credit account/);
  });
});

describe('single use', () => {
  test('a nonce is taken by one caller, under concurrent async calls and across connections', async () => {
    const path = dbPath();
    const a = openStore(path);
    const b = openStore(path);
    await a.challenge.put('n1', LATER, AT);
    const out = await together(20, () =>
      Promise.all([a.challenge.reserve('n1', AT), b.challenge.reserve('n1', AT)]),
    );
    expect(out.flat().filter((c) => c === 'ok')).toHaveLength(1);
    expect(out.flat().filter((c) => c === 'used')).toHaveLength(39);
    await a.close();
    await b.close();
  });

  test('unknown, expired, released, spent', async () => {
    const { challenge } = openStore(':memory:');
    expect(await challenge.reserve('nope', AT)).toBe('unknown');
    await challenge.put('n1', LATER, AT);
    expect(await challenge.reserve('n1', LATER)).toBe('expired');
    expect(await challenge.reserve('n1', AT)).toBe('ok');
    expect(await challenge.reserve('n1', AT)).toBe('used');
    await challenge.release('n1');
    expect(await challenge.reserve('n1', AT)).toBe('ok');
    await challenge.spend('n1', AT);
    await challenge.release('n1');
    expect(await challenge.reserve('n1', AT)).toBe('used');
  });

  test('issuing clears what has expired', async () => {
    const { challenge } = openStore(':memory:');
    await challenge.put('old', AT, AT);
    await challenge.put('new', '2026-11-05T13:00:00.000Z', LATER);
    expect(await challenge.reserve('old', AT)).toBe('unknown');
  });

  test('a publish draft is claimed once, under concurrent async calls', async () => {
    const { publishDraft } = openStore(':memory:');
    await publishDraft.put('e1', '{}', AT);
    const out = await together(20, () => publishDraft.claim('e1', AT));
    expect(out.filter(Boolean)).toHaveLength(1);
    expect((await publishDraft.get('e1'))?.used_at).toBe(AT);
    // preparing again is a new nonce and a new chance, as it always was
    await publishDraft.put('e1', '{"again":true}', AT);
    expect(await publishDraft.claim('e1', LATER)).toBe(true);
    expect(await publishDraft.claim('missing', LATER)).toBe(false);
  });

  test('a draft link is put-if-absent', async () => {
    const { draft } = openStore(':memory:');
    expect(await draft.put({ sha256: 'd', body: 'first', created_at: AT })).toBe(true);
    expect(await draft.put({ sha256: 'd', body: 'second', created_at: AT })).toBe(false);
    expect((await draft.get('d'))?.body).toBe('first');
  });
});

describe('the thin tables', () => {
  test('idsWithStatus finds a run by status, owner or not', async () => {
    const { run } = openStore(':memory:');
    await run.insert({ ...runRow('r1'), status: 'running' });
    await run.insert({ ...runRow('r2', 'p1'), status: 'running' });
    await run.insert({ ...runRow('r3'), status: 'done' });
    expect((await run.idsWithStatus('running')).sort()).toEqual(['r1', 'r2']);
    expect(await run.idsWithStatus('stopped')).toEqual([]);
  });

  test('a run has an optional owner, listed newest first, claimed by compare and swap', async () => {
    const { run } = openStore(':memory:');
    await run.insert(runRow('r1'));
    await run.insert({ ...runRow('r2', 'p1'), updated_at: LATER });
    expect((await run.listByOwner('p1')).map((r) => r.id)).toEqual(['r2']);
    expect((await run.listByOwner('p1'))[0]).not.toHaveProperty('body');
    expect(await run.setOwner('r1', 'p1')).toBe(true);
    expect(await run.setOwner('r1', 'p2')).toBe(false);
    expect((await run.listByOwner('p1')).map((r) => r.id)).toEqual(['r2', 'r1']);
    expect(await run.setOwner('r1', 'p2', 'wrong')).toBe(false);
    expect(await run.setOwner('r1', 'p2', 'p1')).toBe(true);
  });

  test('run events are numbered from 0 and read by cursor; a run must exist', async () => {
    const { run, runEvent } = openStore(':memory:');
    await run.insert(runRow('r1'));
    await run.insert(runRow('r2'));
    expect(await runEvent.append('r1', 'a', '1', AT)).toBe(0);
    expect(await runEvent.append('r1', 'b', '2', AT)).toBe(1);
    expect(await runEvent.append('r2', 'c', '3', AT)).toBe(0);
    expect(await runEvent.append('r1', 'd', '4', AT)).toBe(2);
    expect((await runEvent.list('r1', 1)).map((e) => e.type)).toEqual(['b', 'd']);
    expect(await runEvent.list('r1', 3)).toEqual([]);
    await expect(runEvent.append('nope', 'a', '1', AT)).rejects.toThrow();
  });

  test('a wallet binds to one person; a session ends when it expires', async () => {
    const { person, walletBinding, session } = openStore(':memory:');
    await person.create({ id: 'p1', created_at: AT });
    await person.create({ id: 'p2', created_at: AT });
    const wallet = { network: 'testnet', caip10_encrypted: 'e', caip10_hash: 'h', proved_at: AT };
    expect(await walletBinding.bind({ ...wallet, person: 'p1' })).toBe(true);
    expect(await walletBinding.bind({ ...wallet, person: 'p2' })).toBe(false);
    expect(await walletBinding.ofPerson('p2')).toEqual([]);
    expect(await walletBinding.ofPerson('p1')).toHaveLength(1);
    await session.put({ hash: 's', subject: 'p1', expires_at: LATER });
    expect(await session.get('s', AT)).not.toBeNull();
    expect(await session.get('s', LATER)).toBeNull();
    await session.deleteExpired(LATER);
    await session.put({ hash: 's', subject: 'p2', expires_at: LATER });
    await session.delete('s');
    expect(await session.get('s', AT)).toBeNull();
  });

  test('a binding and a session say their network; a session can hold an invite', async () => {
    const { person, walletBinding, session, invite } = openStore(':memory:');
    await person.create({ id: 'p1', created_at: AT });
    await walletBinding.bind({
      person: 'p1',
      network: 'mainnet',
      caip10_encrypted: 'e',
      caip10_hash: 'h',
      proved_at: AT,
    });
    expect(await walletBinding.byHash('h')).toMatchObject({ network: 'mainnet' });
    await session.put({ hash: 's', subject: 'p1', network: 'mainnet', expires_at: LATER });
    expect(await session.get('s', AT)).toMatchObject({ network: 'mainnet', invite: null });
    await invite.create({ id: 'i1', token_hash: 't1', budget_usd: 5, expires_at: null });
    await session.setInvite('s', 'i1');
    expect(await session.get('s', AT)).toMatchObject({ invite: 'i1' });
    await session.put({ hash: 'anon', subject: 'anon_1', expires_at: LATER });
    expect(await session.get('anon', AT)).toMatchObject({ network: null, invite: null });
  });

  test('moveOwner moves everything of one owner, in one statement, and nobody else’s', async () => {
    const { run, exploration } = openStore(':memory:');
    for (const [id, owner] of [
      ['a', 'anon_1'],
      ['b', 'anon_1'],
      ['c', 'anon_2'],
      ['d', null],
    ] as const) {
      await run.insert(runRow(id, owner));
    }
    expect(await run.moveOwner('anon_1', 'prs_1')).toBe(2);
    expect(await run.moveOwner('anon_1', 'prs_1')).toBe(0);
    expect((await run.listByOwner('prs_1')).map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect((await run.get('c'))?.owner).toBe('anon_2');
    expect((await run.get('d'))?.owner).toBeNull();
    await exploration.create({
      id: 'x',
      owner: 'anon_1',
      question: 'q',
      target: null,
      head: null,
      visibility: 'private',
      share_token_hash: null,
      forked_from: null,
      created_at: AT,
      updated_at: AT,
    });
    expect(await exploration.moveOwner('anon_1', 'prs_1')).toBe(1);
    expect((await exploration.get('x'))?.owner).toBe('prs_1');
  });

  test('an invite is found by its token hash, spent and revoked', async () => {
    const { invite } = openStore(':memory:');
    await invite.create({ id: 'i', token_hash: 't', budget_usd: 5, expires_at: null });
    await invite.addSpent('i', 1.5);
    await invite.revoke('i', AT);
    await invite.revoke('i', LATER);
    expect(await invite.byTokenHash('t')).toMatchObject({ spent_usd: 1.5, revoked_at: AT });
  });

  test('an exploration moves its head by compare and swap, and keeps steps and notes in order', async () => {
    const { exploration, step, note } = openStore(':memory:');
    await exploration.create({
      id: 'x',
      owner: null,
      question: 'who?',
      target: 'near',
      head: null,
      visibility: 'private',
      share_token_hash: null,
      forked_from: null,
      created_at: AT,
      updated_at: AT,
    });
    expect(await exploration.moveHead('x', 'wrong', 'h1', LATER)).toBe(false);
    expect(await exploration.moveHead('x', null, 'h1', LATER)).toBe(true);
    expect(await exploration.moveHead('x', null, 'h2', LATER)).toBe(false);
    expect(await exploration.moveHead('x', 'h1', 'h2', LATER)).toBe(true);
    expect(await exploration.setOwner('x', 'p1')).toBe(true);
    expect(await exploration.setOwner('x', 'p2')).toBe(false);
    await exploration.setSharing('x', 'link', 'share', LATER);
    expect(await exploration.byShareToken('share')).toMatchObject({
      id: 'x',
      head: 'h2',
      owner: 'p1',
    });
    const s = {
      exploration: 'x',
      parent: null,
      spec_sha256: null,
      recipe_sha256: null,
      snapshot_sha256: null,
      door: null,
      note: null,
      at: AT,
    };
    expect(await step.append(s)).toBe(0);
    expect(await step.append(s)).toBe(1);
    expect(await note.append({ exploration: 'x', author: 'p1', text: 'a', at: AT })).toBe(0);
    expect(await note.append({ exploration: 'x', author: 'p1', text: 'b', at: AT })).toBe(1);
    expect((await note.list('x')).map((n) => n.text)).toEqual(['a', 'b']);
    expect(await step.count('x')).toBe(2);
    expect(await note.count('x')).toBe(2);
  });

  test('a link is found by its hash, stops when revoked, and belongs to one exploration', async () => {
    const { exploration, explorationLink: link } = openStore(':memory:');
    const row = {
      owner: 'p1',
      question: 'who?',
      target: null,
      head: null,
      visibility: 'private',
      share_token_hash: null,
      forked_from: null,
      created_at: AT,
      updated_at: AT,
    };
    await exploration.create({ ...row, id: 'x' });
    await exploration.create({ ...row, id: 'y' });
    await link.create({
      id: 'l1',
      exploration: 'x',
      scope: 'read',
      token_hash: 'h1',
      created_at: AT,
    });
    await link.create({
      id: 'l2',
      exploration: 'x',
      scope: 'continue',
      token_hash: 'h2',
      created_at: AT,
    });
    await expect(
      link.create({ id: 'l3', exploration: 'y', scope: 'read', token_hash: 'h1', created_at: AT }),
    ).rejects.toThrow();
    expect(await link.byTokenHash('h2')).toMatchObject({
      id: 'l2',
      scope: 'continue',
      revoked_at: null,
    });
    expect((await link.list('x')).map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(await link.revoke('y', 'l1', LATER)).toBe(false);
    expect(await link.revoke('x', 'l1', LATER)).toBe(true);
    expect(await link.revoke('x', 'l1', LATER)).toBe(false);
    expect((await link.byTokenHash('h1'))?.revoked_at).toBe(LATER);
  });

  test('a run can be found from its exploration', async () => {
    const { run } = openStore(':memory:');
    await run.insert(runRow('a'));
    expect(await run.latestOfExploration('x')).toBeNull();
    await run.setExploration('a', 'x');
    expect(await run.latestOfExploration('x')).toBe('a');
  });
});

describe('stateStore', () => {
  const tmp = () => mkdtempSync(join(tmpdir(), 'petal-state-'));

  test('<stateDir>/private.db; one store per folder, until it is closed', async () => {
    const dir = join(tmp(), 'nested', 'state');
    const lines: string[] = [];
    const a = stateStore(dir, (l) => lines.push(l));
    expect(a.path).toBe(join(dir, 'private.db'));
    expect(existsSync(a.path)).toBe(true);
    expect(a.durable).toBe(true);
    expect(stateStore(dir)).toBe(a);
    await a.ledger.add('2026-11-05', 1);
    await a.close();
    const b = stateStore(dir);
    expect(b).not.toBe(a);
    expect((await b.ledger.get('2026-11-05')).usd).toBe(1);
    await b.close();
    expect(lines).toEqual([]);
  });

  const unwritable: [string, () => string][] = [
    [
      'the folder is under a file',
      () => {
        const file = join(tmp(), 'a-file');
        writeFileSync(file, '');
        return join(file, 'state');
      },
    ],
    [
      'the parent is read-only',
      () => {
        const dir = tmp();
        chmodSync(dir, 0o555);
        return join(dir, 'state');
      },
    ],
    [
      'the folder is read-only',
      () => {
        const dir = tmp();
        chmodSync(dir, 0o555);
        return dir;
      },
    ],
    [
      'the database is read-only',
      () => {
        const dir = tmp();
        const store = openStore(join(dir, 'private.db'));
        void store.close();
        chmodSync(join(dir, 'private.db'), 0o444);
        chmodSync(dir, 0o555);
        return dir;
      },
    ],
    [
      'the database is not a database',
      () => {
        const dir = tmp();
        writeFileSync(
          join(dir, 'private.db'),
          'not sqlite, and long enough to be read as a header',
        );
        return dir;
      },
    ],
  ];

  test.each(unwritable)('%s: memory, and one log line', async (_name, make) => {
    const dir = make();
    const lines: string[] = [];
    const store = stateStore(dir, (l) => lines.push(l));
    expect(store.durable).toBe(false);
    expect(store.path).toBe(':memory:');
    await store.person.create({ id: 'p1', created_at: AT });
    expect(await store.person.get('p1')).not.toBeNull();
    // the same memory for everyone in this process, and no second line
    expect(stateStore(dir, (l) => lines.push(l))).toBe(store);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/in memory/);
    await store.close();
  });
});

describe('migration 5, the workspace', () => {
  test('adds to a populated store without changing a row that was there', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'petal-store-')), 'private.db');
    openStore(path, MIGRATIONS.slice(0, 4)).close();
    const at = '2026-11-01T00:00:00.000Z';
    // by hand: today's insert names columns this older schema doesn't have yet
    const raw = new DatabaseSync(path);
    const insert = raw.prepare(
      'INSERT INTO run (id, owner, exploration, status, model, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const body = JSON.stringify({ messages: [{ role: 'user', content: 'a question' }] });
    insert.run('run-with-owner', 'prs_a', 'exp_a', 'done', 'some/model', body, at, at);
    insert.run('run-with-no-owner', null, null, 'interrupted', null, '{"messages":[]}', at, at);
    raw
      .prepare('INSERT INTO run_event (run, seq, type, data, at) VALUES (?, 0, ?, ?, ?)')
      .run('run-with-owner', 'done', '{"turns":1}', at);
    raw
      .prepare('INSERT INTO run_thread (run, messages, updated_at) VALUES (?, ?, ?)')
      .run('run-with-owner', '[]', at);
    raw
      .prepare(
        'INSERT INTO exploration (id, owner, question, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run('exp_a', 'prs_a', 'a question', at, at);
    raw
      .prepare('INSERT INTO note (exploration, seq, author, text, at) VALUES (?, 0, ?, ?, ?)')
      .run('exp_a', 'owner', 'a note', at);
    const before = {
      run: { ...raw.prepare('SELECT * FROM run WHERE id = ?').get('run-with-owner') },
      note: raw
        .prepare('SELECT * FROM note')
        .all()
        .map((r) => ({ ...r })),
    };
    raw.close();

    const store = openStore(path);
    const run = await store.run.get('run-with-owner');
    expect(run).toMatchObject(before.run as object);
    expect(run).toMatchObject({ title: null, settings: null, hidden_at: null });
    expect((await store.run.get('run-with-no-owner'))?.status).toBe('interrupted');
    expect((await store.run.get('run-with-no-owner'))?.owner).toBeNull();
    expect(await store.runEvent.list('run-with-owner')).toHaveLength(1);
    expect(await store.runThread.get('run-with-owner')).toBe('[]');
    // as it was, with migration 6's credential, which an old row doesn't have
    expect(await store.note.list('exp_a')).toEqual(
      (before.note as object[]).map((n) => ({ ...n, credential: null })),
    );
    // the new tables are there and empty, and an old run shows in the list with no title of its own
    expect(await store.follow.count('prs_a')).toBe(0);
    expect(await store.workspaceNote.count('prs_a')).toBe(0);
    const [listed] = await store.run.conversations('prs_a', 10, false);
    expect(listed?.id).toBe('run-with-owner');
    expect(listed?.body).toContain('a question');
    await store.close();

    // and opening it again applies nothing twice
    const again = openStore(path);
    expect((await again.run.get('run-with-owner'))?.title).toBeNull();
    again.close();
  });

  test('a run that has a title leaves its body out of the list', async () => {
    const store = openStore(':memory:');
    const at = '2026-11-01T00:00:00.000Z';
    await store.run.insert({
      id: 'titled',
      owner: 'prs_a',
      exploration: null,
      status: 'done',
      model: null,
      title: 'a name',
      body: '{"messages":[]}',
      created_at: at,
      updated_at: at,
    });
    expect((await store.run.conversations('prs_a', 10, false))[0]?.body).toBeNull();
    await store.run.setHidden('titled', at);
    expect(await store.run.conversations('prs_a', 10, false)).toEqual([]);
    expect((await store.run.conversations('prs_a', 10, true))[0]?.id).toBe('titled');
    await store.close();
  });

  test("search takes a person's words, finds by owner, and forgets", async () => {
    const store = openStore(':memory:');
    const doc = { kind: 'note', title: 'a title', about: null, at: 'now' };
    await store.search.put({ ...doc, owner: 'a', ref: 'n1' }, 'validadores do norte');
    await store.search.put({ ...doc, owner: 'b', ref: 'n2' }, 'validadores do sul');
    await store.search.put({ ...doc, owner: 'a', ref: 'marker', kind: 'exploration' }, null);
    const hits = (owner: string, words = ['validadores']) =>
      store.search.query(owner, words, ['note', 'exploration'], 10);
    expect((await hits('a')).map((h) => h.ref)).toEqual(['n1']);
    expect((await hits('b')).map((h) => h.ref)).toEqual(['n2']);
    await store.search.put({ ...doc, owner: 'a', ref: 'n1' }, 'outra coisa');
    expect(await hits('a')).toEqual([]);
    await store.search.put({ ...doc, owner: 'a', ref: 'n1' }, 'validadores de novo');
    await store.search.forget('a', 'note', 'n1');
    expect(await hits('a')).toEqual([]);
    await store.search.put({ ...doc, owner: 'b', ref: 'n3', about: 'x' }, 'validadores');
    await store.search.forgetAbout('b', 'x');
    expect((await hits('b')).map((h) => h.ref)).toEqual(['n2']);
    await store.search.forgetOwner('b');
    expect(await hits('b')).toEqual([]);
    await store.close();
  });
});

describe('migration 31, the brain receipts', () => {
  test('a receipt is added once, read from a time on, oldest first, and never rewritten', async () => {
    const store = openStore(':memory:');
    const row = (id: string, at: string, body = '{}') => ({
      id,
      at,
      version: 'abc@def',
      client_id: 'mcp',
      body,
    });
    await store.brainReceipt.add(row('brc_2', LATER));
    await store.brainReceipt.add(row('brc_1', AT));
    // the same id again changes nothing
    await store.brainReceipt.add(row('brc_1', AT, '{"changed":true}'));
    expect((await store.brainReceipt.since()).map((r) => [r.id, r.body])).toEqual([
      ['brc_1', '{}'],
      ['brc_2', '{}'],
    ]);
    expect((await store.brainReceipt.since(LATER)).map((r) => r.id)).toEqual(['brc_2']);
    await store.close();
  });
});

describe('migration 32, the open calls', () => {
  test("a source's calls are replaced as a whole, listed closing soonest first, the ones with no deadline last", async () => {
    const store = openStore(':memory:');
    const row = (id: string, closes: string | null) => ({
      id,
      closes,
      body: `{"id":"${id}"}`,
      read_at: AT,
    });
    await store.openCall.replace('karma', [row('karma:2', LATER), row('karma:1', null)]);
    await store.openCall.replace('infrastructure-committee.near', [row('ic:8', AT)]);
    expect((await store.openCall.list()).map((r) => [r.id, r.source])).toEqual([
      ['ic:8', 'infrastructure-committee.near'],
      ['karma:2', 'karma'],
      ['karma:1', 'karma'],
    ]);
    // read again, karma no longer finds karma:2: it leaves, and the other source's stay
    await store.openCall.replace('karma', [row('karma:1', null)]);
    expect((await store.openCall.list()).map((r) => r.id)).toEqual(['ic:8', 'karma:1']);
    await store.close();
  });
});

describe('migration 33, the payouts', () => {
  test("a map's payouts are kept by its address, replaced when read again, listed in order", async () => {
    const store = openStore(':memory:');
    await store.payouts.put({
      about: 'near:mainnet:b.sputnik-dao.near',
      body: '{"n":1}',
      read_at: AT,
    });
    await store.payouts.put({
      about: 'near:mainnet:a.sputnik-dao.near',
      body: '{"n":2}',
      read_at: AT,
    });
    await store.payouts.put({
      about: 'near:mainnet:b.sputnik-dao.near',
      body: '{"n":3}',
      read_at: LATER,
    });
    expect(await store.payouts.get('near:mainnet:b.sputnik-dao.near')).toEqual({
      about: 'near:mainnet:b.sputnik-dao.near',
      body: '{"n":3}',
      read_at: LATER,
    });
    expect((await store.payouts.list()).map((r) => r.about)).toEqual([
      'near:mainnet:a.sputnik-dao.near',
      'near:mainnet:b.sputnik-dao.near',
    ]);
    expect(await store.payouts.get('near:mainnet:none.near')).toBeFalsy();
    await store.close();
  });
});
