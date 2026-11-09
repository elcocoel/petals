// T300: what the store has to do for the limits: indexes for what a stranger's request prunes, one
// atomic daily count, and holds that a restart counts as spent.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, test } from 'vitest';
import { MIGRATIONS } from '../src/migrations.ts';
import { openStore } from '../src/open.ts';

const DAY = '2026-11-06';
const fileStore = () => {
  const path = join(mkdtempSync(join(tmpdir(), 'petal-store-')), 'private.db');
  return { path, store: openStore(path) };
};
const plan = (path: string, sql: string) => {
  const db = new DatabaseSync(path);
  const rows = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all('2026') as { detail: string }[];
  db.close();
  return rows.map((r) => r.detail).join(' ');
};

describe('the migration', () => {
  test('a store from before it opens, keeps its rows, and clears a draft that has no expiry', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'petal-store-')), 'private.db');
    const old = openStore(path, MIGRATIONS.slice(0, 3));
    await old.challenge.put('n', '2030-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    await old.close();
    const db = new DatabaseSync(path);
    db.prepare('INSERT INTO publish_draft (entry_sha256, body) VALUES (?, ?)').run('e', '{}');
    db.close();

    const s = openStore(path);
    expect(await s.publishDraft.get('e')).toMatchObject({ body: '{}', expires_at: null });
    expect(await s.challenge.reserve('n', '2026-01-01T00:00:00.000Z')).toBe('ok');
    await s.publishDraft.deleteExpired('2026-01-01T00:00:00.000Z');
    expect(await s.publishDraft.get('e')).toBeNull();
    await s.close();
  });
});

describe('pruning uses an index, so a request never scans a table a stranger can grow', () => {
  test.each([
    ['challenge', 'DELETE FROM challenge WHERE expires_at <= ?'],
    ['session', 'DELETE FROM session WHERE expires_at <= ?'],
    ['publish_draft', 'DELETE FROM publish_draft WHERE expires_at <= ?'],
  ])('%s', async (_name, sql) => {
    const { path, store } = fileStore();
    await store.close();
    expect(plan(path, sql)).toMatch(/USING .*INDEX/);
  });

  test('a new challenge prunes the expired ones', async () => {
    const { store } = fileStore();
    await store.challenge.put('old', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    await store.challenge.put('new', '2030-01-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z');
    expect(await store.challenge.reserve('old', '2020-01-01T00:00:00.000Z')).toBe('unknown');
    expect(await store.challenge.reserve('new', '2026-06-01T00:00:00.000Z')).toBe('ok');
  });
});

describe('holds at a restart', () => {
  test('the ledger counts them as spent, each on its own day', async () => {
    const { ledger } = openStore(':memory:');
    expect(await ledger.spendHolds()).toBe(0);
    await ledger.add(DAY, 0.25);
    await ledger.reserve(DAY, 0.05, 3);
    await ledger.reserve('2026-11-04', 0.05, 3);
    expect(await ledger.spendHolds()).toBeCloseTo(0.1, 9);
    expect(await ledger.get(DAY)).toMatchObject({ reserved_usd: 0 });
    expect((await ledger.get(DAY)).usd).toBeCloseTo(0.3, 9);
    expect((await ledger.get('2026-11-04')).usd).toBeCloseTo(0.05, 9);
  });

  test('a balance pays them, with an entry for each, and says which accounts', async () => {
    const { credit } = openStore(':memory:');
    await credit.apply({ id: 'm', account_key: 'x', delta_usd: 1, reason: 'minted', at: DAY });
    await credit.reserve('x', 0.05);
    const later = '2026-11-07';
    expect(await credit.spendHolds(later)).toEqual([{ account_key: 'x', usd: 0.05 }]);
    expect(await credit.get('x')).toMatchObject({ reserved_usd: 0 });
    expect((await credit.get('x'))?.balance_usd).toBeCloseTo(0.95, 9);
    expect((await credit.entries('x')).at(-1)).toMatchObject({ delta_usd: -0.05 });
    expect(await credit.spendHolds(later)).toEqual([]);
  });
});

describe('explorations nobody claimed', () => {
  const row = (id: string, owner: string | null, at: string) => ({
    id,
    owner,
    question: 'q',
    target: null,
    head: null,
    visibility: 'private',
    share_token_hash: null,
    forked_from: null,
    created_at: at,
    updated_at: at,
  });

  test('go with their steps, notes and links, a bounded number at a time, and only if unowned', async () => {
    const s = openStore(':memory:');
    const old = '2026-01-01T00:00:00.000Z';
    for (const id of ['a', 'b', 'c']) await s.exploration.create(row(id, null, old));
    await s.exploration.create(row('mine', 'prs_x', old));
    await s.exploration.create(row('new', null, '2026-11-06T00:00:00.000Z'));
    await s.note.append({ exploration: 'a', author: 'x', text: 't', at: old });
    await s.step.append({
      exploration: 'a',
      parent: null,
      spec_sha256: null,
      recipe_sha256: null,
      snapshot_sha256: null,
      door: null,
      note: null,
      at: old,
    });
    await s.explorationLink.create({
      id: 'l',
      exploration: 'a',
      scope: 'read',
      token_hash: 'h',
      created_at: old,
    });

    expect(await s.exploration.deleteUnclaimed('2026-06-01T00:00:00.000Z', 2)).toBe(2);
    expect(await s.exploration.deleteUnclaimed('2026-06-01T00:00:00.000Z', 2)).toBe(1);
    expect(await s.exploration.deleteUnclaimed('2026-06-01T00:00:00.000Z', 2)).toBe(0);
    expect(await s.exploration.get('a')).toBeNull();
    expect(await s.note.count('a')).toBe(0);
    expect(await s.step.count('a')).toBe(0);
    expect(await s.explorationLink.byTokenHash('h')).toBeNull();
    expect(await s.exploration.get('mine')).toBeTruthy();
    expect(await s.exploration.get('new')).toBeTruthy();
  });
});
