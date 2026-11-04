// T024: validateSnapshot. The schema, then: every row's source is a sources[].id, every row has a
// date, group rows carry count, grouping only when declared in coverage.grouped[].
import { describe, expect, test } from 'vitest';
import type { Snapshot } from '../src/types/index.ts';
import { validateSnapshot } from '../src/validate/index.ts';
import { houseOfStake, tinyBackers, twoParticipants, validators } from './load.ts';
import { sampleSnapshot } from './samples.ts';

const clone = (): Snapshot => structuredClone(sampleSnapshot);
const rules = (x: unknown) => {
  const r = validateSnapshot(x);
  return r.ok ? [] : r.errors.map((e) => e.rule);
};

describe('validateSnapshot', () => {
  test.each([
    ['sample', () => sampleSnapshot],
    ['near-validators fixture', validators],
    ['house of stake golden input', houseOfStake],
    ['two-participants', twoParticipants],
    ['tiny-backers', tinyBackers],
  ])('%s is valid and comes back typed', (_name, load) => {
    const s = load();
    const r = validateSnapshot(s);
    expect(r.ok ? [] : r.errors).toEqual([]);
    expect(r.ok && r.value).toBe(s);
  });

  test('schema: a missing table is a schema error with its path', () => {
    const s = clone() as Partial<Snapshot>;
    delete s.events;
    const r = validateSnapshot(s);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors[0]).toMatchObject({ rule: 'schema', path: '' });
  });

  test('schema: not an object at all', () => {
    expect(rules('snapshot')).toEqual(['schema']);
  });

  test.each(['participants', 'holdings', 'relationships'] as const)(
    'a %s row whose source is not in sources[] is refused',
    (table) => {
      const s = clone();
      (s[table][0] as { source: string }).source = 'nowhere';
      const r = validateSnapshot(s);
      expect(!r.ok && r.errors).toEqual([
        { path: `/${table}/0/source`, rule: 'source', message: expect.stringContaining('nowhere') },
      ]);
    },
  );

  test('an event whose source is unknown is refused', () => {
    const s = clone();
    s.events.push({
      participant: 'a.pool.near',
      type: 'kicked_out',
      at: s.snapshot.as_of,
      source: 'x',
    });
    expect(rules(s)).toEqual(['source']);
  });

  test('every row has a date: an empty date is refused', () => {
    const s = clone();
    (s.holdings[0] as { as_of: string }).as_of = '';
    // the schema catches the format first; either way the row is refused
    expect(rules(s)).toContain('schema');
    const r = validateSnapshot(s);
    expect(!r.ok && r.errors[0]?.path).toBe('/holdings/0/as_of');
  });

  test('a group row must carry count', () => {
    const s = clone();
    delete s.participants[2]?.count;
    expect(rules(s)).toEqual(['group_count']);
  });

  test('only group rows carry count', () => {
    const s = clone();
    (s.participants[0] as { count?: number }).count = 3;
    expect(rules(s)).toEqual(['group_count']);
  });

  test('group rows need grouping declared in coverage.grouped', () => {
    const s = clone();
    delete s.coverage.grouped;
    const r = validateSnapshot(s);
    expect(!r.ok && r.errors).toEqual([
      { path: '/coverage/grouped', rule: 'grouping', message: expect.stringContaining('1 group') },
    ]);
    s.coverage.grouped = [
      { rule: 'under 1,000 NEAR, per pool', rows_folded: 12, amount: '1000.5' },
    ];
    expect(validateSnapshot(s).ok).toBe(true);
  });

  test('participant ids are unique', () => {
    const s = clone();
    s.participants.push({ ...(s.participants[0] as Snapshot['participants'][number]) });
    expect(rules(s)).toEqual(['unique_ids']);
  });

  test('holdings and relationships point at participants that exist', () => {
    const s = clone();
    (s.holdings[0] as { participant: string }).participant = 'ghost.near';
    (s.relationships[0] as { from: string }).from = 'ghost.near';
    expect(rules(s)).toEqual(['reference', 'reference']);
  });

  test('a relationship may point to a non-participant (e.g. a proposal)', () => {
    const s = clone();
    (s.relationships[0] as { to: string }).to = 'proposal:vote.dao:0';
    expect(validateSnapshot(s).ok).toBe(true);
  });
});
