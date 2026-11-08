// The store's contract, the same on every engine behind it: SQLite (where Petals started), Postgres in
// process (PGlite, in every check), and a real Postgres server as the restricted runtime role, when
// PETAL_TEST_DATABASE_URL names one (with PETAL_DATABASE_PASSWORD_FILE). A server database is shared, so
// every id here is new each run.
import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, test } from 'vitest';
import { openStore, type Store } from '../src/index.ts';

const server = process.env.PETAL_TEST_DATABASE_URL?.trim();
const engines: [string, () => Store][] = [
  ['sqlite', () => openStore(':memory:')],
  ['postgres in process', () => openStore('pglite:')],
  ...(server
    ? ([['postgres server, runtime role', () => openStore(server)]] as [string, () => Store][])
    : []),
];

const AT = '2026-11-08T12:00:00.000Z';
const LATER = '2026-11-08T12:10:00.000Z';
const u = (p: string) => `${p}_${randomBytes(6).toString('hex')}`;
/** Calls interleaved on the event loop, the way concurrent requests are. */
const together = <T>(n: number, f: () => Promise<T>) =>
  Promise.all(Array.from({ length: n }, async () => f()));

const opened: Store[] = [];
afterAll(async () => {
  for (const s of opened) await s.close();
});

describe.each(engines)('%s', (engine, open) => {
  const store = open();
  opened.push(store);

  test('it says which engine it is, and connects', async () => {
    await store.ready;
    expect(store.engine).toBe(engine.startsWith('sqlite') ? 'sqlite' : 'postgres');
    const size = await store.size();
    expect(typeof size.stored).toBe('number');
  });

  test('a person, a wallet bound once, a session that ends', async () => {
    const p = u('prs');
    const hash = u('h');
    await store.person.create({ id: p, created_at: AT });
    const bind = {
      person: p,
      network: 'testnet',
      caip10_encrypted: 'e',
      caip10_hash: hash,
      proved_at: AT,
    };
    expect(await store.walletBinding.bind(bind)).toBe(true);
    expect(await store.walletBinding.bind({ ...bind, person: u('prs') })).toBe(false);
    expect(await store.walletBinding.byHash(hash)).toMatchObject({ person: p, network: 'testnet' });
    expect(await store.walletBinding.ofPerson(p)).toHaveLength(1);
    const s = u('s');
    await store.session.put({ hash: s, subject: p, expires_at: LATER });
    expect(await store.session.get(s, AT)).toMatchObject({
      subject: p,
      network: null,
      invite: null,
    });
    expect(await store.session.get(s, LATER)).toBeNull();
  });

  test('a transaction is all or nothing, and a call inside it joins it', async () => {
    const p = u('prs');
    await expect(
      store.tx(async () => {
        await store.person.create({ id: p, created_at: AT });
        await store.tx(async () => store.person.create({ id: `${p}_2`, created_at: AT }));
        throw new Error('no');
      }),
    ).rejects.toThrow('no');
    expect(await store.person.get(p)).toBeNull();
    expect(await store.person.get(`${p}_2`)).toBeNull();
  });

  test('concurrent holds never pass the cap', async () => {
    const day = u('day');
    const holds = await together(30, () => store.ledger.reserve(day, 0.05, 0.12));
    const held = holds.filter((h) => h !== null) as number[];
    expect(held).toHaveLength(3);
    expect(held.reduce((a, b) => a + b, 0)).toBeCloseTo(0.12, 9);
    expect((await store.ledger.get(day)).reserved_usd).toBeCloseTo(0.12, 9);
  });

  test('a daily cap counts once each, and holds under concurrent calls', async () => {
    const what = u('what');
    const taken = await together(12, () => store.dailyCount.take(what, '2026-11-08', 5));
    expect(taken.filter(Boolean)).toHaveLength(5);
    expect(await store.dailyCount.get(what, '2026-11-08')).toBe(5);
  });

  test('one id counts once, and one nonce goes to one caller', async () => {
    const account = u('acct');
    const id = u('c');
    const entry = { id, account_key: account, delta_usd: 1, reason: 'test', at: AT };
    const applied = await together(10, () => store.credit.apply(entry));
    expect(applied.filter(Boolean)).toHaveLength(1);
    expect((await store.credit.get(account))?.balance_usd).toBe(1);
    const n = u('n');
    await store.challenge.put(n, LATER, AT);
    const checks = await together(10, () => store.challenge.reserve(n, AT));
    expect(checks.filter((c) => c === 'ok')).toHaveLength(1);
  });

  test('steps and notes are numbered 0, 1, 2… with none twice under concurrent appends', async () => {
    const x = u('exp');
    await store.exploration.create({
      id: x,
      owner: u('prs'),
      question: 'who?',
      target: null,
      head: null,
      visibility: 'private',
      share_token_hash: null,
      forked_from: null,
      created_at: AT,
      updated_at: AT,
    });
    const step = (i: number) =>
      store.step.append({
        exploration: x,
        parent: null,
        spec_sha256: `s${i}`,
        recipe_sha256: null,
        snapshot_sha256: null,
        door: 'mcp',
        note: null,
        at: AT,
      });
    const seqs = await Promise.all(Array.from({ length: 8 }, (_, i) => step(i)));
    expect([...seqs].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(await store.step.count(x)).toBe(8);
    expect(typeof (await store.step.count(x))).toBe('number');
    expect(await store.note.append({ exploration: x, author: 'owner', text: 'hi', at: AT })).toBe(
      0,
    );
    expect(await store.exploration.moveHead(x, null, 's1', LATER)).toBe(true);
    expect(await store.exploration.moveHead(x, null, 's2', LATER)).toBe(false);
  });

  test('following moves to a person at sign-in, and nothing is followed twice', async () => {
    const anon = u('anon');
    const prs = u('prs');
    const row = (id: string, owner: string, ref: string) => ({
      id: u(id),
      owner,
      kind: 'account',
      ref,
      label: null,
      spec_sha256: null,
      created_at: AT,
      updated_at: AT,
    });
    await store.follow.insert(row('a', anon, 'near:mainnet:x.near'));
    await store.follow.insert(row('b', anon, 'near:mainnet:y.near'));
    await store.follow.insert(row('c', prs, 'near:mainnet:x.near'));
    await store.follow.moveOwner(anon, prs);
    expect(await store.follow.list(anon, 10)).toEqual([]);
    expect((await store.follow.list(prs, 10)).map((f) => f.ref).sort()).toEqual([
      'near:mainnet:x.near',
      'near:mainnet:y.near',
    ]);
  });

  test("search finds a person's own words, folds accents, takes a prefix, and nobody else's", async () => {
    const a = u('prs');
    const b = u('prs');
    const doc = { kind: 'note', title: 'a title', about: null, at: AT };
    await store.search.put({ ...doc, owner: a, ref: 'n1' }, 'O café dos validadores');
    await store.search.put({ ...doc, owner: b, ref: 'n2' }, 'O café do vizinho');
    const hits = (owner: string, words: string[]) => store.search.query(owner, words, ['note'], 10);
    expect((await hits(a, ['cafe'])).map((h) => h.ref)).toEqual(['n1']);
    expect((await hits(a, ['valid'])).map((h) => h.ref)).toEqual(['n1']);
    expect((await hits(b, ['validadores'])).map((h) => h.ref)).toEqual([]);
    expect((await hits(a, ['café', 'vizinho'])).map((h) => h.ref)).toEqual([]);
    // what a person types is words, never syntax
    expect(await hits(a, ['"', "'", '(', ')', 'AND', '*', ':', '&', '|', '!'])).toEqual([]);
    const [hit] = await hits(a, ['cafe']);
    expect(hit?.snippet).toMatch(/.*/);
    await store.search.forget(a, 'note', 'n1');
    expect(await hits(a, ['cafe'])).toEqual([]);
  });
});
