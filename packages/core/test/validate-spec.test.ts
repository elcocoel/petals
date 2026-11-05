// T029: validateSpec, one test per rule of data-model.md (Petal spec rules 1-8), plus the
// interpretation rules (every mapping cited, unknowns not empty).
import { describe, expect, test } from 'vitest';
import { buildSpec } from '../src/convention/index.ts';
import { snapshotSha256 } from '../src/tables.ts';
import type { Interpretation, Spec } from '../src/types/index.ts';
import { validateSpec } from '../src/validate/index.ts';
import { descriptorFor } from './descriptors.ts';
import { tinyBackers, twoParticipants, validators } from './load.ts';
import { sampleInterpretation } from './samples.ts';

const s = tinyBackers();
const d = descriptorFor(s);
const ctx = { snapshot: s, capabilities: d.capabilities };
const base = (): Spec =>
  structuredClone(
    buildSpec({ network: d.id, sha256: snapshotSha256(s), choices: { segments: 'backers' } }, d, s)
      .spec,
  );
const rulesOf = (spec: unknown, c: Parameters<typeof validateSpec>[1] = ctx) => {
  const v = validateSpec(spec, c);
  return {
    valid: v.valid,
    rules: v.errors.map((e) => e.rule),
    errors: v.errors,
    warnings: v.warnings,
  };
};

