// T181: the recipe. buildSpec compiles a recipe and a target into a spec; recipeOf reads it back, so
// a flower's recipe can be kept, hashed and used again on another network or date.
import { describe, expect, test } from 'vitest';
import { diffSpecs } from '../src/convention/diff.ts';
import { buildSpec } from '../src/convention/index.ts';
import { choicesFromSpec, recipeHash, recipeOf } from '../src/convention/recipe.ts';
import { choiceOf, shape } from '../src/convention/shape.ts';
import { specHash } from '../src/hash.ts';
import { snapshotSha256 } from '../src/tables.ts';
import type {
  NetworkDescriptor,
  ProposeInput,
  Snapshot,
  Spec,
  SpecPrimitive,
} from '../src/types/index.ts';
import { descriptorFor } from './descriptors.ts';
import { GOLDEN_CASES, goldenSpec } from './golden-cases.ts';
import { houseOfStake, tinyBackers, twoParticipants, validators } from './load.ts';

const MEASURE = 'validator_stake_current_epoch';
const onValidators = () => {
  const s = validators();
  return { s, d: descriptorFor(s, { measure: MEASURE }) };
};
const onHouse = () => {
  const s = houseOfStake();
  return { s, d: descriptorFor(s, { measure: 'voting_power' }) };
};
const build = (t: { s: Snapshot; d: NetworkDescriptor }, input: Partial<ProposeInput> = {}) =>
  buildSpec({ network: t.d.id, sha256: snapshotSha256(t.s), ...input }, t.d, t.s).spec;

describe('shape and choiceOf are inverses', () => {
  const cases: [SpecPrimitive, string[]][] = [
    ['width', ['r1.5', 'r2', 'r3', 'equal']],
    ['height', ['sqrt', 'linear', 'log', 'equal', 'm:votes']],
    ['colour', ['kind', 'identity', 'single']],
    ['outline', ['identity_status', 'none']],
    ['segments', ['none', 'backers']],
    ['order', ['measure_desc']],
  ];
  test.each(cases)('%s', (field, choices) => {
    for (const c of choices) expect(choiceOf(field, shape(field, c))).toBe(c);
  });
});

describe('recipeOf', () => {
  test.each(GOLDEN_CASES.map((c) => [c.name, c] as const))('round trip: %s', (_name, c) => {
    const spec = goldenSpec(c);
    const s = c.snapshot();
    const d = descriptorFor(s, { measure: c.measure });
    const t = { s, d };
    expect(specHash(build(t, recipeOf(spec, d)))).toBe(specHash(spec));
    expect(specHash(build(t, { choices: choicesFromSpec(spec) }))).toBe(specHash(spec));
    expect(recipeOf(spec, d)).toEqual(recipeOf(structuredClone(spec), d));
  });

  test('it says only what differs from the defaults, with no target and no date', () => {
    const t = onValidators();
    expect(recipeOf(build(t), t.d)).toEqual({ petal: 'recipe/v1', choices: {} });
    const spec = build(t, { choices: { petals: 10, width: 'equal', segments: 'backers' } });
    const recipe = recipeOf(spec, t.d);
    expect(recipe).toEqual({
      petal: 'recipe/v1',
      choices: { petals: 10, width: 'equal', segments: 'backers' },
    });
    const text = JSON.stringify(recipe);
    for (const target of [spec.network.id, spec.snapshot.sha256, spec.snapshot.as_of, MEASURE])
      expect(text).not.toContain(target);
  });

  test('the same recipe on two networks has the same hash', () => {
    const choices = { petals: 10, width: 'equal' } as const;
    const a = onValidators();
    const b = onHouse();
    const onA = recipeOf(build(a, { choices }), a.d);
    const onB = recipeOf(build(b, { choices }), b.d);
    expect(onA).toEqual(onB);
    expect(recipeHash(onA)).toBe(recipeHash(onB));
    expect(recipeHash(onA)).toMatch(/^[0-9a-f]{64}$/);
    expect(recipeHash(recipeOf(build(a, { choices: { petals: 11 } }), a.d))).not.toBe(
      recipeHash(onA),
    );
  });

  test('a default depends on the population: what differs from this one stays', () => {
    const s = tinyBackers();
    const d = descriptorFor(s, {
      measure: MEASURE,
      capabilities: { defaults: { measure: MEASURE, colour: 'identity' } },
    });
    const t = { s, d };
    const asKind = build(t, { choices: { colour: 'kind' } });
    expect(recipeOf(asKind, d).choices).toEqual({ colour: 'kind' });
    expect(specHash(build(t, recipeOf(asKind, d)))).toBe(specHash(asKind));
    expect(recipeOf(build(t), d).choices).toEqual({});
  });

  test('an override of a meaning is in the recipe; the standard words are not', () => {
    const t = onValidators();
    const words = 'how much of the vote each one could swing';
    const spec = build(t, { meanings: { height: words } });
    const recipe = recipeOf(spec, t.d);
    expect(recipe.meanings).toEqual({ height: words });
    expect(specHash(build(t, recipe))).toBe(specHash(spec));
    expect(recipeOf(build(t), t.d)).not.toHaveProperty('meanings');
  });

  test('a measure other than the default stays, so it travels and can be refused', () => {
    const t = onValidators();
    const spec = build(t, { choices: { measure: 'pool_contract_stake' } });
    expect(recipeOf(spec, t.d).choices).toEqual({ measure: 'pool_contract_stake' });
  });
});

