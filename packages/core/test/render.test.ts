// T030: renderFlower (contracts/renderer.md). Structure the web relies on, determinism rules,
// straight edges only, the width band, refusal of invalid specs and unavailable primitives.
import { describe, expect, test } from 'vitest';
import { buildSpec } from '../src/convention/index.ts';
import { InvalidSpecError } from '../src/errors.ts';
import { specHash } from '../src/hash.ts';
import { widthFactors } from '../src/reading/encodings.ts';
import { renderFlower } from '../src/render/index.ts';
import { selectPetals } from '../src/select.ts';
import { snapshotSha256 } from '../src/tables.ts';
import type { ProposeChoices, Snapshot, Spec } from '../src/types/index.ts';
import { descriptorFor } from './descriptors.ts';
import { tinyBackers, twoParticipants, validators } from './load.ts';
import { sampleSnapshot } from './samples.ts';

const MEASURE = 'validator_stake_current_epoch';
function specFor(s: Snapshot, choices: ProposeChoices = {}, measure = MEASURE): Spec {
  const d = descriptorFor(s, { measure });
  return buildSpec({ network: d.id, sha256: snapshotSha256(s), choices }, d, s).spec;
}

/** A synthetic population of n holders (amounts n..1), for big-flower checks. */
function population(n: number): Snapshot {
  const s = structuredClone(sampleSnapshot);
  s.network.id = 'test-population';
  s.coverage.measure = 'm';
  delete s.coverage.grouped;
  s.participants = Array.from({ length: n }, (_, i) => ({
    id: `p${String(i).padStart(4, '0')}`,
    label: `P${i}`,
    kind: i % 3 ? 'person' : 'organisation',
    identity:
      i % 5
        ? null
        : {
            name: `Named ${i}`,
            source: 'rpc-validators',
            status: i % 10 ? 'inferred' : 'self-declared',
          },
    source: 'rpc-validators',
  }));
  s.holdings = s.participants.map((p, i) => ({
    participant: p.id,
    asset: 'X',
    measure: 'm',
    amount: String(n - i),
    unit: 'X',
    as_of: s.snapshot.as_of,
    source: 'rpc-validators',
  }));
  s.relationships = [];
  return s;
}

