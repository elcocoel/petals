// T300: what the store has to do for the limits: indexes for what a stranger's request prunes, one
// atomic daily count, and holds that a restart counts as spent.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, test } from 'vitest';
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

describe('pruning uses an index, so a request never scans a table a stranger can grow', () => {
  test.each([
    ['challenge', 'DELETE FROM challenge WHERE expires_at <= ?'],
    ['session', 'DELETE FROM session WHERE expires_at <= ?'],
    ['publish_draft', 'DELETE FROM publish_draft WHERE expires_at <= ?'],
  ])('%s', (_name, sql) => {
    const { path, store } = fileStore();
    store.close();
    expect(plan(path, sql)).toMatch(/USING .*INDEX/);
  });

  test('a new challenge prunes the expired ones', () => {
    const { store } = fileStore();
    store.challenge.put('old', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    store.challenge.put('new', '2030-01-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z');
    expect(store.challenge.reserve('old', '2020-01-01T00:00:00.000Z')).toBe('unknown');
    expect(store.challenge.reserve('new', '2026-06-01T00:00:00.000Z')).toBe('ok');
  });
});

describe('a daily count', () => {
  test('takes up to the cap, per day and per thing, and forgets old days', () => {
    const { dailyCount } = openStore(':memory:');
    expect(dailyCount.take('a', DAY, 2)).toBe(true);
    expect(dailyCount.take('a', DAY, 2)).toBe(true);
    expect(dailyCount.take('a', DAY, 2)).toBe(false);
    expect(dailyCount.take('b', DAY, 1)).toBe(true);
    expect(dailyCount.get('a', DAY)).toBe(2);
    expect(dailyCount.take('a', '2026-11-07', 2)).toBe(true);
    expect(dailyCount.get('a', DAY)).toBe(0);
  });

  test('a cap of zero takes nothing', () => {
    expect(openStore(':memory:').dailyCount.take('a', DAY, 0)).toBe(false);
  });
});

describe('holds at a restart', () => {
  test('the ledger counts them as spent, each on its own day', () => {
    const { ledger } = openStore(':memory:');
    expect(ledger.spendHolds()).toBe(0);
    ledger.add(DAY, 0.25);
    ledger.reserve(DAY, 0.05, 3);
    ledger.reserve('2026-11-04', 0.05, 3);
    expect(ledger.spendHolds()).toBeCloseTo(0.1, 9);
    expect(ledger.get(DAY)).toMatchObject({ reserved_usd: 0 });
    expect(ledger.get(DAY).usd).toBeCloseTo(0.3, 9);
    expect(ledger.get('2026-11-04').usd).toBeCloseTo(0.05, 9);
  });

  test('a balance pays them, with an entry for each, and says which accounts', () => {
    const { credit } = openStore(':memory:');
    credit.apply({ id: 'm', account_key: 'x', delta_usd: 1, reason: 'minted', at: DAY });
    credit.reserve('x', 0.05);
    const later = '2026-11-07';
    expect(credit.spendHolds(later)).toEqual([{ account_key: 'x', usd: 0.05 }]);
    expect(credit.get('x')).toMatchObject({ reserved_usd: 0 });
    expect(credit.get('x')?.balance_usd).toBeCloseTo(0.95, 9);
    expect(credit.entries('x').at(-1)).toMatchObject({ delta_usd: -0.05 });
    expect(credit.spendHolds(later)).toEqual([]);
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

  test('go with their steps, notes and links, a bounded number at a time, and only if unowned', () => {
    const s = openStore(':memory:');
    const old = '2026-01-01T00:00:00.000Z';
    for (const id of ['a', 'b', 'c']) s.exploration.create(row(id, null, old));
    s.exploration.create(row('mine', 'prs_x', old));
    s.exploration.create(row('new', null, '2026-11-06T00:00:00.000Z'));
    s.note.append({ exploration: 'a', author: 'x', text: 't', at: old });
    s.step.append({
      exploration: 'a',
      parent: null,
      spec_sha256: null,
      recipe_sha256: null,
      snapshot_sha256: null,
      door: null,
      note: null,
      at: old,
    });
    s.explorationLink.create({
      id: 'l',
      exploration: 'a',
      scope: 'read',
      token_hash: 'h',
      created_at: old,
    });

    expect(s.exploration.deleteUnclaimed('2026-06-01T00:00:00.000Z', 2)).toBe(2);
    expect(s.exploration.deleteUnclaimed('2026-06-01T00:00:00.000Z', 2)).toBe(1);
    expect(s.exploration.deleteUnclaimed('2026-06-01T00:00:00.000Z', 2)).toBe(0);
    expect(s.exploration.get('a')).toBeNull();
    expect(s.note.count('a')).toBe(0);
    expect(s.step.count('a')).toBe(0);
    expect(s.explorationLink.byTokenHash('h')).toBeNull();
    expect(s.exploration.get('mine')).toBeTruthy();
    expect(s.exploration.get('new')).toBeTruthy();
  });
});
