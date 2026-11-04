// T017: the import helpers, and the checked-in NEAR validators fixture they produced.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { canonicalJson, sha256Hex } from '@petal/core';
import type { IndexRow, Snapshot } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { parseRecord } from '../src/import/csv.ts';
import { fromBaseUnits, sourceKind, toBaseUnits } from '../src/import/spike.ts';

describe('csv', () => {
  test('quoted fields, escaped quotes, empty fields', () => {
    expect(parseRecord('a,"b,c","say ""hi""",,e')).toEqual(['a', 'b,c', 'say "hi"', '', 'e']);
    expect(parseRecord('"{""k"":1}",x')).toEqual(['{"k":1}', 'x']);
  });
  test('an open quote waits for the next line', () => {
    expect(parseRecord('a,"line one')).toBeNull();
    expect(parseRecord('a,"line one\nline two"')).toEqual(['a', 'line one\nline two']);
  });
});

describe('units', () => {
  test('decimal strings and base units round-trip exactly', () => {
    expect(toBaseUnits('1000', 24)).toBe(1000n * 10n ** 24n);
    expect(toBaseUnits('6.306324756990708080010619', 24)).toBe(6306324756990708080010619n);
    expect(fromBaseUnits(6306324756990708080010619n, 24)).toBe('6.306324756990708080010619');
    expect(fromBaseUnits(10n ** 24n, 24)).toBe('1');
    expect(fromBaseUnits(2n, 24)).toBe('0.000000000000000000000002');
    expect(fromBaseUnits(0n, 24)).toBe('0');
    expect(() => toBaseUnits('1e3', 24)).toThrow();
  });
});

test('source kinds', () => {
  expect(
    sourceKind({ id: 'fastnear-rpc-validators', url: 'https://rpc.mainnet.fastnear.com' }),
  ).toBe('chain');
  expect(
    sourceKind({ id: 'nearblocks-validators', url: 'https://api.nearblocks.io/v3/validators' }),
  ).toBe('api');
  expect(sourceKind({ id: 'hos-constitution', url: 'https://gov.near.org/t/x' })).toBe(
    'constitution',
  );
  expect(sourceKind({ id: 'account-id', url: 'https://docs.near.org/x' })).toBe('docs');
});

describe('the NEAR validators fixture', () => {
  const dir = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'snapshots');
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as {
    petal: string;
    snapshots: IndexRow[];
  };
  const row = index.snapshots.find((r) => r.network === 'near-validators');
  if (!row) throw new Error('near-validators is not in fixtures/snapshots/index.json');
  const gz = readFileSync(join(dir, row.file));
  const s = JSON.parse(gunzipSync(gz).toString('utf8')) as Snapshot;

  test('is named by the SHA-256 of its canonical JSON, and indexed truthfully', () => {
    const canonical = canonicalJson(s);
    expect(index.petal).toBe('snapshot-index/v1');
    expect(row.file).toBe(`${row.sha256}.json.gz`);
    expect(sha256Hex(canonical)).toBe(row.sha256);
    expect(Buffer.byteLength(canonical)).toBe(row.bytes);
    expect(gz.length).toBe(row.gz_bytes);
    expect(row).toMatchObject({
      chain: 'near:mainnet',
      population: 'validators',
      block_height: s.snapshot.block_height,
      final: true,
      where: 'fixture',
    });
  });

  test('keeps 8,319 delegations of 1,000+ NEAR, 98.76% of delegated stake', () => {
    const delegations = s.relationships.filter((r) => r.type === 'delegates_to');
    const individual = delegations.filter((r) => !r.from.startsWith('group:'));
    const sum = (rs: typeof delegations) =>
      rs.reduce((a, r) => a + BigInt(r.amount_raw ?? '0'), 0n);
    expect(individual).toHaveLength(8319);
    const share = Number((sum(individual) * 1_000_000n) / sum(delegations)) / 10_000;
    expect(share.toFixed(2)).toBe('98.76');
    for (const r of individual)
      expect(BigInt(r.amount_raw ?? '0') >= 1000n * 10n ** 24n).toBe(true);
  });

  test('declares every fold in coverage.grouped, and the groups add up', () => {
    const groups = s.participants.filter((p) => p.kind === 'group');
    const rels = s.relationships.filter((r) => r.from.startsWith('group:'));
    const grouped = s.coverage.grouped ?? [];
    expect(grouped.length).toBeGreaterThan(0);
    expect(rels).toHaveLength(groups.length);
    const folded = grouped.reduce((a, g) => a + g.rows_folded, 0);
    expect(groups.reduce((a, g) => a + (g.count ?? 0), 0)).toBe(folded);
    expect(folded + 8319).toBe(286088);
    for (const g of groups) {
      expect(g.detail).toMatchObject({
        backer_class: expect.any(String),
        pool: expect.any(String),
      });
    }
  });

  test('covers all 371 seated validators and 862 pools', () => {
    const seated = new Set(
      s.holdings
        .filter((h) => h.measure === 'validator_stake_current_epoch')
        .map((h) => h.participant),
    );
    expect(seated.size).toBe(371);
    const pools = s.participants.filter(
      (p) => p.kind === 'staking_pool' || p.kind === 'staking_entity',
    );
    expect(pools.length).toBeGreaterThanOrEqual(862);
  });
});
