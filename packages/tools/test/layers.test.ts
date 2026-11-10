// A flower from two layers (specs/005-mapping-brain, the RaidGuild test in miniature): one reading's
// measure as size, an agent's own layer as height. In process, on the test rig, with no network.
import { DEFAULT_VIEW } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { registry } from '../src/registry.ts';
import { rig, testFixture } from './helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: reading tool answers
type Out = Record<string, any>;
const tool = (name: string) => registry.find((t) => t.name === name) as (typeof registry)[number];

const layer = {
  petal: 'layer/v1',
  about: 'near:mainnet:validators-test',
  kind: 'measures',
  measures: [{ name: 'proposals_written', unit: 'proposals', kind: 'count' }],
  rows: [
    { participant: 'astro-stakers.poolv1.near', measure: 'proposals_written', value: '1' },
    { participant: 'figment.poolv1.near', measure: 'proposals_written', value: '9' },
  ],
  how: {
    method: 'counted submission events by who sent them',
    sources: [{ url: 'https://rpc.example' }],
  },
  from: [],
  when: { as_of: '2026-11-09T00:00:00Z' },
  standing: 'verified',
};

describe('a flower from two layers', () => {
  test("size from a reading, height from an agent's layer, each layer credited", async () => {
    const { ctx } = await rig();
    const base = testFixture('two-participants');
    const added = (await tool('add_layer').run({ layer }, ctx)) as Out;
    expect(added.hash).toMatch(/^[0-9a-f]{64}$/);
    expect((await tool('add_layer').run({ layer }, ctx)) as Out).toMatchObject({ existed: true });

    const view = (await tool('compose_view').run(
      { base: base.sha256, layers: [added.hash] },
      ctx,
    )) as Out;
    expect(view.measures.map((m: Out) => m.id)).toEqual([
      'validator_stake_current_epoch',
      'proposals_written',
    ]);
    // each measure keeps its kind and its standing, and names the layer it came from (seam.md)
    expect(view.measures).toEqual([
      expect.objectContaining({
        id: 'validator_stake_current_epoch',
        standing: 'verified',
        from: base.sha256,
      }),
      expect.objectContaining({
        id: 'proposals_written',
        kind: 'count',
        standing: 'verified',
        from: added.hash,
      }),
    ]);

    const proposed = (await tool('propose_spec').run(
      {
        network: 'test-two-participants',
        sha256: view.sha256,
        choices: { height: 'm:proposals_written' },
      },
      ctx,
    )) as Out;
    expect(proposed.error).toBeUndefined();
    expect(proposed.spec.encodings.height.by).toBe('m:proposals_written');
    expect(proposed.spec.encodings.height.sources).toEqual([`layer:${added.hash.slice(0, 12)}`]);

    // what draws it is the viewer's view, never the spec's choice (one-source.md, step 2): here a view
    // whose height is the agent's layer, as a person would set it
    const glasses = {
      ...DEFAULT_VIEW,
      dimensions: { ...DEFAULT_VIEW.dimensions, height: { data: 'proposals_written' } },
    };
    const drawn = (await tool('render_flower').run(
      { spec: proposed.spec, view: glasses },
      ctx,
    )) as Out;
    expect(drawn.error).toBeUndefined();
    const height = (id: string) =>
      drawn.petals.find((p: Out) => p.id === id)?.values.find((v: Out) => v.primitive === 'height')
        ?.value;
    expect(height('figment.poolv1.near')).toBe(1);
    expect(height('astro-stakers.poolv1.near')).toBeLessThan(0.2);
  });

  test("a layer that isn't one, or a name already taken, is refused plainly", async () => {
    const { ctx } = await rig();
    const bad = (await tool('add_layer').run(
      { layer: { ...layer, standing: 'certain' } },
      ctx,
    )) as Out;
    expect(bad.error.code).toBe('bad_input');
    const base = testFixture('two-participants');
    const missing = (await tool('compose_view').run(
      { base: base.sha256, layers: ['0'.repeat(64)] },
      ctx,
    )) as Out;
    expect(missing.error.code).toBe('not_found');
  });
});
