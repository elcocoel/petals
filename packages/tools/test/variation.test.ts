// T181: a variation builds on its parent, and a flower's recipe can be used again. On the real tool
// with the real module descriptors. The first test was written before the fix, and failed with
// petals back at 60.

import type { Spec, SpecDiff } from '@petal/core/types';
import { modules } from '@petal/inputs';
import { describe, expect, test } from 'vitest';
import { callTool } from '../src/registry.ts';
import type { ToolContext } from '../src/types.ts';
import { rig, validatorsFixture } from './helpers.ts';

type Out = Record<string, unknown> & {
  error?: { code: string; message: string; hint?: string };
  spec?: Spec;
  spec_sha256?: string;
  recipe?: { petal: string; choices: Record<string, unknown> };
  recipe_sha256?: string;
  diff?: SpecDiff;
};
const runner = (ctx: ToolContext) => async (name: string, input: unknown) =>
  (await callTool(name, input, ctx)) as Out;

const MOLOCH = 'c46437a2afb76cc7c3b07195da499a80a93bd3f09f2ce342436a366c68009a9c';
const BEANSTALK_A = '1d063af105432e239b0cb4817911217c85aeae07e94d3cf59faa0badd90b8e20';
const BEANSTALK_B = 'bddcf0ddf8ad1d31bb5e39892aa175de0df8f4793c689fa9773f07f33f1a2441';
const MOLOCH_PARAMS = { dao: '0x1fd169a4f5c59acf79d0fd5d91d1201ef1bce9f1', chain: 'ethereum' };

async function setup() {
  const r = await rig();
  return runner({
    ...r.ctx,
    modules: {
      ...r.ctx.modules,
      'moloch-v1': modules['moloch-v1'] as NonNullable<(typeof modules)[string]>,
      beanstalk: modules.beanstalk as NonNullable<(typeof modules)[string]>,
    },
  });
}

describe('a variation builds on its parent', () => {
  const near = () => ({ network: 'near-validators', sha256: validatorsFixture().sha256 });

  test('petals 10, then change only the width: it stays ten petals, or says why it cannot', async () => {
    const run = await setup();
    const first = await run('propose_spec', { ...near(), choices: { petals: 10 } });
    expect(first.spec?.selection.petals).toBe(10);
    const second = await run('propose_spec', {
      ...near(),
      variation_of: first.spec_sha256,
      choices: { width: 'equal' },
    });
    // Silently falling back to the default of 60 is the bug.
    expect(second.spec?.selection.petals).not.toBe(60);
    expect(second.error?.code).toBe('bad_input');
    expect(second.error?.hint).toMatch(/parent/);
  });

  test('with the parent: ten petals, the new width, the lineage and the diff', async () => {
    const run = await setup();
    const first = await run('propose_spec', { ...near(), choices: { petals: 10 } });
    const second = await run('propose_spec', {
      ...near(),
      parent: first.spec,
      choices: { width: 'equal' },
    });
    expect(second.error).toBeUndefined();
    expect(second.spec?.selection.petals).toBe(10);
    expect(second.spec?.encodings.width.by).toBe('equal');
    expect(second.spec?.convention.variation_of).toBe(first.spec_sha256);
    expect(second.recipe).toEqual({
      petal: 'recipe/v1',
      choices: { petals: 10, width: 'equal' },
    });
    expect(second.diff).toMatchObject({
      same_recipe: false,
      subject: [],
      data: [],
      design: [{ what: 'width', from: 'r2', to: 'equal' }],
      says: 'width: r2 to equal',
    });
    expect(first).not.toHaveProperty('diff');
  });

  test('a parent that is not a spec, or is not the hash it claims, is refused', async () => {
    const run = await setup();
    const first = await run('propose_spec', { ...near(), choices: { petals: 10 } });
    const notSpec = await run('propose_spec', { ...near(), parent: { petal: 'spec/v1' } });
    expect(notSpec.error?.code).toBe('bad_input');
    const mismatch = await run('propose_spec', {
      ...near(),
      parent: first.spec,
      variation_of: 'f'.repeat(64),
    });
    expect(mismatch.error?.code).toBe('bad_input');
  });

  test('a choice this network cannot draw is still refused on a variation', async () => {
    const run = await setup();
    const first = await run('propose_spec', near());
    const bad = await run('propose_spec', {
      ...near(),
      parent: first.spec,
      choices: { width: 'r9' },
    });
    expect(bad.error?.code).toBe('bad_input');
  });
});

describe('the recipe, on two stored networks', () => {
  const near = () => ({ network: 'near-validators', sha256: validatorsFixture().sha256 });
  const moloch = { network: 'moloch-v1', params: MOLOCH_PARAMS, sha256: MOLOCH };

  test('the same choices are one recipe, one hash; no network, snapshot or date in it', async () => {
    const run = await setup();
    const choices = { petals: 10, width: 'equal' };
    const a = await run('propose_spec', { ...near(), choices });
    const b = await run('propose_spec', { ...moloch, choices });
    expect(a.error).toBeUndefined();
    expect(b.error).toBeUndefined();
    expect(a.spec_sha256).not.toBe(b.spec_sha256);
    expect(a.recipe).toEqual(b.recipe);
    expect(a.recipe_sha256).toBe(b.recipe_sha256);
    expect(a.recipe_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(a.recipe)).not.toMatch(/near|moloch|2026|72a6d967/);
  });

  test("a recipe from one network draws on another, its words the other network's", async () => {
    const run = await setup();
    const a = await run('propose_spec', { ...near(), choices: { petals: 10 } });
    const b = await run('propose_spec', { ...moloch, choices: a.recipe?.choices });
    expect(b.spec?.selection).toMatchObject({ petals: 10, measure: 'shares' });
    expect(b.spec?.encodings.width.meaning).not.toBe(a.spec?.encodings.width.meaning);
  });

  test('what depends on the network is refused with what is allowed', async () => {
    const run = await setup();
    const a = await run('propose_spec', { ...near(), choices: { segments: 'backers' } });
    const b = await run('propose_spec', { ...moloch, choices: a.recipe?.choices });
    expect(b.error?.code).toBe('bad_input');
    expect(b.error?.message).toMatch(/segments/);
    const measure = await run('propose_spec', {
      ...moloch,
      choices: { measure: 'pool_contract_stake' },
    });
    expect(measure.error?.hint).toMatch(/shares/);
    const metric = await run('propose_spec', { ...moloch, choices: { height: 'm:nope' } });
    expect(metric.error?.hint).toMatch(/shares/);
  });

  test('same recipe, newer data: two stored Beanstalk snapshots', async () => {
    const run = await setup();
    const a = await run('propose_spec', {
      network: 'beanstalk',
      sha256: BEANSTALK_A,
      choices: { petals: 10 },
    });
    expect(a.error).toBeUndefined();
    const b = await run('propose_spec', {
      network: 'beanstalk',
      sha256: BEANSTALK_B,
      parent: a.spec,
    });
    expect(b.error).toBeUndefined();
    expect(b.spec?.selection.petals).toBe(10);
    expect(b.recipe_sha256).toBe(a.recipe_sha256);
    expect(b.diff?.same_recipe).toBe(true);
    expect(b.diff?.says).toBe('same recipe, newer data');
    expect(b.diff?.design).toEqual([]);
    expect(b.diff?.data.map((c) => c.what)).toEqual(['snapshot']);
  });
});
