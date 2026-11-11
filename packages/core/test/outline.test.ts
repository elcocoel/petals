// The outline for /lab (annotation-layer.md, step 7; Elco's (b), 11 Nov): the view binds outline to a piece of
// data, core says each petal's value of it (categoryOf), and the look hands its lines to the values in the order
// they first appear round the flower. No value has a line of its own (Elco, 11 Nov: "dont give data hard coded
// use of visual manifestations"). The names here are invented.
import { describe, expect, test } from 'vitest';
import { makeClaim } from '../src/claims/index.ts';
import { categoryOf } from '../src/reading/index.ts';
import { OUTLINE_LINES, outlinesOf } from '../src/render/wedge/outline.ts';
import { namePieces } from '../src/seam.ts';
import type { ClaimKind } from '../src/types/index.ts';
import { GOLDEN_CASES, goldenSpec, readGolden } from './golden-cases.ts';

const petals = (values: (string | null)[]) => values.map((v, i) => ({ id: `p${i}`, v }));
const lines = (values: (string | null)[]) => {
  const ps = petals(values);
  return outlinesOf(ps, (id) => ps.find((p) => p.id === id)?.v);
};

describe('the look hands out its lines', () => {
  test('to the values in the order they first appear, the same value the same line', () => {
    const o = lines(['b', 'a', 'b', null, 'a']);
    expect(o.keys).toEqual([
      { value: 'b', dash: OUTLINE_LINES[0] },
      { value: 'a', dash: OUTLINE_LINES[1] },
    ]);
    expect(o.byId).toEqual({
      p0: OUTLINE_LINES[0],
      p1: OUTLINE_LINES[1],
      p2: OUTLINE_LINES[0],
      p4: OUTLINE_LINES[1],
    });
  });

  test('no value has a line of its own: the same values in another order take the lines in that order', () => {
    expect(lines(['sourced', 'inferred']).keys.map((k) => k.value)).toEqual([
      'sourced',
      'inferred',
    ]);
    expect(lines(['inferred', 'sourced']).keys.map((k) => k.value)).toEqual([
      'inferred',
      'sourced',
    ]);
    expect(lines(['inferred', 'sourced']).keys[0]?.dash).toBe(OUTLINE_LINES[0]);
  });

  test('three at most: a value past the third, a petal with none, and the tail draw no line', () => {
    expect(OUTLINE_LINES).toHaveLength(3);
    const o = lines(['a', 'b', 'c', 'd', null]);
    expect(o.keys.map((k) => k.value)).toEqual(['a', 'b', 'c']);
    expect(Object.keys(o.byId)).toEqual(['p0', 'p1', 'p2']);
    expect(outlinesOf([{ id: 't', tail: true }], () => 'a')).toEqual({ byId: {}, keys: [] });
  });
});

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