describe('a recipe on another target', () => {
  test('choices that apply there: it draws', () => {
    const a = onValidators();
    const b = onHouse();
    const recipe = recipeOf(build(a, { choices: { petals: 10, width: 'equal' } }), a.d);
    const spec = build(b, recipe);
    expect(spec.network.id).toBe('near-house-of-stake');
    expect(spec.selection).toMatchObject({ measure: 'voting_power', petals: 10 });
    expect(spec.encodings.width.by).toBe('equal');
    expect(spec.encodings.height.meaning).toContain('voting power');
  });

  test('choices that do not: refused with what is allowed', () => {
    const a = onValidators();
    const b = onHouse();
    const refused = (input: Partial<ProposeInput>) => {
      try {
        build(b, input);
      } catch (e) {
        return e as { code: string; allowed?: string[]; message: string };
      }
      throw new Error('not refused');
    };
    const measure = recipeOf(build(a, { choices: { measure: 'pool_contract_stake' } }), a.d);
    expect(refused(measure).code).toBe('bad_input');
    expect(refused(measure).allowed).toEqual(expect.arrayContaining(['voting_power']));
    const metric = recipeOf(
      build(a, { choices: { height: 'm:num_produced_blocks_current_epoch' } }),
      a.d,
    );
    expect(refused(metric).allowed).toEqual(expect.arrayContaining(['m:voting_power']));
    // backers need delegations: these two pools hold stake only
    const backers = recipeOf(build(a, { choices: { segments: 'backers' } }), a.d);
    const two = { s: twoParticipants(), d: descriptorFor(twoParticipants(), { measure: MEASURE }) };
    expect(() => build(two, backers)).toThrow(/segments/);
  });
});

