// T028: PRIMITIVES (FR-032), DEFAULT_CONVENTION (default/v1) and buildSpec (propose_spec's core).
// Same choices give the same spec_sha256; every primitive gets a meaning and source ids.
import { describe, expect, test } from 'vitest';
import { buildSpec, DEFAULT_CONVENTION } from '../src/convention/index.ts';
import { specHash } from '../src/hash.ts';
import { drawable, PRIMITIVES } from '../src/primitives.ts';
import { snapshotSha256 } from '../src/tables.ts';
import type { NetworkDescriptor, ProposeInput, Snapshot } from '../src/types/index.ts';
import { validateSpec } from '../src/validate/index.ts';
import { descriptorFor } from './descriptors.ts';
import { houseOfStake, twoParticipants, validators } from './load.ts';

const MEASURE = 'validator_stake_current_epoch';
const propose = (
  s: Snapshot,
  choices: ProposeInput['choices'] = {},
  extra: Partial<ProposeInput> = {},
  d: NetworkDescriptor = descriptorFor(s, { measure: MEASURE }),
) => buildSpec({ network: d.id, sha256: snapshotSha256(s), choices, ...extra }, d, s);

describe('PRIMITIVES', () => {
  const status = Object.fromEntries(PRIMITIVES.map((p) => [p.id, p.status]));
  test('available now: width, height, colour, outline, segments, order', () => {
    for (const id of ['width', 'height', 'colour', 'outline', 'segments', 'order'])
      expect(status[id], id).toBe('available');
  });
  test('lines and markings unavailable until they land; texture, extrusion, opacity declared only', () => {
    for (const id of ['lines', 'markings', 'texture', 'extrusion', 'opacity'])
      expect(status[id], id).toBe('unavailable');
  });
  test('segments draws backers only; order draws measure_desc only', () => {
    expect(drawable('segments', 'backers')).toBe(true);
    expect(drawable('segments', 'time')).toBe(false);
    expect(drawable('order', 'measure_desc')).toBe(true);
    expect(drawable('order', 'measure_asc')).toBe(false);
    expect(drawable('height', 'm:num_produced_blocks_current_epoch')).toBe(true);
    expect(drawable('lines', 'co_vote')).toBe(false);
  });
});

describe('DEFAULT_CONVENTION', () => {
  test('default/v1: 2x share band, sqrt share, kind, identity status, no segments, measure_desc, 60 + tail', () => {
    const e = DEFAULT_CONVENTION.encodings;
    expect(DEFAULT_CONVENTION.id).toBe('default/v1');
    expect(DEFAULT_CONVENTION.petals).toBe(60);
    expect(DEFAULT_CONVENTION.tail).toEqual({ group: true, label: 'everyone else' });
    expect([e.width.by, e.width.max_ratio, e.height.by, e.height.scale, e.colour.by]).toEqual([
      'share',
      2,
      'share',
      'sqrt',
      'kind',
    ]);
    expect(e.outline?.by).toBe('identity_status');
    expect([e.segments, e.lines, e.markings]).toEqual([null, null, null]);
    expect(e.order).toEqual({
      by: 'measure_desc',
      meaning: 'largest first, clockwise from the top',
    });
  });
});

