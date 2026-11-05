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
  test('a file gets WAL, and is durable; :memory: works and says it is not', () => {
    const path = dbPath();
    const store = openStore(path);
    expect(store.durable).toBe(true);
    store.close();
    const raw = new DatabaseSync(path);
    expect(raw.prepare('PRAGMA journal_mode').get()).toMatchObject({ journal_mode: 'wal' });
    raw.close();

    const memory = openStore(':memory:');
    expect(memory.durable).toBe(false);
    memory.person.create({ id: 'p1', created_at: AT });
    expect(memory.person.get('p1')).toEqual({ id: 'p1', created_at: AT });
  });

  test('migrations run once each, in order; a new one applies on the next open', () => {
    const path = dbPath();
    const first = openStore(path);
    first.person.create({ id: 'p1', created_at: AT });
    first.close();

    const next = [...MIGRATIONS, 'CREATE TABLE added (a TEXT);'];
    const second = openStore(path, next);
    expect(second.person.get('p1')).toMatchObject({ id: 'p1' });
    second.close();
    // a third open runs nothing again: re-running either migration would fail on its tables
    openStore(path, next).close();

    const raw = new DatabaseSync(path);
    const rows = raw.prepare('SELECT version FROM schema_migration ORDER BY version').all();
    expect(rows.map((r) => r.version)).toEqual(next.map((_, i) => i + 1));
    expect(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'added'").get()).toBeTruthy();
    raw.close();
  });

  test('a failing migration leaves nothing behind, and the open throws', () => {
    const path = dbPath();
    openStore(path).close();
    expect(() =>
      openStore(path, [...MIGRATIONS, 'CREATE TABLE half (a TEXT); THIS IS NOT SQL;']),
    ).toThrow();
    const raw = new DatabaseSync(path);
    expect(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'half'").get()).toBeUndefined();
    raw.close();
  });

  test('tx: all or nothing; nested calls join it', () => {
    const store = openStore(':memory:');
    expect(() =>
      store.tx(() => {
        store.person.create({ id: 'gone', created_at: AT });
        store.tx(() => store.person.create({ id: 'gone too', created_at: AT }));
        throw new Error('no');
      }),
    ).toThrow('no');
    expect(store.person.get('gone')).toBeNull();
    expect(store.person.get('gone too')).toBeNull();
    store.person.create({ id: 'after', created_at: AT });
    expect(store.person.get('after')).not.toBeNull();
  });

  test('after close, every call throws: a store that is down is never read as empty', () => {
    const store = openStore(dbPath());
    store.close();
    expect(() => store.ledger.get('2026-11-05')).toThrow();
    expect(() => store.ledger.reserve('2026-11-05', 1, 3)).toThrow();
    expect(() => store.close()).not.toThrow();
  });
});

