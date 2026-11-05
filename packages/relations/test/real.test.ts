// T198: real answers on the stored snapshots, checked by hand: this file reads the raw fixtures and
// intersects plain Sets, sharing no code with the index. Counts only: no account is named here.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { computeFigures } from '@petal/core';
import type { Snapshot } from '@petal/core/types';
import { beforeAll, describe, expect, test } from 'vitest';
import { type Queries, RelationsIndex, type SnapshotSource } from '../src/index.ts';
import { tmpIndexPath } from './helpers.ts';

const DIR = join(import.meta.dirname, '../../../fixtures/snapshots');
const rows = (
  JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8')) as {
    snapshots: { sha256: string; file: string }[];
  }
).snapshots;
const raw = new Map(
  rows.map((r) => [
    r.sha256,
    JSON.parse(gunzipSync(readFileSync(join(DIR, r.file))).toString()) as Snapshot,
  ]),
);
const fixtures: SnapshotSource = {
  list: async () => rows.map((r) => ({ sha256: r.sha256 })),
  get: async (sha) => raw.get(sha) ?? null,
};
const titled = (title: string, nth = 0): [string, Snapshot] => {
  const hit = [...raw].filter(([, s]) => s.network.title === title);
  const entry = hit.sort((a, b) => (a[1].snapshot.as_of < b[1].snapshot.as_of ? -1 : 1))[nth];
  if (!entry) throw new Error(title);
  return entry;
};

/** The accounts of a snapshot's main measure, straight from its rows. */
function holders(s: Snapshot, measure = s.coverage.measure): Set<string> {
  const folded = new Set(s.participants.filter((p) => p.kind === 'group').map((p) => p.id));
  return new Set(
    s.holdings
      .filter((h) => h.measure === measure && !folded.has(h.participant) && Number(h.amount) > 0)
      .map((h) => h.participant),
  );
}
const intersect = (a: Set<string>, b: Set<string>): string[] => [...a].filter((x) => b.has(x));

let q: Queries;
let groupOf: Map<string, string>;
beforeAll(async () => {
  const index = new RelationsIndex(tmpIndexPath());
  q = await index.answer(fixtures, (x) => x);
  groupOf = new Map(
    q.overview({ kind: 'holdings', limit: 0 }).groups.map((g) => [g.title, g.id] as const),
  );
});
const id = (title: string) => groupOf.get(title) as string;

describe('the top-level groups, against the raw files', () => {
  const TOP = [
    ['MELANIA token holders', 'TRUMP token holders', 120, 'observed', true],
    ['ENS delegates', 'BANK holders, Ethereum', 6, 'observed', true],
    ['ENS delegates', 'Beanstalk, April 2022', 5, 'observed', true],
    ['ENS delegates', 'Moloch v1 members', 2, 'observed', false],
    ['DPX holders, Arbitrum', 'Beanstalk, April 2022', 2, 'inferred', true],
    ['DPX holders, Arbitrum', 'SEAM active holders, Base', 2, 'inferred', true],
    ['DPX holders, Arbitrum', 'ENS delegates', 1, 'inferred', true],
    ['DPX holders, Arbitrum', 'BANK holders, Ethereum', 1, 'inferred', true],
    ['SEAM active holders, Base', 'BANK holders, Ethereum', 1, 'inferred', true],
  ] as const;

  test.each(TOP)('%s x %s: %i', (a, b, count, status, atLeast) => {
    const nth = (t: string) => (t.startsWith('Beanstalk') ? 1 : 0);
    const by = intersect(holders(titled(a, nth(a))[1]), holders(titled(b, nth(b))[1]));
    expect(by).toHaveLength(count);
    const r = q.sharedAccounts(id(a), id(b), { limit: 1000 });
    expect(r.shared).toBe(count);
    expect(r.match.status).toBe(status);
    expect(r.at_least).toBe(atLeast);
    const accounts = r.accounts.map((x) => x.account_a.slice(x.account_a.lastIndexOf(':') + 1));
    expect(accounts.sort()).toEqual(by.sort());
  });

  test('exactly those pairs overlap, among every top-level pair', () => {
    const o = q.overview({ kind: 'holdings' });
    expect(o.pairs_total).toBe(TOP.length);
    const titles = [...groupOf.keys()];
    let nonZero = 0;
    for (let i = 0; i < titles.length; i++) {
      for (let j = i + 1; j < titles.length; j++) {
        const [a, b] = [titles[i] as string, titles[j] as string];
        const measureOf = (t: string, s: Snapshot) =>
          t === 'NEAR validators' ? 'pool_contract_stake' : s.coverage.measure;
        const sa = titled(a, a.startsWith('Beanstalk') ? 1 : 0)[1];
        const sb = titled(b, b.startsWith('Beanstalk') ? 1 : 0)[1];
        const both = intersect(holders(sa, measureOf(a, sa)), holders(sb, measureOf(b, sb)));
        expect(q.sharedAccounts(id(a), id(b), { limit: 0 }).shared, `${a} x ${b}`).toBe(
          both.length,
        );
        if (both.length) nonZero++;
      }
    }
    expect(nonZero).toBe(TOP.length);
  });

  test('5 of the 9 rest on the cross-chain inference, and carry a method', () => {
    const o = q.overview({ kind: 'holdings' });
    const inferred = o.pairs.filter((p) => p.match.status === 'inferred');
    expect(inferred).toHaveLength(5);
    expect(
      inferred.every((p) => 'method' in p.match && p.match.method === 'same_evm_address'),
    ).toBe(true);
  });

  test('dates and the real gaps: ENS and Moloch are five years apart', () => {
    const r = q.sharedAccounts(id('ENS delegates'), id('Moloch v1 members'));
    expect(r.gap_days).toBeGreaterThan(1800);
    expect(r.at_least).toBe(false);
    expect(r.a.coverage.complete && r.b.coverage.complete).toBe(true);
  });

  test('coverage is what the fixtures say: MELANIA names 1,000 of 222,279', () => {
    const r = q.relatedGroups(id('MELANIA token holders'));
    expect(r.group.coverage).toMatchObject({
      members_named: 1000,
      members_total: 222_279,
      complete: false,
    });
    expect(r.related[0]?.at_least).toBe(true);
  });
});

