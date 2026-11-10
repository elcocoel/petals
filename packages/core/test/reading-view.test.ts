// Drawing from the viewer's view (specs/006-the-map/plan.md; SYSTEMS's conditions, 9 Nov): without a view
// the readings are what they always were; with one, the reading keeps reading/v1's fields and only the
// values the view picks change; a pick the look can't draw, or data a flower lacks, draws nothing.
import { describe, expect, test } from 'vitest';
import { readFlower } from '../src/reading/index.ts';
import { choicesOf, encodingsOf, piecesOf } from '../src/reading/view.ts';
import { renderFlower } from '../src/render/index.ts';
import type { View } from '../src/types/index.ts';
import { DEFAULT_VIEW } from '../src/view/index.ts';
import { GOLDEN_CASES, goldenSpec, readGolden } from './golden-cases.ts';

const caseOf = (name: string) =>
  GOLDEN_CASES.find((c) => c.name === name) as (typeof GOLDEN_CASES)[0];
const withView = (edit: (d: View['dimensions']) => void): View => {
  const v = structuredClone(DEFAULT_VIEW);
  edit(v.dimensions);
  return v;
};

describe('without a view', () => {
  test.each(GOLDEN_CASES.map((c) => [c.name, c] as const))('%s reads as it always did', (_, c) => {
    const spec = goldenSpec(c);
    expect(readFlower(spec, c.snapshot())).toEqual(readGolden(c));
    expect(renderFlower(spec, c.snapshot()).svg).toBe(renderFlower(spec, c.snapshot(), {}).svg);
  });
});

describe('with the default view', () => {
  test.each(['near-validators-default', 'house-of-stake-default'])(
    'the default flower %s reads exactly as without one',
    (name) => {
      const c = caseOf(name);
      const spec = goldenSpec(c);
      expect(readFlower(spec, c.snapshot(), DEFAULT_VIEW)).toEqual(readFlower(spec, c.snapshot()));
      expect(renderFlower(spec, c.snapshot(), { view: DEFAULT_VIEW }).render_sha256).toBe(
        renderFlower(spec, c.snapshot()).render_sha256,
      );
    },
  );

  test("a flower the agent drew with bands draws none: the agent's choice stays in its spec", () => {
    const c = caseOf('near-validators-backers');
    const spec = goldenSpec(c);
    const r = readFlower(spec, c.snapshot(), DEFAULT_VIEW);
    expect(spec.encodings.segments?.by).toBe('backers');
    expect(r.encodings.segments).toBeNull();
    expect(r.petals.every((p) => p.segments.length === 0)).toBe(true);
    expect(r.spec_sha256).toBe(readGolden(c).spec_sha256);
  });
});

describe('a view picks', () => {
  const c = caseOf('near-validators-default');
  const spec = goldenSpec(c);
  const s = c.snapshot();

  test('the reading keeps every field reading/v1 has', () => {
    const r = readFlower(
      spec,
      s,
      withView((d) => (d.colour = null)),
    );
    expect(Object.keys(r).sort()).toEqual(Object.keys(readFlower(spec, s)).sort());
    expect(Object.keys(r.petals[0] as object).sort()).toEqual(
      Object.keys(readFlower(spec, s).petals[0] as object).sort(),
    );
  });

  test('bands, where the flower has backers, are the same as the agent asking for them', () => {
    const banded = withView((d) => (d.segments = { data: 'backers' }));
    const golden = readGolden(caseOf('near-validators-backers'));
    const r = readFlower(spec, s, banded);
    expect(r.petals).toEqual(golden.petals);
  });

  test('nothing in a dimension draws nothing there, not a stand-in', () => {
    const r = readFlower(
      spec,
      s,
      withView((d) => {
        d.height = null;
        d.width = null;
        d.colour = null;
        d.outline = null;
      }),
    );
    expect(new Set(r.petals.map((p) => p.height))).toEqual(new Set([0.82]));
    expect(new Set(r.petals.map((p) => p.width))).toEqual(new Set([1]));
    expect(new Set(r.petals.filter((p) => !p.tail).map((p) => p.colour))).toEqual(
      new Set(['single']),
    );
    expect(r.petals.every((p) => p.outline === null)).toBe(true);
  });

  test("a piece of data the flower doesn't have draws nothing", () => {
    expect(
      choicesOf(
        withView((d) => (d.height = { data: 'proposals' })),
        s,
      ).height,
    ).toBe('equal');
    expect(
      choicesOf(
        withView((d) => (d.colour = { data: 'proposals' })),
        s,
      ).colour,
    ).toBe('single');
  });

  test('a holding by its own name draws as that piece, relative to the largest', () => {
    const own = piecesOf(s).find(
      (p) => p.kind === 'amount' && !['amount', 'share'].includes(p.name),
    );
    expect(own).toBeDefined();
    const name = (own as { name: string }).name;
    const e = encodingsOf(
      withView((d) => (d.height = { data: name })),
      spec,
      s,
    );
    expect(e.height.by).toBe(`m:${name}`);
    expect(e.height.meaning.length).toBeGreaterThan(0);
  });

  test('marks, texture and lines draw nothing yet', () => {
    const v = withView((d) => {
      d.markings = { data: 'share' };
      d.texture = { data: 'kind' };
    });
    const e = encodingsOf(v, spec, s);
    expect(e.markings ?? null).toBeNull();
    expect(e.lines ?? null).toBeNull();
  });
});
