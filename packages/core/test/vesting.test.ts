// vesting/v1 (12 Nov: one vesting reader for anything, which works out a schedule and cuts the petals by it): a
// token's schedules, and each petal that holds them cut into unlocked, next unlock and later at its reading's
// date. TRUMP's numbers, worked apart.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { piecesOf } from '../src/reading/view.ts';
import type { SeamPiece } from '../src/seam.ts';
import type { Snapshot } from '../src/types/index.ts';
import { type Allocation, type Vesting, validateVesting, vestingPieces } from '../src/vesting.ts';

const SOL = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const MINT = '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN';
const LOCK = '2RH6rUTPBJ9rUDPpuV9b8z1YL56k1tYU6Uk5ZoaEFFSK';
const TEAM = 'TeamTeamTeamTeamTeamTeamTeamTeamTeamTeamTeam';
const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'schema', 'fixtures', 'vesting.v1.json'), 'utf8'),
) as Vesting;

/** A TRUMP reading of 5 Nov: Magna's lock account holding 400M, a team stream's account 600, someone else 5. */
const reading = (as_of = '2026-11-05T11:54:31Z', lock = '400000000') =>
  ({
    network: { id: 'solana-spl-holders', chain: SOL, population: 'p', params: { mint: MINT } },
    snapshot: { as_of, final: true },
    coverage: { measure: 'balance', unit: 'TRUMP' },
    participants: [{ id: LOCK }, { id: `${SOL}:${TEAM}` }, { id: 'Someone' }],
    holdings: [
      { participant: LOCK, measure: 'balance', amount: lock, unit: 'TRUMP' },
      { participant: `${SOL}:${TEAM}`, measure: 'balance', amount: '600', unit: 'TRUMP' },
      { participant: 'Someone', measure: 'balance', amount: '5', unit: 'TRUMP' },
    ],
    relationships: [],
  }) as unknown as Snapshot;

const team: Allocation = {
  name: 'Team',
  holder: `${SOL}:${TEAM}`,
  beneficiary: null,
  total: '1000',
  schedule: [
    { from: '2026-01-01T00:00:00Z', to: '2027-01-01T00:00:00Z', every: null, amount: '1000' },
  ],
  released: null,
  known: 'verified',
  how: 'a stream, read on chain',
  evidence: [],
};
const vesting = (allocations: Allocation[] = [...fixture.allocations, team]): Vesting => ({
  ...fixture,
  allocations,
});

const piece = (pieces: SeamPiece[], name: string) => pieces.find((p) => p.name === name);
const partsOf = (pieces: SeamPiece[], id: string) => {
  const p = piece(pieces, 'vesting');
  return p && 'parts' in p
    ? p.parts.filter((x) => x.participant === id).map((x) => [x.part, x.value])
    : [];
};
const valueIn = (pieces: SeamPiece[], name: string, id: string) => {
  const p = piece(pieces, name);
  return p && 'values' in p ? p.values.find((x) => x.participant === id)?.value : undefined;
};

describe('vesting/v1, the format', () => {
  test('the fixture is one: CIC 4 read on chain, CIC 1 inferred from it', () => {
    const v = validateVesting(fixture);
    expect(v.ok).toBe(true);
    expect(fixture.allocations.map((a) => [a.name, a.known])).toEqual([
      ['Creators & CIC Digital 1', 'inferred'],
      ['Creators & CIC Digital 4', 'verified'],
    ]);
  });

  test("a schedule that doesn't add up to its total, or a stream that ends before it starts, isn't one", () => {
    const [cic1] = fixture.allocations as [Allocation];
    const short = validateVesting(vesting([{ ...cic1, total: '360000001' }]));
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.errors[0]?.rule).toBe('sum');
    const back = validateVesting(
      vesting([
        {
          ...team,
          schedule: [{ ...(team.schedule[0] as object), from: '2028-01-01T00:00:00Z' } as never],
        },
      ]),
    );
    expect(back.ok).toBe(false);
    if (!back.ok) expect(back.errors[0]?.rule).toBe('order');
    expect(validateVesting({ ...fixture, extra: 1 }).ok).toBe(false);
  });
});

