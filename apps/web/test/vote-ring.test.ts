// The vote ring on the product's flowers (#93): a map's proposals over its last 90 days, in the question's own
// colours, on every flower page whose map has any (lib/vote-ring.ts, viewmodels/useMapVotes.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GREY, KEYS } from '@petal/core/wedge/keys';
import type { Proposal } from '@petal/core/wedge/votes';
import { describe, expect, test } from 'vitest';
import { RING_DAYS, stretchOf, VOTE_COLOURS, voteRing } from '../lib/vote-ring.ts';

const WEB = join(import.meta.dirname, '..');
const text = (f: string) => readFileSync(join(WEB, f), 'utf8');

const proposal = (
  id: string,
  at: string,
  decided_at: string | null,
  closes_at?: string,
): Proposal => ({
  id,
  title: id,
  at,
  decided_at,
  ...(closes_at ? { closes_at } : {}),
  outcome: 'passed',
  votes: [],
});

describe("a map's ring", () => {
  test('none where the map has no proposals', () => {
    expect(voteRing(null)).toBeNull();
    expect(voteRing([])).toBeNull();
  });

  test('its last 90 days, up to when the newest one closes', () => {
    const ps = [
      proposal('a', '2026-01-01T00:00:00Z', '2026-01-05T00:00:00Z'),
      proposal('b', '2026-06-01T00:00:00Z', null, '2026-06-08T00:00:00Z'),
    ];
    expect(stretchOf(ps)).toEqual({
      from: new Date(Date.parse('2026-06-08T00:00:00Z') - RING_DAYS * 86_400_000).toISOString(),
      to: '2026-06-08T00:00:00.000Z',
    });
    expect(voteRing(ps)?.proposals).toBe(ps);
  });

  test('for mint, against pink, abstain grey', () => {
    expect(VOTE_COLOURS).toEqual({ for: KEYS[0]?.hex, against: KEYS[4]?.hex, abstain: GREY.hex });
  });

  test('every flower page asks for it, and the flower draws it in its own look with round tops', () => {
    expect(text('viewmodels/useFlowerPage.ts')).toMatch(/useMapVotes\(flower\.spec\)/);
    expect(text('flower/FlowerPage.tsx')).toMatch(/votes=\{state\.votes\}/);
    expect(text('flower/InteractionSurface.tsx')).toMatch(/votes=\{state\.votes\}/);
    expect(text('flower/drive.ts')).toMatch(
      /\.\.\.lookFills\(m\.petals\), highlight: \[\], roundTops: true, votes/,
    );
  });

  test('proposals/v2: a vote that is neither for nor against is a grey dot, counted apart', () => {
    const scene = text('flower/scene.ts');
    expect(scene).toMatch(/if \(!cast\.has\(petal\.id\)\) return;/);
    expect(scene).toMatch(/fill: votes\.colours\[v \?\? 'abstain'\]/);
    expect(scene).toMatch(/chose otherwise/);
  });
});

test('one look: every flower has round tops, with a vote ring or without (Elco, 12 Nov walk: no fork)', () => {
  expect(text('flower/scene.ts')).toMatch(
    /given \?\? \{ \.\.\.lookFills\(m\.petals\), highlight: \[\], roundTops: true \}/,
  );
  expect(text('landscape/useLandscape.ts')).toMatch(
    /roundTops: true,\s+\.\.\.\(ring \? \{ votes: ring \} : \{\}\)/,
  );
  expect(text('landscape/scene.ts')).toMatch(/roundTopPath\(ring, i, ring\.h\[i\] as number\)/);
});
