// A flower drawn by a measure nobody in the reading holds has no petals, and render_flower says so: how many it
// drew, and with none, which measures someone does hold, so an agent never describes petals that aren't there.
import { canonicalJson, sha256Hex } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { registry } from '../src/registry.ts';
import { moduleOf, rig, testDescriptor, testFixture } from './helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Out = Record<string, any>;
const tool = (name: string) => registry.find((t) => t.name === name) as (typeof registry)[number];

describe('render_flower with a measure nobody holds', () => {
  test('no petals: petals_drawn is 0, and nothing_drawn names the measure and the ones held', async () => {
    const { ctx, store } = await rig();
    const two = testFixture('two-participants').s;
    // the two validators, and a count of votes neither ever cast
    const s = {
      ...two,
      network: { ...two.network, id: 'test-never-voted' },
      holdings: [
        ...two.holdings,
        ...two.holdings.map((h) => ({ ...h, measure: 'votes_cast', amount: '0', unit: 'votes' })),
      ],
    };
    const sha = sha256Hex(canonicalJson(s));
    expect((await store.put(s as never)).sha256).toBe(sha);
    ctx.modules['test-never-voted'] = moduleOf(testDescriptor(s as never), s as never);
    const proposed = (await tool('propose_spec').run(
      { network: 'test-never-voted', sha256: sha, choices: { measure: 'votes_cast' } },
      ctx,
    )) as Out;
    expect(proposed.error, JSON.stringify(proposed.error)).toBeUndefined();
    const drawn = (await tool('render_flower').run({ spec: proposed.spec }, ctx)) as Out;
    expect(drawn.error, JSON.stringify(drawn.error)).toBeUndefined();
    expect(drawn.petals_drawn).toBe(0);
    expect(drawn.nothing_drawn).toEqual({
      measure: 'votes_cast',
      says: 'Nobody in this reading holds any votes_cast, so the flower has no petals.',
      measures_held: ['validator_stake_current_epoch'],
    });
  });

  test('a flower with petals says how many, and nothing more', async () => {
    const { ctx } = await rig();
    const { sha256 } = testFixture('two-participants');
    const proposed = (await tool('propose_spec').run(
      { network: 'test-two-participants', sha256 },
      ctx,
    )) as Out;
    const drawn = (await tool('render_flower').run({ spec: proposed.spec }, ctx)) as Out;
    expect(drawn.petals_drawn).toBe(2);
    expect(drawn.nothing_drawn).toBeUndefined();
  });
});
