// What a dimension reads for a petal from a category piece of data (core's categoryOf): its value, and only that.
// How a value looks is the look's, and nothing fixes one: data gets no hard-coded visual meaning. The names here
// are invented.
import { describe, expect, test } from 'vitest';
import { makeClaim } from '../src/claims/index.ts';
import { categoryOf } from '../src/reading/index.ts';
import { namePieces } from '../src/seam.ts';
import type { ClaimKind } from '../src/types/index.ts';
import { GOLDEN_CASES, goldenSpec, readGolden } from './golden-cases.ts';

describe("core says each petal's value, and only that", () => {
  const c = GOLDEN_CASES.find(
    (g) => g.name === 'house-of-stake-default',
  ) as (typeof GOLDEN_CASES)[0];
  const s = c.snapshot();
  const reading = readGolden(c);
  const real = reading.petals.filter((p) => !p.tail);
  const tail = reading.petals.find((p) => p.tail);

  test('identity: how it is known; the kind of account: its kind; the tail: none', () => {
    for (const p of real) {
      expect(categoryOf('identity')(p)).toBe(p.identity?.status ?? null);
      expect(categoryOf('kind')(p)).toBe(p.kind);
    }
    if (tail) expect(categoryOf('kind')(tail)).toBeNull();
    expect(goldenSpec(c).encodings.outline?.by).toBe('identity_status');
  });

  test("a person's name_kind, from their annotations; an account no one named, none", () => {
    const kinds: ClaimKind[] = ['sourced', 'inferred'];
    const claims = real.slice(0, 2).map((p, i) =>
      makeClaim(
        {
          subject: `${s.network.chain}:${p.id}`,
          verb: 'named',
          object: { value: `Sample ${i}` },
          issued_at: '2026-11-11T12:00:00Z',
          kind: kinds[i] as ClaimKind,
          evidence: [],
          by: 'near:mainnet:reed.example.near',
        },
        'claim/v2',
      ),
    );
    const value = categoryOf('name_kind', namePieces(s, claims));
    expect(real.slice(0, 3).map(value)).toEqual(['sourced', 'inferred', null]);
    expect(categoryOf('name_kind')(real[0] as (typeof real)[0])).toBeNull();
  });
});