describe('validateSpec', () => {
  test('an interpretation error says what was expected: all of them, with path and allowed values', () => {
    const v = validateSpec(base(), {
      ...ctx,
      interpretation: {
        ...sampleInterpretation,
        conflicts: 'not a list',
        extra: 1,
        documents: [{ id: 'x', kind: 'blog' }],
      } as unknown as Interpretation,
    });
    const said = v.errors.map((e) => `${e.path}: ${e.message}`);
    expect(said).toEqual(
      expect.arrayContaining([
        '/interpretation/conflicts: must be array',
        '/interpretation: must NOT have additional properties: extra',
        "/interpretation/documents/0: must have required property 'url'",
        "/interpretation/documents/0: must have required property 'fetched_at'",
        '/interpretation/documents/0/kind: must be equal to one of the allowed values: docs, forum, constitution, chain, news, other',
      ]),
    );
    expect(v.errors.every((e) => e.rule === 'interpretation')).toBe(true);
  });

  test('a built spec is valid, with no warnings', () => {
    expect(validateSpec(base(), ctx)).toEqual({ valid: true, errors: [], warnings: [] });
  });

  test('rule 1, schema: the JSON matches the schema', () => {
    const spec = base() as unknown as Record<string, unknown>;
    delete spec.labels;
    const r = rulesOf(spec);
    expect(r.valid).toBe(false);
    expect(r.rules).toEqual(['schema']);
    expect(rulesOf('not a spec').rules).toEqual(['schema']);
  });

  test('rule 2, snapshot: the snapshot given must be the one the spec names', () => {
    const spec = base();
    spec.snapshot.sha256 = 'f'.repeat(64);
    expect(rulesOf(spec).errors).toEqual([
      { path: '/snapshot/sha256', rule: 'snapshot', message: expect.any(String) },
    ]);
    const other = rulesOf(base(), { snapshot: twoParticipants(), capabilities: d.capabilities });
    expect(other.errors.filter((e) => e.rule === 'snapshot').map((e) => e.path)).toEqual([
      '/snapshot/sha256',
      '/network/id',
    ]);
  });

  test('rule 3, capabilities: the measure is in the holdings and each by is allowed', () => {
    const spec = base();
    spec.selection.measure = 'nope';
    expect(rulesOf(spec).rules).toContain('capabilities');
    const narrow = { ...d.capabilities, by: { ...d.capabilities.by, colour: ['kind'] } };
    const spec2 = base();
    spec2.encodings.colour.by = 'identity';
    expect(rulesOf(spec2, { snapshot: s, capabilities: narrow }).errors).toEqual([
      {
        path: '/encodings/colour/by',
        rule: 'capabilities',
        message: expect.stringContaining('identity'),
      },
    ]);
    const spec3 = base();
    spec3.encodings.height = { ...spec3.encodings.height, by: 'share', scale: 'log' };
    expect(rulesOf(spec3).rules).toEqual(['capabilities']);
  });

  test('rule 4, sources: every primitive, order included, cites a known source', () => {
    const spec = base();
    spec.encodings.order.sources = ['made-up'];
    expect(rulesOf(spec).errors).toEqual([
      { path: '/encodings/order/sources', rule: 'sources', message: expect.any(String) },
    ]);
    const spec2 = base() as unknown as { encodings: { width: Record<string, unknown> } };
    delete spec2.encodings.width.meaning;
    expect(rulesOf(spec2).rules).toContain('sources');
    const spec3 = base();
    spec3.encodings.colour.sources = [spec3.encodings.colour.sources[0], 'made-up'];
    const r3 = rulesOf(spec3);
    expect(r3.valid).toBe(true);
    expect(r3.warnings.map((w) => w.rule)).toEqual(['sources']);
  });

  test('rule 4: a document source from the interpretation counts as known', () => {
    const spec = base();
    spec.encodings.order.sources = ['doc-1'];
    const interpretation: Interpretation = {
      ...sampleInterpretation,
      mappings: [{ primitive: 'order', why: 'largest first', sources: ['doc-1'] }],
      power_means: [{ claim: 'stake', sources: ['doc-1'] }],
      documents: [
        {
          id: 'doc-1',
          kind: 'docs',
          url: 'https://docs.near.org',
          fetched_at: '2026-11-04T00:00:00Z',
        },
      ],
    };
    expect(rulesOf(spec, { ...ctx, interpretation }).valid).toBe(true);
  });

  test('rule 5, width_band: max_ratio is at most 3', () => {
    const spec = base();
    spec.encodings.width.max_ratio = 4;
    expect(rulesOf(spec).errors).toEqual([
      { path: '/encodings/width/max_ratio', rule: 'width_band', message: expect.any(String) },
    ]);
    const spec2 = base();
    delete spec2.encodings.width.max_ratio;
    expect(rulesOf(spec2).warnings.map((w) => w.rule)).toEqual(['width_band']);
  });

  test('rule 6, tail: fewer petals than participants needs a grouped, declared tail', () => {
    const v = validators(); // 371 holders, 60 petals
    const dv = descriptorFor(v, { measure: 'validator_stake_current_epoch' });
    const cv = { snapshot: v, capabilities: dv.capabilities };
    const spec = buildSpec({ network: dv.id, sha256: snapshotSha256(v) }, dv, v).spec;
    expect(rulesOf(spec, cv).valid).toBe(true);
    spec.selection.tail.group = false;
    expect(rulesOf(spec, cv).errors).toEqual([
      { path: '/selection/tail/group', rule: 'tail', message: expect.stringContaining('311') },
    ]);
    spec.selection.tail = { group: true, label: ' ' };
    expect(rulesOf(spec, cv).rules).toEqual(['tail']);
    // petals is a cap: 5 holders and 5 petals (or 2 holders and 60) leave nobody out
    const tiny = base();
    tiny.selection.petals = 5;
    tiny.selection.tail.group = false;
    expect(rulesOf(tiny).valid).toBe(true);
  });

  test('rule 7, canonical: the spec is plain JSON, so its hash names what is drawn', () => {
    const spec = base();
    (spec.encodings.width as { scale?: string }).scale = undefined;
    expect(rulesOf(spec).errors).toEqual([
      { path: '/encodings/width/scale', rule: 'canonical', message: expect.any(String) },
    ]);
    const spec2 = base();
    spec2.snapshot.block_height = -0;
    expect(rulesOf(spec2).rules).toContain('canonical');
  });

  test('rule 8, unavailable: no primitive this build marks unavailable', () => {
    const spec = base();
    spec.encodings.lines = {
      by: 'co_vote',
      meaning: 'voted together',
      sources: ['fastnear-rpc-validators'],
    };
    expect(rulesOf(spec).errors).toEqual([
      {
        path: '/encodings/lines',
        rule: 'unavailable',
        message: expect.stringContaining('never imitated'),
      },
    ]);
    const spec2 = base() as unknown as { encodings: Record<string, unknown> };
    spec2.encodings.texture = { by: 'grain', meaning: 'grain', sources: ['x'] };
    expect(rulesOf(spec2).errors).toEqual([
      { path: '/encodings', rule: 'unavailable', message: expect.stringContaining('texture') },
    ]);
    const spec3 = base();
    (spec3.encodings.segments as { by: string }).by = 'time';
    expect(rulesOf(spec3).rules).toEqual(['unavailable']);
    const spec4 = base();
    spec4.encodings.order.by = 'measure_asc';
    expect(rulesOf(spec4).rules).toEqual(['unavailable']);
  });

  describe('with an interpretation', () => {
    const full: Interpretation = {
      ...sampleInterpretation,
      power_means: [{ claim: 'stake', sources: ['fastnear-rpc-validators'] }],
      mappings: (['width', 'height', 'colour', 'outline', 'segments', 'order'] as const).map(
        (p) => ({
          primitive: p,
          why: 'because',
          sources: ['fastnear-rpc-validators'],
        }),
      ) as unknown as Interpretation['mappings'],
    };

    test('every mapping cited and one per primitive used: valid, no warnings', () => {
      expect(validateSpec(base(), { ...ctx, interpretation: full })).toEqual({
        valid: true,
        errors: [],
        warnings: [],
      });
    });

    test('a mapping citing nothing known is an error', () => {
      const it = structuredClone(full);
      (it.mappings[0] as { sources: string[] }).sources = ['made-up'];
      expect(rulesOf(base(), { ...ctx, interpretation: it }).errors).toEqual([
        {
          path: '/interpretation/mappings/0/sources',
          rule: 'interpretation',
          message: expect.any(String),
        },
      ]);
    });

    test('unknowns needs at least one entry', () => {
      const it = { ...structuredClone(full), unknowns: [] } as unknown as Interpretation;
      expect(rulesOf(base(), { ...ctx, interpretation: it }).rules).toEqual(['interpretation']);
    });

    test('a primitive used without a mapping is a warning', () => {
      const it = structuredClone(full);
      it.mappings = it.mappings.slice(0, 5) as Interpretation['mappings'];
      const r = rulesOf(base(), { ...ctx, interpretation: it });
      expect(r.valid).toBe(true);
      expect(r.warnings).toEqual([
        {
          path: '/interpretation/mappings',
          rule: 'interpretation',
          message: 'no mapping explains order',
        },
      ]);
    });
  });
});