describe('a variation builds on its parent', () => {
  const t = onValidators();
  const parent = build(t, { choices: { petals: 10, colour: 'identity' } });

  test('only what changes changes', () => {
    const spec = build(t, { parent, choices: { width: 'equal' } });
    expect(spec.selection.petals).toBe(10);
    expect(spec.encodings.colour.by).toBe('identity');
    expect(spec.encodings.width.by).toBe('equal');
    expect(spec.convention.variation_of).toBe(specHash(parent));
    expect(recipeOf(spec, t.d).choices).toEqual({ petals: 10, colour: 'identity', width: 'equal' });
  });

  test('it can go back to a default by saying so, and rebuilds from all its choices', () => {
    const spec = build(t, { parent, choices: { petals: 60 } });
    expect(spec.selection.petals).toBe(60);
    const again = build(t, { parent, choices: choicesFromSpec(spec) });
    expect(specHash(again)).toBe(specHash(spec));
  });

  test('a parent named by its hash alone is refused: its choices would be lost', () => {
    expect(() => build(t, { variation_of: specHash(parent), choices: { width: 'equal' } })).toThrow(
      /parent/,
    );
    expect(() =>
      build(t, { parent, variation_of: 'f'.repeat(64), choices: { width: 'equal' } }),
    ).toThrow(/not the hash of parent/);
    const house = onHouse();
    expect(() => build(house, { parent })).toThrow(/flower of near-validators/);
  });

  test('a changed meaning stays with its choice, and goes when the choice changes', () => {
    const words = 'how much of the vote each one could swing';
    const worded = build(t, { parent, meanings: { height: words } });
    expect(build(t, { parent: worded, choices: { width: 'r3' } }).encodings.height.meaning).toBe(
      words,
    );
    expect(
      build(t, { parent: worded, choices: { height: 'log' } }).encodings.height.meaning,
    ).not.toBe(words);
  });
});

describe('diffSpecs', () => {
  const t = onValidators();
  const base = build(t, { choices: { petals: 10 } });
  const newer = (spec: Spec): Spec => ({
    ...spec,
    snapshot: { ...spec.snapshot, sha256: 'f'.repeat(64), as_of: '2027-01-01T00:00:00Z' },
  });

  test('the same flower', () => {
    expect(diffSpecs(base, structuredClone(base))).toEqual({
      same_recipe: true,
      subject: [],
      data: [],
      design: [],
      says: 'the same flower',
    });
  });

  test('same recipe, newer data; and older the other way', () => {
    const d = diffSpecs(base, newer(base));
    expect(d).toMatchObject({ same_recipe: true, subject: [], design: [] });
    expect(d.data.map((c) => c.what)).toEqual(['snapshot']);
    expect(d.says).toBe('same recipe, newer data');
    expect(diffSpecs(newer(base), base).says).toBe('same recipe, older data');
  });

  test('a choice is read as a choice, with the meaning it has now', () => {
    const d = diffSpecs(base, build(t, { parent: base, choices: { width: 'equal' } }));
    expect(d.design).toEqual([
      { what: 'width', from: 'r2', to: 'equal', says: 'every side the same length' },
    ]);
    expect(d.says).toBe('width: r2 to equal');
    expect(d.same_recipe).toBe(false);
  });

  test('a measure change is told once, though it rewrites meanings and sources', () => {
    const other = build(t, { parent: base, choices: { measure: 'pool_contract_stake' } });
    expect(other.encodings.height.meaning).not.toBe(base.encodings.height.meaning);
    const d = diffSpecs(base, other);
    expect(d.design.map((c) => c.what)).toEqual(['measure']);
  });

  test('convention.changes is ignored; another network is another subject', () => {
    const moved = structuredClone(base);
    moved.convention = { id: 'default/v1', variation_of: 'a'.repeat(64), changes: ['petals=10'] };
    expect(diffSpecs(base, moved).says).toBe('the same flower');
    const h = onHouse();
    const d = diffSpecs(base, build(h, { choices: { petals: 10 } }));
    expect(d.subject).toEqual([
      expect.objectContaining({
        what: 'network',
        from: 'near-validators',
        to: 'near-house-of-stake',
      }),
    ]);
    expect(d.design.map((c) => c.what)).toEqual(['measure']);
    const token = structuredClone(base);
    token.network.population = 'another-token';
    expect(diffSpecs(base, token).subject[0]).toMatchObject({
      from: base.network.population,
      to: 'another-token',
    });
  });
});