describe('buildSpec', () => {
  test('no choices: the default spec, valid, with every default named', () => {
    const s = validators();
    const { spec, changed, defaults } = propose(s);
    expect(changed).toEqual([]);
    expect(defaults).toEqual([
      'measure',
      'petals',
      'width',
      'height',
      'colour',
      'outline',
      'segments',
      'lines',
      'markings',
      'order',
    ]);
    expect(spec).toMatchObject({
      petal: 'spec/v1',
      network: { id: 'near-validators', chain: 'near:mainnet', population: 'validators' },
      snapshot: {
        sha256: snapshotSha256(s),
        as_of: '2026-11-03T19:42:00Z',
        block_height: 222915356,
      },
      labels: 'none',
      selection: { measure: MEASURE, petals: 60, tail: { group: true, label: 'everyone else' } },
      convention: { id: 'default/v1', variation_of: null, changes: [] },
    });
    expect(spec.encodings.width).toEqual({
      by: 'share',
      scale: 'log',
      max_ratio: 2,
      meaning: 'share of stake in the current epoch, in a 2x band',
      sources: ['fastnear-rpc-validators'],
    });
    expect(spec.encodings.order).toEqual({
      by: 'measure_desc',
      meaning: 'largest first, clockwise from the top',
      sources: ['fastnear-rpc-validators'],
    });
    expect(spec.encodings.segments).toBeNull();
    expect('lines' in spec.encodings).toBe(false); // unavailable primitives never appear
    const d = descriptorFor(s, { measure: MEASURE });
    expect(validateSpec(spec, { snapshot: s, capabilities: d.capabilities })).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });
  });

  test('the same choices give the same spec_sha256, whatever the key order', () => {
    const s = validators();
    const a = propose(s, { segments: 'backers', width: 'r3', petals: 40 });
    const b = propose(s, { petals: 40, width: 'r3', segments: 'backers' });
    expect(specHash(b.spec)).toBe(specHash(a.spec));
    expect(specHash(propose(s).spec)).not.toBe(specHash(a.spec));
    expect(a.changed).toEqual(['petals', 'width', 'segments']);
  });

  test('a choice equal to the default is neither changed nor defaulted', () => {
    const { changed, defaults } = propose(validators(), { width: 'r2' });
    expect(changed).toEqual([]);
    expect(defaults).not.toContain('width');
  });

  test('segments backers: standard meaning, sources from the delegations', () => {
    const { spec } = propose(validators(), { segments: 'backers' });
    expect(spec.encodings.segments).toEqual({
      by: 'backers',
      meaning:
        'who backs the pool, bottom to top: other delegators, accounts with 1M+ NEAR, liquid-staking contracts, lockups',
      sources: ['fastnear-rpc-staking-pool-views'],
    });
  });

  test('every choice maps to its encoding', () => {
    const s = validators();
    const e = (c: ProposeInput['choices']) => propose(s, c).spec.encodings;
    expect(e({ width: 'equal' }).width).toMatchObject({ by: 'equal', scale: 'equal' });
    expect(e({ width: 'r1.5' }).width).toMatchObject({ by: 'share', max_ratio: 1.5 });
    expect(e({ height: 'linear' }).height).toMatchObject({ by: 'share', scale: 'linear' });
    expect(e({ height: 'log' }).height).toMatchObject({ by: 'amount', scale: 'log' });
    expect(e({ height: 'equal' }).height).toMatchObject({ by: 'equal' });
    expect(e({ height: 'm:num_produced_blocks_current_epoch' }).height).toMatchObject({
      by: 'm:num_produced_blocks_current_epoch',
      meaning: 'num_produced_blocks_current_epoch, relative to the largest petal',
    });
    expect(e({ colour: 'identity' }).colour).toMatchObject({ by: 'identity' });
    expect(e({ outline: 'none' }).outline).toBeNull();
  });

  test('the descriptor meanings win over the standard ones; input.meanings win over both', () => {
    const s = validators();
    const d = descriptorFor(s, {
      measure: MEASURE,
      capabilities: {
        meanings: {
          'colour:kind': {
            meaning: 'pool or liquid-staking contract',
            sources: ['nearblocks-validators'],
          },
        },
      },
    });
    const a = propose(s, {}, {}, d).spec.encodings.colour;
    expect(a).toEqual({
      by: 'kind',
      meaning: 'pool or liquid-staking contract',
      sources: ['nearblocks-validators'],
    });
    const b = propose(s, {}, { meanings: { colour: 'who runs it' } }, d);
    expect(b.spec.encodings.colour.meaning).toBe('who runs it');
    expect(b.changed).toEqual(['colour']);
  });

  test('population defaults apply on top of default/v1', () => {
    const s = validators();
    const base = descriptorFor(s, { measure: MEASURE });
    const d = {
      ...base,
      capabilities: {
        ...base.capabilities,
        defaults: { ...base.capabilities.defaults, segments: 'backers' },
      },
    };
    const { spec, changed, defaults } = propose(s, {}, {}, d);
    expect(spec.encodings.segments?.by).toBe('backers');
    expect(changed).toEqual([]);
    expect(defaults).toContain('segments');
  });

  test('a variation records variation_of and its changes', () => {
    const s = validators();
    const parent = specHash(propose(s).spec);
    const { spec } = propose(s, { segments: 'backers' }, { variation_of: parent });
    expect(spec.convention).toEqual({
      id: 'default/v1',
      variation_of: parent,
      changes: ['segments=backers'],
    });
  });

  test('params are carried; House of Stake gets its own measure and sources', () => {
    const h = houseOfStake();
    const d = descriptorFor(h, { measure: 'voting_power' });
    const { spec } = buildSpec(
      { network: d.id, sha256: snapshotSha256(h), params: { dao: 'vote.dao' } },
      d,
      h,
    );
    expect(spec.network.params).toEqual({ dao: 'vote.dao' });
    expect(spec.selection.measure).toBe('voting_power');
    expect(spec.encodings.width.meaning).toBe('share of voting power (veNEAR), in a 2x band');
    expect(spec.encodings.width.sources).toEqual(['fastnear-venear-accounts']);
  });

  describe('bad input (FR-032: refused, never imitated)', () => {
    const s = twoParticipants();
    const d = descriptorFor(s);
    const bad = (choices: Record<string, unknown>) =>
      expect(() => propose(s, choices as ProposeInput['choices'], {}, d)).toThrow(
        expect.objectContaining({ code: 'bad_input' }),
      );
    test.each([
      [{ texture: 'grain' }],
      [{ opacity: 0.5 }],
      [{ lines: 'co_vote' }],
      [{ markings: 'fusion' }],
      [{ segments: 'time' }],
      [{ segments: 'backers' }], // two-participants has no delegations
      [{ order: 'measure_asc' }],
      [{ width: 'r4' }],
      [{ height: 'm:nope' }],
      [{ colour: 'rainbow' }],
      [{ measure: 'nope' }],
      [{ petals: 4 }],
      [{ petals: 301 }],
      [{ petals: 12.5 }],
      [{ frobnicate: true }],
    ])('%j', (choices) => bad(choices));

    test('texture is named as not available yet', () => {
      expect(() => propose(s, { texture: 'x' } as never, {}, d)).toThrow(/not available yet/);
    });
    test('segments backers on a population without them lists what is allowed', () => {
      expect(() => propose(s, { segments: 'backers' }, {}, d)).toThrow(
        expect.objectContaining({ allowed: ['none'] }),
      );
    });
    test('the network must match the descriptor and the snapshot', () => {
      expect(() => buildSpec({ network: 'other', sha256: snapshotSha256(s) }, d, s)).toThrow(
        expect.objectContaining({ code: 'bad_input' }),
      );
      expect(() =>
        buildSpec(
          { network: 'near-validators', sha256: 'a'.repeat(64) },
          descriptorFor(validators()),
          s,
        ),
      ).toThrow(expect.objectContaining({ code: 'bad_input' }));
    });
  });
});