describe('a restart loses nothing', () => {
  /** Each table, written by one connection. */
  function write(s: Store) {
    s.person.create({ id: 'p1', created_at: AT });
    s.walletBinding.bind({
      person: 'p1',
      network: 'testnet',
      caip10_encrypted: 'enc',
      caip10_hash: 'h1',
      proved_at: AT,
    });
    s.session.put({ hash: 's1', subject: 'p1', expires_at: LATER });
    s.challenge.put('n1', LATER, AT);
    s.challenge.reserve('n1', AT);
    s.challenge.spend('n1', AT);
    s.run.insert(runRow('r1', 'p1'));
    s.runEvent.append('r1', 'run', '{"a":1}', AT);
    s.runEvent.append('r1', 'message', '{"a":2}', AT);
    s.runThread.save('r1', '[]', AT);
    s.ledger.settle('2026-11-05', 0, 0.25);
    s.ledger.reserve('2026-11-05', 0.05, 3);
    s.credit.apply({ id: 'c1', account_key: 'a', delta_usd: 2, reason: 'test', at: AT });
    s.invite.create({ id: 'i1', token_hash: 't1', budget_usd: 5, expires_at: null });
    s.draft.put({ sha256: 'd1', body: 'x', created_at: AT });
    s.publishDraft.put('e1', '{}');
    s.publishDraft.claim('e1', AT);
    s.exploration.create({
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
    s.step.append({
      exploration: 'x1',
      parent: null,
      spec_sha256: 'sp',
      recipe_sha256: null,
      snapshot_sha256: null,
      door: 'site',
      note: null,
      at: AT,
    });
    s.note.append({ exploration: 'x1', author: 'p1', text: 'hi', at: AT });
  }

  function expectAll(s: Store) {
    expect(s.person.get('p1')).toMatchObject({ id: 'p1' });
    expect(s.walletBinding.byHash('h1')).toMatchObject({ person: 'p1' });
    expect(s.session.get('s1', AT)).toMatchObject({ subject: 'p1' });
    expect(s.challenge.reserve('n1', AT)).toBe('used');
    expect(s.run.get('r1')).toMatchObject({ owner: 'p1', status: 'running' });
    expect(s.runEvent.list('r1').map((e) => e.seq)).toEqual([0, 1]);
    expect(s.runThread.get('r1')).toBe('[]');
    expect(s.ledger.get('2026-11-05')).toMatchObject({ usd: 0.25, reserved_usd: 0.05 });
    expect(s.credit.get('a')).toMatchObject({ balance_usd: 2 });
    expect(s.invite.get('i1')).toMatchObject({ budget_usd: 5 });
    expect(s.draft.get('d1')).toMatchObject({ body: 'x' });
    expect(s.publishDraft.claim('e1', LATER)).toBe(false);
    expect(s.exploration.listByOwner('p1').map((x) => x.id)).toEqual(['x1']);
    expect(s.step.list('x1')).toHaveLength(1);
    expect(s.note.list('x1')).toHaveLength(1);
  }

  test('reopening the file finds every table as it was', () => {
    const path = dbPath();
    const a = openStore(path);
    write(a);
    a.close();
    const b = openStore(path);
    expectAll(b);
    // and the log carries on from where it was
    expect(b.runEvent.append('r1', 'done', '{}', LATER)).toBe(2);
    b.close();
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
         s.run.insert({ id: 'k1', owner: null, exploration: null, status: 'running', model: null,
           body: '{}', created_at: 'a', updated_at: 'a' });
         for (let i = 0; i < 50; i++) s.runEvent.append('k1', 'message', String(i), 'a');
         s.ledger.reserve('2026-11-05', 0.05, 3);
         s.ledger.settle('2026-11-05', 0.05, 0.02);
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
    expect(s.runEvent.list('k1')).toHaveLength(50);
    expect(s.ledger.get('2026-11-05')).toMatchObject({ usd: 0.02, reserved_usd: 0 });
    s.close();
  });
});

describe('the ledger', () => {
  const DAY = '2026-11-05';

  test('reserve holds under the cap, settle swaps the hold for what was spent', () => {
    const { ledger } = openStore(':memory:');
    expect(ledger.reserve(DAY, 0.05, 3)).toBe(0.05);
    expect(ledger.get(DAY)).toMatchObject({ usd: 0, reserved_usd: 0.05 });
    ledger.settle(DAY, 0.05, 0.01);
    expect(ledger.get(DAY)).toMatchObject({ usd: 0.01, reserved_usd: 0 });
  });

  test('releaseHolds gives back every hold on every day, and keeps what was spent', () => {
    const { ledger } = openStore(':memory:');
    expect(ledger.releaseHolds()).toBe(0);
    ledger.add(DAY, 0.25);
    ledger.reserve(DAY, 0.05, 3);
    ledger.reserve('2026-11-04', 0.05, 3);
    expect(ledger.releaseHolds()).toBeCloseTo(0.1, 9);
    expect(ledger.get(DAY)).toMatchObject({ usd: 0.25, reserved_usd: 0 });
    expect(ledger.get('2026-11-04').reserved_usd).toBe(0);
  });

  test('near the cap a hold shrinks to what is left; at the cap there is none', () => {
    const { ledger } = openStore(':memory:');
    ledger.add(DAY, 2.99);
    expect(ledger.reserve(DAY, 0.05, 3)).toBeCloseTo(0.01, 9);
    expect(ledger.reserve(DAY, 0.05, 3)).toBeNull();
    expect(openStore(':memory:').ledger.reserve(DAY, 0.05, 0)).toBeNull();
  });

  test('concurrent chats can never hold more than the cap', async () => {
    const { ledger } = openStore(':memory:');
    const holds = await together(50, () => ledger.reserve(DAY, 0.05, 0.12));
    const held = holds.filter((h) => h !== null) as number[];
    expect(held).toHaveLength(3);
    expect(held.reduce((a, b) => a + b, 0)).toBeCloseTo(0.12, 9);
  });

  test('a hold nobody settled (a crash) still counts until the day ends', () => {
    const path = dbPath();
    const a = openStore(path);
    a.ledger.reserve(DAY, 3, 3);
    a.close();
    const b = openStore(path);
    expect(b.ledger.reserve(DAY, 0.05, 3)).toBeNull();
    expect(b.ledger.reserve('2026-11-06', 0.05, 3)).toBe(0.05);
    b.close();
  });

  test('seed sets a day only if it has no row yet', () => {
    const { ledger } = openStore(':memory:');
    ledger.seed(DAY, 1.5);
    ledger.seed(DAY, 9);
    expect(ledger.get(DAY).usd).toBe(1.5);
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

  test('one id counts once', () => {
    const { credit } = openStore(':memory:');
    expect(credit.apply(entry('tx1'))).toBe(true);
    expect(credit.apply(entry('tx1'))).toBe(false);
    expect(credit.get('a')?.balance_usd).toBe(1);
    expect(credit.entries('a')).toHaveLength(1);
    expect(credit.apply(entry('tx2'))).toBe(true);
    expect(credit.get('a')?.balance_usd).toBe(2);
  });

  test('one id counts once under concurrent async calls, and across connections', async () => {
    const path = dbPath();
    const a = openStore(path);
    const b = openStore(path);
    const out = await together(20, () => [
      a.credit.apply(entry('tx1')),
      b.credit.apply(entry('tx1')),
    ]);
    expect(out.flat().filter(Boolean)).toHaveLength(1);
    expect(a.credit.get('a')?.balance_usd).toBe(1);
    a.close();
    b.close();
  });

  test('one id counts once across a restart', () => {
    const path = dbPath();
    const a = openStore(path);
    a.credit.apply(entry('tx1'));
    a.close();
    const b = openStore(path);
    expect(b.credit.apply(entry('tx1'))).toBe(false);
    expect(b.credit.get('a')?.balance_usd).toBe(1);
    b.close();
  });

  test('reserve then settle draws the balance down; nothing left means no hold', () => {
    const { credit } = openStore(':memory:');
    expect(credit.reserve('nobody', 1)).toBeNull();
    credit.apply(entry('tx1', 0.08));
    expect(credit.reserve('a', 0.05)).toBe(0.05);
    expect(credit.reserve('a', 0.05)).toBeCloseTo(0.03, 9);
    expect(credit.reserve('a', 0.05)).toBeNull();
    credit.settle('a', 0.05, 0.01);
    expect(credit.get('a')).toMatchObject({ balance_usd: 0.07 });
    expect(credit.get('a')?.reserved_usd).toBeCloseTo(0.03, 9);
    expect(() => credit.settle('nobody', 1, 1)).toThrow(/no credit account/);
  });
});

describe('single use', () => {
  test('a nonce is taken by one caller, under concurrent async calls and across connections', async () => {
    const path = dbPath();
    const a = openStore(path);
    const b = openStore(path);
    a.challenge.put('n1', LATER, AT);
    const out = await together(20, () => [
      a.challenge.reserve('n1', AT),
      b.challenge.reserve('n1', AT),
    ]);
    expect(out.flat().filter((c) => c === 'ok')).toHaveLength(1);
    expect(out.flat().filter((c) => c === 'used')).toHaveLength(39);
    a.close();
    b.close();
  });

  test('unknown, expired, released, spent', () => {
    const { challenge } = openStore(':memory:');
    expect(challenge.reserve('nope', AT)).toBe('unknown');
    challenge.put('n1', LATER, AT);
    expect(challenge.reserve('n1', LATER)).toBe('expired');
    expect(challenge.reserve('n1', AT)).toBe('ok');
    expect(challenge.reserve('n1', AT)).toBe('used');
    challenge.release('n1');
    expect(challenge.reserve('n1', AT)).toBe('ok');
    challenge.spend('n1', AT);
    challenge.release('n1');
    expect(challenge.reserve('n1', AT)).toBe('used');
  });

  test('issuing clears what has expired', () => {
    const { challenge } = openStore(':memory:');
    challenge.put('old', AT, AT);
    challenge.put('new', '2026-11-05T13:00:00.000Z', LATER);
    expect(challenge.reserve('old', AT)).toBe('unknown');
  });

  test('a publish draft is claimed once, under concurrent async calls', async () => {
    const { publishDraft } = openStore(':memory:');
    publishDraft.put('e1', '{}');
    const out = await together(20, () => publishDraft.claim('e1', AT));
    expect(out.filter(Boolean)).toHaveLength(1);
    expect(publishDraft.get('e1')?.used_at).toBe(AT);
    // preparing again is a new nonce and a new chance, as it always was
    publishDraft.put('e1', '{"again":true}');
    expect(publishDraft.claim('e1', LATER)).toBe(true);
    expect(publishDraft.claim('missing', LATER)).toBe(false);
  });

  test('a draft link is put-if-absent', () => {
    const { draft } = openStore(':memory:');
    expect(draft.put({ sha256: 'd', body: 'first', created_at: AT })).toBe(true);
    expect(draft.put({ sha256: 'd', body: 'second', created_at: AT })).toBe(false);
    expect(draft.get('d')?.body).toBe('first');
  });
});

describe('the thin tables', () => {
  test('idsWithStatus finds a run by status, owner or not', () => {
    const { run } = openStore(':memory:');
    run.insert({ ...runRow('r1'), status: 'running' });
    run.insert({ ...runRow('r2', 'p1'), status: 'running' });
    run.insert({ ...runRow('r3'), status: 'done' });
    expect(run.idsWithStatus('running').sort()).toEqual(['r1', 'r2']);
    expect(run.idsWithStatus('stopped')).toEqual([]);
  });

  test('a run has an optional owner, listed newest first, claimed by compare and swap', () => {
    const { run } = openStore(':memory:');
    run.insert(runRow('r1'));
    run.insert({ ...runRow('r2', 'p1'), updated_at: LATER });
    expect(run.listByOwner('p1').map((r) => r.id)).toEqual(['r2']);
    expect(run.listByOwner('p1')[0]).not.toHaveProperty('body');
    expect(run.setOwner('r1', 'p1')).toBe(true);
    expect(run.setOwner('r1', 'p2')).toBe(false);
    expect(run.listByOwner('p1').map((r) => r.id)).toEqual(['r2', 'r1']);
    expect(run.setOwner('r1', 'p2', 'wrong')).toBe(false);
    expect(run.setOwner('r1', 'p2', 'p1')).toBe(true);
  });

  test('run events are numbered from 0 and read by cursor; a run must exist', () => {
    const { run, runEvent } = openStore(':memory:');
    run.insert(runRow('r1'));
    run.insert(runRow('r2'));
    expect(runEvent.append('r1', 'a', '1', AT)).toBe(0);
    expect(runEvent.append('r1', 'b', '2', AT)).toBe(1);
    expect(runEvent.append('r2', 'c', '3', AT)).toBe(0);
    expect(runEvent.append('r1', 'd', '4', AT)).toBe(2);
    expect(runEvent.list('r1', 1).map((e) => e.type)).toEqual(['b', 'd']);
    expect(runEvent.list('r1', 3)).toEqual([]);
    expect(() => runEvent.append('nope', 'a', '1', AT)).toThrow();
  });

  test('a wallet binds to one person; a session ends when it expires', () => {
    const { person, walletBinding, session } = openStore(':memory:');
    person.create({ id: 'p1', created_at: AT });
    person.create({ id: 'p2', created_at: AT });
    const wallet = { network: 'testnet', caip10_encrypted: 'e', caip10_hash: 'h', proved_at: AT };
    expect(walletBinding.bind({ ...wallet, person: 'p1' })).toBe(true);
    expect(walletBinding.bind({ ...wallet, person: 'p2' })).toBe(false);
    expect(walletBinding.ofPerson('p2')).toEqual([]);
    expect(walletBinding.ofPerson('p1')).toHaveLength(1);
    session.put({ hash: 's', subject: 'p1', expires_at: LATER });
    expect(session.get('s', AT)).not.toBeNull();
    expect(session.get('s', LATER)).toBeNull();
    session.deleteExpired(LATER);
    session.put({ hash: 's', subject: 'p2', expires_at: LATER });
    session.delete('s');
    expect(session.get('s', AT)).toBeNull();
  });

  test('a binding and a session say their network; a session can hold an invite', () => {
    const { person, walletBinding, session, invite } = openStore(':memory:');
    person.create({ id: 'p1', created_at: AT });
    walletBinding.bind({
      person: 'p1',
      network: 'mainnet',
      caip10_encrypted: 'e',
      caip10_hash: 'h',
      proved_at: AT,
    });
    expect(walletBinding.byHash('h')).toMatchObject({ network: 'mainnet' });
    session.put({ hash: 's', subject: 'p1', network: 'mainnet', expires_at: LATER });
    expect(session.get('s', AT)).toMatchObject({ network: 'mainnet', invite: null });
    invite.create({ id: 'i1', token_hash: 't1', budget_usd: 5, expires_at: null });
    session.setInvite('s', 'i1');
    expect(session.get('s', AT)).toMatchObject({ invite: 'i1' });
    session.put({ hash: 'anon', subject: 'anon_1', expires_at: LATER });
    expect(session.get('anon', AT)).toMatchObject({ network: null, invite: null });
  });

  test('moveOwner moves everything of one owner, in one statement, and nobody else’s', () => {
    const { run, exploration } = openStore(':memory:');
    for (const [id, owner] of [
      ['a', 'anon_1'],
      ['b', 'anon_1'],
      ['c', 'anon_2'],
      ['d', null],
    ] as const) {
      run.insert(runRow(id, owner));
    }
    expect(run.moveOwner('anon_1', 'prs_1')).toBe(2);
    expect(run.moveOwner('anon_1', 'prs_1')).toBe(0);
    expect(
      run
        .listByOwner('prs_1')
        .map((r) => r.id)
        .sort(),
    ).toEqual(['a', 'b']);
    expect(run.get('c')?.owner).toBe('anon_2');
    expect(run.get('d')?.owner).toBeNull();
    exploration.create({
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
    expect(exploration.moveOwner('anon_1', 'prs_1')).toBe(1);
    expect(exploration.get('x')?.owner).toBe('prs_1');
  });

  test('an invite is found by its token hash, spent and revoked', () => {
    const { invite } = openStore(':memory:');
    invite.create({ id: 'i', token_hash: 't', budget_usd: 5, expires_at: null });
    invite.addSpent('i', 1.5);
    invite.revoke('i', AT);
    invite.revoke('i', LATER);
    expect(invite.byTokenHash('t')).toMatchObject({ spent_usd: 1.5, revoked_at: AT });
  });

  test('an exploration moves its head by compare and swap, and keeps steps and notes in order', () => {
    const { exploration, step, note } = openStore(':memory:');
    exploration.create({
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
    expect(exploration.moveHead('x', 'wrong', 'h1', LATER)).toBe(false);
    expect(exploration.moveHead('x', null, 'h1', LATER)).toBe(true);
    expect(exploration.moveHead('x', null, 'h2', LATER)).toBe(false);
    expect(exploration.moveHead('x', 'h1', 'h2', LATER)).toBe(true);
    expect(exploration.setOwner('x', 'p1')).toBe(true);
    expect(exploration.setOwner('x', 'p2')).toBe(false);
    exploration.setSharing('x', 'link', 'share', LATER);
    expect(exploration.byShareToken('share')).toMatchObject({ id: 'x', head: 'h2', owner: 'p1' });
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
    expect(step.append(s)).toBe(0);
    expect(step.append(s)).toBe(1);
    expect(note.append({ exploration: 'x', author: 'p1', text: 'a', at: AT })).toBe(0);
    expect(note.append({ exploration: 'x', author: 'p1', text: 'b', at: AT })).toBe(1);
    expect(note.list('x').map((n) => n.text)).toEqual(['a', 'b']);
  });
});

describe('stateStore', () => {
  const tmp = () => mkdtempSync(join(tmpdir(), 'petal-state-'));

  test('<stateDir>/private.db; one store per folder, until it is closed', () => {
    const dir = join(tmp(), 'nested', 'state');
    const lines: string[] = [];
    const a = stateStore(dir, (l) => lines.push(l));
    expect(a.path).toBe(join(dir, 'private.db'));
    expect(existsSync(a.path)).toBe(true);
    expect(a.durable).toBe(true);
    expect(stateStore(dir)).toBe(a);
    a.ledger.add('2026-11-05', 1);
    a.close();
    const b = stateStore(dir);
    expect(b).not.toBe(a);
    expect(b.ledger.get('2026-11-05').usd).toBe(1);
    b.close();
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
        store.close();
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

  test.each(unwritable)('%s: memory, and one log line', (_name, make) => {
    const dir = make();
    const lines: string[] = [];
    const store = stateStore(dir, (l) => lines.push(l));
    expect(store.durable).toBe(false);
    expect(store.path).toBe(':memory:');
    store.person.create({ id: 'p1', created_at: AT });
    expect(store.person.get('p1')).not.toBeNull();
    // the same memory for everyone in this process, and no second line
    expect(stateStore(dir, (l) => lines.push(l))).toBe(store);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/in memory/);
    store.close();
  });
});