describe('Beanstalk: one group at two dates', () => {
  const beanstalk = () => id('Beanstalk, April 2022');

  test('it is one group, and is not related to itself', () => {
    expect(q.overview({ kind: 'holdings' }).groups.filter((g) => g.module === 'beanstalk')).toEqual(
      [expect.objectContaining({ observations: 2 })],
    );
    const r = q.relatedGroups(beanstalk());
    expect(r.related.map((g) => g.group.group_id)).not.toContain(beanstalk());
  });

  test('its two dates can be compared by name: the raw overlap, 14 seconds apart', () => {
    const [shaA, a] = titled('Beanstalk, April 2022', 0);
    const [shaB, b] = titled('Beanstalk, April 2022', 1);
    const by = intersect(holders(a), holders(b));
    const r = q.sharedAccounts(`${beanstalk()}@${shaA}`, `${beanstalk()}@${shaB}`, { limit: 0 });
    expect(r.shared).toBe(by.length);
    expect(r.shared).toBe(2035);
    expect(r.gap_seconds).toBe(14);
    expect(r.same_group).toBe(true);
  });

  test('both dates appear for one of its accounts', () => {
    const [, a] = titled('Beanstalk, April 2022', 0);
    const [, b] = titled('Beanstalk, April 2022', 1);
    const [one] = intersect(holders(a), holders(b));
    const rows = q
      .accountGroups(`eip155:1:${one}`)
      .groups.filter((g) => g.group.group_id === beanstalk());
    expect(rows).toHaveLength(2);
  });
});

describe('NEAR: hundreds of groups in one snapshot', () => {
  const [, near] = titled('NEAR validators');
  const pools = () => {
    const folded = new Set(near.participants.filter((p) => p.kind === 'group').map((p) => p.id));
    const out = new Map<string, Set<string>>();
    for (const r of near.relationships) {
      if (r.type !== 'delegates_to') continue;
      if (!out.has(r.to)) out.set(r.to, new Set());
      if (!folded.has(r.from) && Number(r.amount ?? 0) > 0) out.get(r.to)?.add(r.from);
    }
    return out;
  };

  test('one group per pool, with the delegators the relationships name', () => {
    const raw = pools();
    const groups = q.overview({ kind: 'delegators', limit: 0 }).groups;
    expect(groups).toHaveLength(raw.size);
    for (const g of groups) {
      const pool = g.id.split('delegators:')[1] as string;
      expect(g.members_named, pool).toBe(raw.get(pool)?.size);
    }
  });

  test('the count of overlapping pool pairs, by hand', () => {
    const sets = [...pools().values()];
    let nonZero = 0;
    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        if (intersect(sets[i] as Set<string>, sets[j] as Set<string>).length) nonZero++;
      }
    }
    expect(q.overview({ kind: 'delegators', limit: 0 }).pairs_total).toBe(nonZero);
  });

  test('a pool and its delegators are one hop apart, through the group about it', () => {
    const [pool, members] = [...pools()].find(([, m]) => m.size > 2) as [string, Set<string>];
    const [member] = members;
    const r = q.path(`near:mainnet:${member}`, `near:mainnet:${pool}`);
    expect(r.hops).toHaveLength(1);
    expect(r.hops[0]).toMatchObject({ via: 'group', to_in_group: { role: 'anchor' } });
  });
});

test('a folded id from two snapshots makes no account and no overlap', () => {
  const inTwo = new Map<string, number>();
  for (const s of raw.values()) {
    for (const p of s.participants) {
      if (p.kind === 'group') inTwo.set(p.id, (inTwo.get(p.id) ?? 0) + 1);
    }
  }
  const shared = [...inTwo].filter(([, n]) => n > 1).map(([id]) => id);
  expect(shared.length).toBeGreaterThan(0);
  for (const id of shared.slice(0, 50)) expect(q.accountGroups(id).groups).toEqual([]);
});

test('shares and ranks are the ones compute_figures gives', () => {
  const [, ens] = titled('ENS delegates');
  const figures = computeFigures(ens, { measure: 'delegated_votes', petals: 200 });
  for (const row of figures.shares.slice(0, 200)) {
    const groups = q.accountGroups(`eip155:1:${row.id}`).groups;
    const here = groups.find((g) => g.group.group_id === id('ENS delegates'));
    expect(here?.share, row.id).toBe(row.share);
    expect(here?.rank, row.id).toBe(row.rank);
    expect(here?.amount, row.id).toBe(row.amount);
  }
});

test('amounts past a double stay exact, as stored', () => {
  const [, ens] = titled('ENS delegates');
  const long = ens.holdings.filter((h) => h.amount.replace('.', '').length > 17).slice(0, 50);
  expect(long.length).toBeGreaterThan(0);
  for (const h of long) {
    const groups = q.accountGroups(`eip155:1:${h.participant}`).groups;
    const here = groups.find((g) => g.group.group_id === id('ENS delegates'));
    expect(here?.amount).toBe(h.amount);
  }
});
