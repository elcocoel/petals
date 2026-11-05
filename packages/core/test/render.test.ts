// T030: renderFlower (contracts/renderer.md). Structure the web relies on, determinism rules,
// straight edges only, the width band, refusal of invalid specs and unavailable primitives.
import { describe, expect, test } from 'vitest';
import { buildSpec } from '../src/convention/index.ts';
import { InvalidSpecError } from '../src/errors.ts';
import { specHash } from '../src/hash.ts';
import { widthFactors } from '../src/reading/encodings.ts';
import { layout } from '../src/render/geometry.ts';
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

  test('root element as renderer.md states it', () => {
    expect(r.svg.split('\n')[0]).toBe(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" role="img" aria-label="NEAR validators" data-petal="render/v1" data-spec="${specHash(spec)}">`,
    );
    expect(r.svg.endsWith('</svg>\n')).toBe(true);
  });

  test('fixed element order: style, defs, polygon, bars, outlines, labels', () => {
    const at = (needle: string) => r.svg.indexOf(needle);
    const order = [
      '<style>',
      '<defs>',
      'class="petal-poly"',
      'class="petal-bars"',
      'class="petal-outlines"',
      'class="petal-labels"',
      'class="petal-centre"',
    ].map(at);
    expect(order.every((x) => x > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('every bar segment carries class, data-p, data-i, data-seg and a spec-derived id', () => {
    const segs = [
      ...r.svg.matchAll(
        /<path id="s-(\d+)-(\w+)" class="petal-seg[^"]*"(?: fill="[^"]+")? data-p="([^"]+)" data-i="(\d+)" data-seg="(\w+)" d="[^"]+"\/>/g,
      ),
    ];
    expect(segs.length).toBe((r.svg.match(/petal-seg/g) ?? []).length);
    for (const m of segs) {
      expect(m[1]).toBe(m[4]);
      expect(m[2]).toBe(m[5]);
    }
    expect(new Set(segs.map((m) => m[3])).size).toBe(61);
    expect(segs.map((m) => m[5])).toEqual(
      expect.arrayContaining(['other', 'large', 'liquid', 'lockup', 'tail']),
    );
  });

  test('the tail: data-p="__tail", the hatch pattern, labelled with its count and share', () => {
    expect(r.svg).toMatch(
      /fill="url\(#petal-hatch-[0-9a-f]{8}\)" data-p="__tail" data-i="60" data-seg="tail"/,
    );
    expect(r.svg).toContain('>everyone else (311) 13.8%</text>');
  });

  test('straight edges only: paths use M, L and Z, nothing that curves', () => {
    for (const [, d] of r.svg.matchAll(/ d="([^"]+)"/g)) expect(d).toMatch(/^M[-0-9. L]+Z$/);
  });

  test('coordinates are written with two decimals', () => {
    const numbers = [...r.svg.matchAll(/ (?:d|x|y)="([^"]+)"/g)].flatMap(
      ([, v]) => (v ?? '').match(/-?\d+(\.\d+)?/g) ?? [],
    );
    expect(numbers.length).toBeGreaterThan(1000);
    for (const n of numbers) expect(n).toMatch(/^-?\d+\.\d\d$/);
    expect(r.svg).not.toContain('-0.00');
  });

  test('colours are CSS custom properties with a .petal-dark override; no script', () => {
    expect(r.svg).toContain('svg[data-petal]{--ink:');
    expect(r.svg).toContain('.petal-dark svg[data-petal],svg[data-petal].petal-dark{');
    expect(r.svg).not.toMatch(/#[0-9a-f]{6}"/i); // no colour literal in an attribute
    expect(r.svg).not.toContain('<script');
  });

  test('legend: every primitive used, an order line, the tail, with meanings and sources from the spec', () => {
    expect(r.legend.map((l) => l.primitive)).toEqual([
      'width',
      'height',
      'colour',
      'outline',
      'segments',
      'order',
      'tail',
    ]);
    for (const l of r.legend.filter((x) => x.primitive !== 'tail')) {
      const e = spec.encodings[l.primitive as 'width'];
      expect(l.meaning).toBe(e.meaning);
      expect(l.sources).toEqual(e.sources);
    }
    expect(r.legend.find((l) => l.primitive === 'segments')?.keys?.map((k) => k.label)).toEqual([
      'other delegators',
      'accounts with 1M+ NEAR',
      'liquid-staking contracts',
      'lockups (vesting)',
    ]);
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
  test('two participants: two petals, no tail, the wide side split so the polygon stays closed', () => {
    const s = twoParticipants();
    const r = renderFlower(specFor(s), s);
    expect(r.petals.map((p) => p.id)).toEqual(['astro-stakers.poolv1.near', 'figment.poolv1.near']);
    expect(r.svg).not.toContain('__tail');
    const rows = selectPetals(s, specFor(s).selection);
    const g = layout(rows, widthFactors(rows, specFor(s).encodings.width), [1, 1], {
      size: 800,
      thumb: false,
    });
    expect(g.petals.map((p) => p.sides.length)).toEqual([10, 1]); // 4.19 rad split into 0.45-rad sides
    const poly = r.svg.match(/class="petal-poly" d="M([^"]+)Z"/)?.[1]?.split('L') ?? [];
    expect(poly).toHaveLength(11);
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
      for (const [, d] of r.svg.matchAll(/ d="([^"]+)"/g)) expect(d).toMatch(/^M[-0-9. L]+Z$/);
    }
  });

  test('outline: solid for self-declared, dashed (3 2) for inferred, none for unknown', () => {
    const s = population(30);
    const r = renderFlower(specFor(s, {}, 'm'), s);
    expect(r.svg).toContain('.petal-outline.inferred{stroke-dasharray:3 2}');
    const outlines = [
      ...r.svg.matchAll(/<path class="petal-outline( inferred)?" data-p="(p\d+)"/g),
    ];
    const expected = s.participants
      .filter((p) => p.identity)
      .map((p) => [p.id, p.identity?.status === 'inferred']);
    expect(outlines.map((m) => [m[2], Boolean(m[1])])).toEqual(expected);
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
