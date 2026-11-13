// Time as data (last active, most active, and a colour grade for the petals that never voted): each petal's
// activity in its map's proposals.
import { describe, expect, test } from 'vitest';
import { activityPieces, NEVER_VOTED, VOTED } from '../src/activity.ts';
import type { Proposals } from '../src/proposals.ts';
import { piecesOf } from '../src/reading/view.ts';
import type { Snapshot } from '../src/types/index.ts';
import { ACTIVITY, SOME_FLOWERS } from '../src/view/index.ts';

const A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const C = '0xcccccccccccccccccccccccccccccccccccccccc';
const about = 'eip155:100:0x1111111111111111111111111111111111111111';
const reading = {
  network: { id: 'moloch-v3', chain: 'eip155:100', population: 'p', params: {} },
  participants: [{ id: A }, { id: B }, { id: C }],
  holdings: [],
  measures: [],
  relationships: [],
} as unknown as Snapshot;
const vote = (account: string, at: string | null) => ({
  account,
  vote: 'for' as const,
  as_said: 'yes',
  at,
});
const proposal = (id: string, at: string, votes: ReturnType<typeof vote>[]) => ({
  id,
  title: `Proposal ${id}`,
  kind: null,
  proposer: null,
  at,
  closes_at: null,
  decided_at: null,
  outcome: 'passed' as const,
  as_said: 'passed',
  ref: `proposal:${about}:${id}`,
  votes,
});
const proposals = (ps: ReturnType<typeof proposal>[]): Proposals =>
  ({
    petal: 'proposals/v2',
    about,
    source: { kind: 'baal', contract: about, ref: 'test', at: '2026-11-12T00:00:00.000Z' },
    proposals: ps,
    read_at: '2026-11-12T00:00:00.000Z',
  }) as unknown as Proposals;
const values = (pieces: ReturnType<typeof activityPieces>, name: string) =>
  Object.fromEntries(
    (
      pieces.find((p) => p.name === name) as { values: { participant: string; value: string }[] }
    ).values.map((v) => [v.participant, v.value]),
  );

describe("each petal's activity in its map's proposals", () => {
  test('votes cast, when it last voted, and voted or never, over the proposals read', () => {
    const pieces = activityPieces(
      reading,
      proposals([
        // a vote names its account in CAIP-10 or bare, in either case
        proposal('1', '2025-01-01T00:00:00.000Z', [
          vote(`eip155:100:${A.toUpperCase().replace('0X', '0x')}`, '2025-01-02T00:00:00.000Z'),
          vote(B, '2025-01-03T00:00:00.000Z'),
        ]),
        proposal('2', '2025-06-01T00:00:00.000Z', [vote(A, '2025-06-02T00:00:00.000Z')]),
        // someone not in the reading counts for nobody
        proposal('3', '2025-07-01T00:00:00.000Z', [
          vote('0xdddddddddddddddddddddddddddddddddddddddd', null),
        ]),
      ]),
    );
    expect(pieces.map((p) => [p.name, p.kind, p.standing])).toEqual([
      ['votes_cast', 'count', 'verified'],
      ['voted', 'category', 'verified'],
      ['last_active', 'date', 'verified'],
    ]);
    expect(values(pieces, 'votes_cast')).toEqual({ [A]: '2', [B]: '1', [C]: '0' });
    expect(values(pieces, 'voted')).toEqual({ [A]: VOTED, [B]: VOTED, [C]: NEVER_VOTED });
    expect(values(pieces, 'last_active')).toEqual({
      [A]: '2025-06-02T00:00:00.000Z',
      [B]: '2025-01-03T00:00:00.000Z',
    });
    expect(pieces[0]?.label).toBe('votes cast on its proposals from 2025-01-01 to 2025-07-01');
    expect(pieces[0]?.as_of).toBe('2026-11-12T00:00:00.000Z');
  });

  test("where a source keeps no vote's time (Sputnik), the proposal's, inferred, and the label says so", () => {
    const pieces = activityPieces(
      reading,
      proposals([proposal('1', '2025-03-01T00:00:00.000Z', [vote(A, null)])]),
    );
    const last = pieces.find((p) => p.name === 'last_active');
    expect(last?.standing).toBe('inferred');
    expect(last?.label).toMatch(/the time of the proposal it voted on/);
    expect(values(pieces, 'last_active')).toEqual({ [A]: '2025-03-01T00:00:00.000Z' });
  });

  test('no proposals read: none of the three', () => {
    expect(activityPieces(reading, null)).toEqual([]);
    expect(activityPieces(reading, proposals([]))).toEqual([]);
  });

  test("Tools offers them where they fit; a flower has them only when they're given", () => {
    expect(SOME_FLOWERS.map((p) => p.name)).toEqual([
      'backers',
      'votes_cast',
      'last_active',
      'voted',
      'vesting',
      'next_unlock',
      'tranche',
    ]);
    expect(ACTIVITY.map((p) => p.kind)).toEqual(['count', 'date', 'category']);
    const names = (extra: ReturnType<typeof activityPieces>) =>
      piecesOf(reading, extra).map((p) => p.name);
    expect(names([])).not.toContain('votes_cast');
    const given = activityPieces(
      reading,
      proposals([proposal('1', '2025-01-01T00:00:00.000Z', [vote(A, null)])]),
    );
    expect(names(given)).toEqual(expect.arrayContaining(['votes_cast', 'voted', 'last_active']));
  });
});