describe('renderFlower on the NEAR validators fixture (segments: backers)', () => {
  const s = validators();
  const spec = specFor(s, { segments: 'backers' });
  const r = renderFlower(spec, s);

  test('root element as renderer.md states it, now render/v2', () => {
    expect(r.svg.split('\n')[0]).toBe(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" role="img" aria-label="NEAR validators" data-petal="render/v2" data-spec="${specHash(spec)}">`,
    );
    expect(r.svg.endsWith('</svg>\n')).toBe(true);
  });

  test('fixed element order: style, the petals, the polygon, the names, the title', () => {
    const at = (needle: string) => r.svg.indexOf(needle);
    const order = [
      '<style>',
      'class="petal-bars"',
      'class="petal-poly"',
      '</text>',
      'class="petal-centre"',
    ].map(at);
    expect(order.every((x) => x > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('every petal is drawn, each part carrying data-p and data-i, a banded one cut into its backers', () => {
    const wedges = [
      ...r.svg.matchAll(
        /<path(?: class="(c-[\w-]+)")?(?: style="fill:var\(--tail\)")? data-p="([^"]+)" data-i="(\d+)"(?: data-seg="(\w+)")? d="[^"]+"\/>/g,
      ),
    ];
    expect(new Set(wedges.map((m) => m[2])).size).toBe(61);
    expect([...new Set(wedges.map((m) => Number(m[3])))]).toEqual([...Array(61).keys()]);
    expect(wedges.every((m) => m[1] || m[2] === '__tail')).toBe(true);
    expect(wedges.map((m) => m[4]).filter(Boolean)).toEqual(
      expect.arrayContaining(['other', 'large', 'liquid', 'lockup']),
    );
  });

  test('the tail: data-p="__tail", in the tail\'s tone, named with its count and share', () => {
    expect(r.svg).toMatch(/class="c-key-grey" data-p="__tail" data-i="60"/);
    expect(r.svg).toContain('>everyone else (311) 13.8%</text>');
  });

  test('straight edges only: paths use M and L, closed by Z, nothing that curves', () => {
    for (const [, d] of r.svg.matchAll(/ d="([^"]+)"/g)) expect(d).toMatch(/^M[-0-9. L]+Z?$/);
  });

  test('coordinates are written with at most three decimals, and no -0', () => {
    const numbers = [...r.svg.matchAll(/ (?:d|x|y)="([^"]+)"/g)].flatMap(
      ([, v]) => (v ?? '').match(/-?\d+(\.\d+)?/g) ?? [],
    );
    expect(numbers.length).toBeGreaterThan(500);
    for (const n of numbers) expect(n).toMatch(/^-?\d+(\.\d{1,3})?$/);
    expect(r.svg).not.toMatch(/[ "ML]-0[ "L]/);
  });

  test('colours are CSS custom properties with a .petal-dark override; no script', () => {
    expect(r.svg).toContain('svg[data-petal]{--ink:');
    expect(r.svg).toContain('.petal-dark svg[data-petal],svg[data-petal].petal-dark{');
    expect(r.svg).not.toMatch(/#[0-9a-f]{6}"/i); // no colour literal in an attribute
    expect(r.svg).not.toContain('<script');
  });

  test('legend: what this look draws, an order line, the tail, with meanings and sources from the spec', () => {
    // Outlines aren't drawn in the one look yet, so the legend leaves them out.
    expect(r.legend.map((l) => l.primitive)).toEqual([
      'width',
      'height',
      'colour',
      'segments',
      'order',
      'tail',
    ]);
    for (const l of r.legend.filter((x) => x.primitive !== 'tail')) {
      const e = spec.encodings[l.primitive as 'width'];
      expect(l.meaning).toBe(e.meaning);
      expect(l.sources).toEqual(e.sources);
    }
    expect(r.legend.find((l) => l.primitive === 'order')?.meaning).toBe(
      'largest first, clockwise from the top',
    );
  });

  test('petal details say why each petal looks the way it does', () => {
    expect(r.petals).toHaveLength(61);
    const first = r.petals[0];
    expect(first).toMatchObject({
      index: 0,
      id: 'astro-stakers.poolv1.near',
      rank: 1,
      share: 0.056071,
      kind: 'staking_pool',
    });
    expect(first?.values.map((v) => v.primitive)).toEqual([
      'width',
      'height',
      'colour',
      'outline',
      'segments',
      'order',
    ]);
    expect(first?.segments?.map((x) => x.key)).toEqual(['other', 'large', 'liquid', 'lockup']);
    const tail = r.petals[60];
    expect(tail).toMatchObject({ id: '__tail', count: 311, rank: 61 });
    expect(tail?.segments).toBeUndefined();
  });

  test('render_sha256 is the SHA-256 of the SVG bytes; same input, same bytes', () => {
    const again = renderFlower(structuredClone(spec), s);
    expect(again.svg).toBe(r.svg);
    expect(again.render_sha256).toBe(r.render_sha256);
    expect(r.render_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test('a spec with the same content in another key order draws the same bytes', () => {
    const reverse = (x: unknown): unknown =>
      Array.isArray(x)
        ? x.map(reverse)
        : x && typeof x === 'object'
          ? Object.fromEntries(
              Object.entries(x)
                .reverse()
                .map(([k, v]) => [k, reverse(v)]),
            )
          : x;
    const reordered = reverse(spec) as Spec;
    expect(Object.keys(reordered)[0]).toBe('convention');
    expect(renderFlower(reordered, s).svg).toBe(r.svg);
  });
});

describe('renderFlower refuses (FR-032)', () => {
  const s = tinyBackers();
  const spec = specFor(s, { segments: 'backers' });

  test('anything validateSpec rejects throws invalid_spec with its errors', () => {
    const bad = structuredClone(spec);
    bad.encodings.width.max_ratio = 5;
    let caught: unknown;
    try {
      renderFlower(bad, s);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(InvalidSpecError);
    expect(caught).toMatchObject({
      code: 'invalid_spec',
      errors: [expect.objectContaining({ rule: 'width_band' })],
    });
  });

  test('an unavailable primitive is never drawn', () => {
    const lines = structuredClone(spec);
    lines.encodings.lines = {
      by: 'shared_delegators',
      meaning: 'shared delegators',
      sources: ['fastnear-rpc-staking-pool-views'],
    };
    expect(() => renderFlower(lines, s)).toThrow(expect.objectContaining({ code: 'invalid_spec' }));
    const texture = structuredClone(spec) as unknown as { encodings: Record<string, unknown> };
    texture.encodings.opacity = { by: 'x', meaning: 'see-through', sources: ['x'] };
    expect(() => renderFlower(texture as unknown as Spec, s)).toThrow(/opacity/);
  });

  test('a snapshot that is not the one the spec names', () => {
    expect(() => renderFlower(spec, twoParticipants())).toThrow(
      expect.objectContaining({ code: 'invalid_spec' }),
    );
  });

  test('a bad size', () => {
    expect(() => renderFlower(spec, s, { size: 0 })).toThrow(
      expect.objectContaining({ code: 'bad_input' }),
    );
  });
});

describe('renderFlower geometry', () => {
  test('two participants: two wedges, no tail, the polygon closed', () => {
    const s = twoParticipants();
    const r = renderFlower(specFor(s), s);
    expect(r.petals.map((p) => p.id)).toEqual(['astro-stakers.poolv1.near', 'figment.poolv1.near']);
    expect(r.svg).not.toContain('__tail');
    expect((r.svg.match(/ data-p="/g) ?? []).length).toBe(2);
    expect(r.svg).toMatch(/class="petal-poly"[^>]* d="M[^"]+Z"/);
  });

  test('width stays in the band: widest side at most max_ratio times the narrowest', () => {
    const s = validators();
    for (const [choice, ratio] of [
      ['r1.5', 1.5],
      ['r2', 2],
      ['r3', 3],
    ] as const) {
      const spec = specFor(s, { width: choice });
      const w = widthFactors(selectPetals(s, spec.selection), spec.encodings.width);
      expect(Math.max(...w) / Math.min(...w)).toBeCloseTo(ratio, 9);
    }
    const eq = specFor(s, { width: 'equal' });
    expect(new Set(widthFactors(selectPetals(s, eq.selection), eq.encodings.width))).toEqual(
      new Set([1]),
    );
  });

  test('a thumbnail: no labels, no outlines, tighter margin, same legend and petals', () => {
    const s = tinyBackers();
    const spec = specFor(s, { segments: 'backers' });
    const full = renderFlower(spec, s);
    const thumb = renderFlower(spec, s, { size: 104, thumb: true });
    expect(thumb.svg).toContain('viewBox="0 0 104 104"');
    expect(thumb.svg).not.toContain('<text');
    expect(thumb.svg).not.toContain('class="petal-outline');
    expect(thumb.legend).toEqual(full.legend);
    expect(thumb.petals).toEqual(full.petals);
    expect(thumb.render_sha256).not.toBe(full.render_sha256);
  });

  test('1,000 participants: 60 petals and a tail of 940, every choice draws', () => {
    const s = population(1000);
    const choices: ProposeChoices[] = [
      {},
      { height: 'linear', colour: 'identity' },
      { height: 'log', colour: 'single', width: 'r3' },
      { height: 'equal', width: 'equal', outline: 'none', petals: 300 },
    ];
    for (const c of choices) {
      const r = renderFlower(specFor(s, c, 'm'), s);
      const tail = r.petals.at(-1);
      expect(tail?.id).toBe('__tail');
      expect(tail?.count).toBe(1000 - (c.petals ?? 60));
      for (const [, d] of r.svg.matchAll(/ d="([^"]+)"/g)) expect(d).toMatch(/^M[-0-9. L]+Z?$/);
    }
  });

  test("outlines aren't drawn yet in the one look, and the legend says nothing of them", () => {
    const s = population(30);
    const r = renderFlower(specFor(s, {}, 'm'), s);
    expect(r.svg).not.toContain('class="petal-outline');
    expect(r.legend.map((l) => l.primitive)).not.toContain('outline');
  });

  test('height m:<metric> draws from another holding measure', () => {
    const s = tinyBackers();
    const r = renderFlower(specFor(s, { height: 'm:num_produced_blocks_current_epoch' }), s);
    expect(r.legend.find((l) => l.primitive === 'height')?.meaning).toContain(
      'num_produced_blocks_current_epoch',
    );
  });

  test('labels and ids are escaped', () => {
    const s = population(6);
    (s.participants[0] as { identity: { name: string } }).identity.name = 'A & <B> "C"';
    const r = renderFlower(specFor(s, {}, 'm'), s);
    expect(r.svg).toContain('A &amp; &lt;B&gt; &quot;C&quot;');
  });
});