describe("vestingPieces: each petal that holds allocations, cut at its reading's date", () => {
  test("Magna's lock account: what it holds beyond what's locked, the next daily step, the rest", () => {
    const pieces = vestingPieces(reading(), vesting());
    // CIC 1 and CIC 4: their cliffs passed, 567 of 730 daily steps by 5 Nov 11:54; the next at 6 Nov 09:00
    expect(partsOf(pieces, LOCK)).toEqual([
      ['unlocked', '319642964.931505'],
      ['next unlock', '492987.945207'],
      ['later', '79864047.123288'],
    ]);
    expect(valueIn(pieces, 'next_unlock', LOCK)).toBe('2026-11-06T09:00:00.000Z');
    // two allocations in one account: no one tranche
    expect(valueIn(pieces, 'tranche', LOCK)).toBeUndefined();
    expect(piece(pieces, 'vesting')?.unit).toBe('TRUMP');
    // CIC 1 is inferred, so the pieces are
    expect(piece(pieces, 'vesting')?.standing).toBe('inferred');
  });

  test('a continuous stream has no next moment of its own; a petal holding one allocation names it', () => {
    const pieces = vestingPieces(reading(), vesting());
    const id = `${SOL}:${TEAM}`;
    expect(partsOf(pieces, id)).toEqual([
      ['unlocked', '445.195046'],
      ['later', '154.804954'],
    ]);
    expect(valueIn(pieces, 'next_unlock', id)).toBeUndefined();
    expect(valueIn(pieces, 'tranche', id)).toBe('Team');
    expect(partsOf(pieces, 'Someone')).toEqual([]);
  });

  test('the parts add up to what the petal holds', () => {
    const pieces = vestingPieces(reading(), vesting());
    const sum = partsOf(pieces, LOCK).reduce((n, [, v]) => n + Number(v), 0);
    expect(sum).toBeCloseTo(400000000, 3);
  });

  test("schedules that lock more than a petal holds don't cut it; its next unlock still stands", () => {
    const pieces = vestingPieces(reading('2026-11-05T11:54:31Z', '1000'), vesting());
    expect(partsOf(pieces, LOCK)).toEqual([]);
    expect(valueIn(pieces, 'next_unlock', LOCK)).toBe('2026-11-06T09:00:00.000Z');
  });

  test('once everything has unlocked: all of it unlocked, no next unlock', () => {
    const pieces = vestingPieces(reading('2028-02-01T00:00:00Z'), vesting());
    expect(partsOf(pieces, LOCK)).toEqual([['unlocked', '400000000']]);
    expect(valueIn(pieces, 'next_unlock', LOCK)).toBeUndefined();
  });

  test('before the cliff, the cliff is the next unlock', () => {
    const pieces = vestingPieces(reading('2025-02-01T00:00:00Z'), vesting(fixture.allocations));
    expect(valueIn(pieces, 'next_unlock', LOCK)).toBe('2025-04-17T09:00:00.000Z');
    // the cliff's 10% of each, at once
    expect(partsOf(pieces, LOCK)).toEqual([
      ['unlocked', '132000'],
      ['next unlock', '39986800'],
      ['later', '359881200'],
    ]);
  });

  test('none without vesting, or where it names none of the petals; the flower has them only when given', () => {
    expect(vestingPieces(reading(), null)).toEqual([]);
    expect(vestingPieces(reading(), vesting([{ ...team, holder: `${SOL}:Nobody` }]))).toEqual([]);
    const names = (extra: SeamPiece[]) => piecesOf(reading(), extra).map((p) => p.name);
    expect(names([])).not.toContain('vesting');
    expect(names(vestingPieces(reading(), vesting()))).toEqual(
      expect.arrayContaining(['vesting', 'next_unlock', 'tranche']),
    );
  });
});
