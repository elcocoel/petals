// The labels dimension (annotation-layer.md, step 6; view/v2): with labels on a person's names, each petal an
// annotation names shows that name, and the rest keep their short address; the tail keeps its own label.
// Outline can take how the name is known, but no visual meaning is fixed for it (Elco, 11 Nov), so it draws
// nothing yet. By default every flower reads as it always did. The names here are invented.
import { describe, expect, test } from 'vitest';
import { makeClaim } from '../src/claims/index.ts';
import { readFlower } from '../src/reading/index.ts';
import { renderFlower } from '../src/render/index.ts';
import { noteText } from '../src/render/wedge/words.ts';
import { namePieces } from '../src/seam.ts';
import type { Claim, ClaimDraft, View } from '../src/types/index.ts';
import { DEFAULT_VIEW, DEFAULT_VIEW_V1 } from '../src/view/index.ts';
import { GOLDEN_CASES, goldenSpec, readGolden } from './golden-cases.ts';

const c = GOLDEN_CASES.find((g) => g.name === 'house-of-stake-default') as (typeof GOLDEN_CASES)[0];
const spec = goldenSpec(c);
const s = c.snapshot();
const [first, second, third] = readGolden(c).petals.filter((p) => !p.tail);
if (!first || !second || !third) throw new Error('the golden flower has fewer than three petals');

const named = (account: string, value: string, o: Partial<ClaimDraft> = {}): Claim =>
  makeClaim(
    {
      subject: `${s.network.chain}:${account}`,
      verb: 'named',
      object: { value },
      issued_at: '2026-11-10T12:00:00Z',
      kind: 'sourced',
      evidence: [{ url: 'https://example.org/proposal/167' }],
      by: 'near:mainnet:reed.example.near',
      ...o,
    },
    'claim/v2',
  );

const LONG = 'A Very Long Name For A Guild Treasury Multisig';
const claims = [
  named(first.id, 'Dekan'),
  named(second.id, 'EC', {
    kind: 'inferred',
    method: 'codex/research@2026-11-10',
    qualifiers: { grounds: 'research' },
  }),
  named(third.id, LONG, { kind: 'stated', evidence: [] }),
];
const pieces = namePieces(s, claims);

const withView = (edit: (d: Record<string, unknown>) => void): View => {
  const v = structuredClone(DEFAULT_VIEW);
  edit(v.dimensions as unknown as Record<string, unknown>);
  return v;
};
const names = withView((d) => (d.labels = { data: 'name' }));
const both = withView((d) => {
  d.labels = { data: 'name' };
  d.outline = { data: 'name_kind' };
});

describe('by default', () => {
  test('every flower reads as it always did, with names or without', () => {
    const golden = readGolden(c);
    expect(readFlower(spec, s, DEFAULT_VIEW)).toEqual(readFlower(spec, s, DEFAULT_VIEW_V1));
    expect(readFlower(spec, s, DEFAULT_VIEW, pieces)).toEqual(readFlower(spec, s, DEFAULT_VIEW));
    expect(readFlower(spec, s, DEFAULT_VIEW).petals.map((p) => p.name)).toEqual(
      golden.petals.map((p) => p.name),
    );
  });

  test('the picture is the same picture, v1 default or v2', () => {
    expect(renderFlower(spec, s, { view: DEFAULT_VIEW, pieces }).svg).toBe(
      renderFlower(spec, s, { view: DEFAULT_VIEW_V1 }).svg,
    );
  });
});

describe('labels on names', () => {
  const r = readFlower(spec, s, names, pieces);
  const byId = new Map(r.petals.map((p) => [p.id, p]));

  test('each named petal shows its name', () => {
    expect([first, second, third].map((p) => byId.get(p.id)?.name)).toEqual(['Dekan', 'EC', LONG]);
  });

  test('a petal no one named keeps its short address, and the tail its own label', () => {
    const rest = r.petals.filter((p) => !p.tail && ![first.id, second.id, third.id].includes(p.id));
    expect(rest.length).toBeGreaterThan(0);
    for (const p of rest) expect(p.name).toBe(p.label);
    const tail = r.petals.find((p) => p.tail);
    if (tail) expect(tail.name).toBe(tail.label);
  });

  test('a long name is cut at 24 characters on the flower, and whole where it is pointed at', () => {
    const p = byId.get(third.id);
    if (!p) throw new Error('no petal');
    expect(noteText(p)).toMatch(/^A Very Long Name For A … /);
    expect(noteText(p).split(' ').slice(0, -1).join(' ')).toHaveLength(24);
    expect(noteText(p, true)).toContain(LONG);
  });

  test('without the names (a visitor), every petal keeps its short address', () => {
    const visitor = readFlower(spec, s, names);
    for (const p of visitor.petals) expect(p.name).toBe(p.label);
  });

  test('nothing else changes: the same petals, sizes, colours and outlines', () => {
    const plain = readFlower(spec, s, DEFAULT_VIEW, pieces);
    expect(r.petals.map(({ name: _, ...p }) => p)).toEqual(
      plain.petals.map(({ name: _, ...p }) => p),
    );
    expect(r.legend).toEqual(plain.legend);
  });

  test('labels on the kind of account show the kind; none shows the short address', () => {
    const kinds = readFlower(
      spec,
      s,
      withView((d) => (d.labels = { data: 'kind' })),
    );
    for (const p of kinds.petals.filter((q) => !q.tail))
      expect(p.name).toBe(p.kind.replaceAll('_', ' '));
    const none = readFlower(
      spec,
      s,
      withView((d) => (d.labels = null)),
      pieces,
    );
    for (const p of none.petals) expect(p.name).toBe(p.label);
  });
});

describe('outline on how the name is known', () => {
  // Elco, 11 Nov: "dont give data hard coded use of visual manifestations - outlines are being designed and
  // could mean different things". Outline takes name_kind as a category, and nothing yet says how it looks.
  const r = readFlower(spec, s, both, pieces);

  test('is a choice the view can make, and draws nothing until the look designs it', () => {
    expect(both.dimensions).toMatchObject({ outline: { data: 'name_kind' } });
    expect(r.encodings.outline ?? null).toBeNull();
    expect(r.petals.every((p) => p.outline === null)).toBe(true);
  });

  test('gives it no words either: no legend entry, no detail, never verified', () => {
    expect(r.legend.some((i) => i.primitive === 'outline')).toBe(false);
    expect(r.details.some((d) => d.values.some((v) => v.primitive === 'outline'))).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/verified/);
  });

  test('the names still show', () => {
    expect(r.petals.find((p) => p.id === second.id)?.name).toBe('EC');
  });
});
