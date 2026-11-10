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

  test('folders nest, list flat in order, move at sign-in, and a delete moves what it held up', async () => {
    const anon = u('anon');
    const prs = u('prs');
    const folder = (name: string, parent: string | null, position: number, owner = anon) => ({
      id: u('fld'),
      owner,
      name,
      parent,
      position,
      created_at: AT,
      updated_at: AT,
    });
    const top = folder('Top', null, 1);
    const first = folder('First', null, 0);
    const inner = folder('Inner', top.id, 0);
    // a tree can arrive in any order inside one transaction: a parent is checked at its end
    await store.tx(async () => {
      await store.folder.insert(inner);
      await store.folder.insert(top);
      await store.folder.insert(first);
    });
    expect(await store.folder.nextPosition(anon, null)).toBe(2);
    expect(await store.folder.nextPosition(anon, top.id)).toBe(1);
    expect(await store.folder.nextPosition(anon, u('fld'))).toBe(0);
    expect((await store.folder.list(anon)).map((f) => f.name)).toEqual(['First', 'Top', 'Inner']);
    expect(await store.folder.count(anon)).toBe(3);

    // a conversation of each kind, in the inner folder
    const run = u('run');
    await store.run.insert({
      id: run,
      owner: anon,
      exploration: null,
      status: 'done',
      model: null,
      body: '{}',
      created_at: AT,
      updated_at: AT,
    });
    await store.run.setFolder(run, inner.id);
    const exp = u('exp');
    await store.exploration.create({
      id: exp,
      owner: anon,
      question: 'q',
      target: null,
      head: null,
      visibility: 'private',
      share_token_hash: null,
      forked_from: null,
      created_at: AT,
      updated_at: AT,
    });
    await store.exploration.setFolder(exp, inner.id);
    expect((await store.run.conversations(anon, 10, false))[0]?.folder).toBe(inner.id);

    // signing in moves them all, still in place
    await store.run.moveOwner(anon, prs);
    await store.exploration.moveOwner(anon, prs);
    await store.folder.moveOwner(anon, prs);
    expect(await store.folder.list(anon)).toEqual([]);
    expect(await store.folder.count(prs)).toBe(3);

    // someone else can't delete it; its owner can, and nothing in it goes
    expect(await store.folder.delete(inner.id, anon)).toBe(false);
    const child = folder('Child', inner.id, 0, prs);
    await store.folder.insert(child);
    expect(await store.folder.delete(inner.id, prs)).toBe(true);
    expect(await store.folder.get(inner.id)).toBeNull();
    expect((await store.folder.get(child.id))?.parent).toBe(top.id);
    expect((await store.run.get(run))?.folder).toBe(top.id);
    expect((await store.exploration.get(exp))?.folder).toBe(top.id);
    expect(await store.folder.delete(top.id, prs)).toBe(true);
    expect((await store.folder.get(child.id))?.parent).toBeNull();
    expect((await store.run.get(run))?.folder).toBeNull();
    expect((await store.exploration.get(exp))?.folder).toBeNull();
  });

  test('jobs: handed out in order, each taken once even when asked for together, then reported', async () => {
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
    const job = (n: number) =>
      store.job.add({
        id: u('job'),
        exploration: x,
        run: n === 0 ? u('run') : null,
        kind: 'map',
        title: `Map ${n}`,
        brief: `Who holds power in ${n}?`,
        inputs: { network: `n${n}` },
        at: AT,
      });
    const first = await job(0);
    expect(first).toMatchObject({
      status: 'open',
      result: null,
      failed: null,
      inputs: { network: 'n0' },
    });
    const second = await job(1);
    expect((await store.job.list(x)).map((j) => j.id)).toEqual([first.id, second.id]);

    // two agents asking at once take one job each
    const taken = await together(3, () => store.job.take(x, LATER));
    expect(
      taken
        .filter(Boolean)
        .map((j) => j?.id)
        .sort(),
    ).toEqual([first.id, second.id].sort());
    expect(taken.filter((j) => j === null)).toHaveLength(1);
    expect(taken.find((j) => j?.id === first.id)).toMatchObject({
      status: 'taken',
      updated_at: LATER,
    });

    const result = { summary: 'Three members hold most of the shares.', steps: [0, 1] };
    expect(await store.job.report(x, first.id, { result }, LATER)).toMatchObject({
      status: 'done',
      result,
      failed: null,
    });
    expect(await store.job.report(x, second.id, { failed: 'No data for n1' }, LATER)).toMatchObject(
      {
        status: 'failed',
        result: null,
        failed: 'No data for n1',
      },
    );
    // a job reported once, or in another project, can't be reported again
    expect(await store.job.report(x, first.id, { failed: 'again' }, LATER)).toBeNull();
    expect(await store.job.report(u('exp'), second.id, { result }, LATER)).toBeNull();
    expect((await store.job.list(x)).map((j) => j.status)).toEqual(['done', 'failed']);
  });

  test("a person's agents asking at once take one job each, never the same one", async () => {
    const owner = u('prs');
    const x = u('exp');
    await store.exploration.create({
      id: x,
      owner,
      question: 'who?',
      target: null,
      head: null,
      visibility: 'private',
      share_token_hash: null,
      forked_from: null,
      created_at: AT,
      updated_at: AT,
    });
    const ids: string[] = [];
    for (const n of [0, 1]) {
      const j = await store.job.add({
        id: u('job'),
        exploration: x,
        run: null,
        kind: 'map',
        title: `Map ${n}`,
        brief: `Who holds power in ${n}?`,
        inputs: { network: `n${n}` },
        at: AT,
      });
      ids.push(j.id);
    }
    const taken = await together(3, () => store.job.takeFor(owner, 'Codex', LATER));
    expect(
      taken
        .filter(Boolean)
        .map((j) => j?.id)
        .sort(),
    ).toEqual([...ids].sort());
    expect(taken.filter((j) => j === null)).toHaveLength(1);
    expect((await store.job.held(owner)).map((j) => j.id).sort()).toEqual([...ids].sort());
  });

  test('layers: kept once under their author, versions in order, and both move at sign-in', async () => {
    const anon = u('anon');
    const person = u('prs');
    const about = 'eip155:100:0xraid';
    const layer = (owner: string, hash: string) =>
      store.layer.keep({
        owner,
        hash,
        about,
        standing: 'verified',
        body: `{"h":"${hash}"}`,
        credential: null,
        created_at: AT,
      });
    const [a, b] = ['a'.repeat(64), 'b'.repeat(64)];
    expect(await layer(anon, a)).toBe(true);
    expect(await layer(anon, a)).toBe(false);
    expect(await layer(anon, b)).toBe(true);
    expect(await layer(person, a)).toBe(true);
    expect((await store.layer.list(anon, about)).map((l) => l.hash)).toEqual([a, b]);
    expect(await store.layer.get(person, b)).toBeNull();

    const version = (owner: string, parent: string | null, layers: string[]) =>
      store.datasetVersion.add({
        id: u('dsv'),
        owner,
        about,
        parent,
        layers,
        credential: null,
        created_at: AT,
      });
    const v0 = await version(anon, null, [a]);
    const v1 = await version(anon, v0.id, [a, b]);
    const p0 = await version(person, null, [a]);
    expect([v0.seq, v1.seq, p0.seq]).toEqual([0, 1, 0]);
    expect((await store.datasetVersion.latest(anon, about))?.id).toBe(v1.id);
    expect((await store.datasetVersion.get(v1.id))?.layers).toEqual([a, b]);

    // signing in: the layer the person holds already stays theirs once, and versions follow theirs
    await store.layer.moveOwner(anon, person);
    await store.datasetVersion.moveOwner(anon, person);
    expect((await store.layer.list(person, about)).map((l) => l.hash).sort()).toEqual([a, b]);
    expect(await store.layer.list(anon)).toEqual([]);
    const mine = await store.datasetVersion.list(person, about);
    expect(mine.map((v) => [v.id, v.seq])).toEqual([
      [p0.id, 0],
      [v0.id, 1],
      [v1.id, 2],
    ]);
    expect((await store.datasetVersion.latest(person, about))?.id).toBe(v1.id);
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
