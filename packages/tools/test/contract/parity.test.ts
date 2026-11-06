// T053 (tools.md, http-api.md Contract tests): the registry in process, HTTP, MCP over /mcp and
// MCP over stdio return identical JSON for the same call (minus transport fields); the same
// choices give the same spec_sha256 through every door.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { callTool } from '../../src/registry.ts';
import { entrySha256 } from '../../src/verify.ts';
import { flow, INTERPRETATION, rig, type TestRig } from '../helpers.ts';
import { type Door, doors, type Json } from './doors.ts';

let r: TestRig;
let all: Door[];
let close: () => Promise<void>;
let f: Awaited<ReturnType<typeof flow>>;

beforeAll(async () => {
  r = await rig();
  ({ all, close } = await doors(r.ctx));
  f = await flow(async (name, input) => (await callTool(name, input, r.ctx)) as Json);
});
afterAll(() => close());

async function same(tool: string, input: Json, drop: string[] = []): Promise<Json[]> {
  const outs: Json[] = [];
  for (const d of all) {
    const out = { ...(await d.call(tool, input)) };
    for (const k of drop) delete out[k];
    outs.push(out);
  }
  const [first, ...rest] = outs;
  rest.forEach((o, i) => {
    expect(o, `${tool} via ${all[i + 1]?.name}`).toEqual(first);
  });
  return outs;
}

describe('every door returns the same JSON', () => {
  test('reads, counting, specs, render and the dry quote', async () => {
    const calls: [string, Json][] = [
      ['list_networks', {}],
      ['list_networks', { query: 'validators' }],
      ['get_network', { id: 'near-validators' }],
      ['get_snapshot', { network: 'near-validators' }],
      ['describe_snapshot', { sha256: f.sha256, top: 5 }],
      [
        'compute_figures',
        { sha256: f.sha256, measure: 'validator_stake_current_epoch', petals: 60 },
      ],
      [
        'propose_spec',
        { network: 'near-validators', sha256: f.sha256, choices: { segments: 'backers' } },
      ],
      ['validate_spec', { spec: f.spec, interpretation: INTERPRETATION }],
      ['render_flower', { spec: f.spec, include_svg: true }],
      ['render_flower', { spec: f.spec, include_svg: false }],
      ['quote_payment', { purpose: 'sponsor_refresh', amount_usd: 1 }],
      ['find_target', { query: 'near validators' }],
    ];
    for (const [tool, input] of calls) {
      const [out] = await same(tool, input);
      expect(out?.tools_version, tool).toBe('tools/v1');
      expect(out?.error, tool).toBeUndefined();
    }
  });

  test('the relations tools', async () => {
    const overview = await same('relations_overview', { kind: 'holdings' });
    const pairs = overview[0]?.pairs as { a: string; b: string; shared: number }[];
    expect(pairs.length).toBeGreaterThan(0);
    const { a, b } = pairs[0] as { a: string; b: string };
    const [shared] = await same('shared_accounts', { group_a: a, group_b: b, limit: 3 });
    const accounts = (shared as Json).accounts as { account_a: string }[];
    const account = accounts[0]?.account_a as string;
    await same('related_groups', { group: a, by: 'share', limit: 3 });
    await same('account_groups', { account, limit: 5 });
    await same('power_path', { account_a: account, account_b: account });
    await same('power_path', {
      account_a: account,
      account_b: 'no-such-account-here.near',
      max_depth: 2,
    });
    await same('power_path', { account_a: account, account_b: account, include_inferred: true });
    // the errors too
    const [missing] = await same('related_groups', { group: 'no-such-group' });
    expect(missing?.error).toMatchObject({ code: 'not_found' });
    const [wrong] = await same('related_groups', { group: a, by: 'size' });
    expect(wrong?.error).toMatchObject({ code: 'bad_input' });
  });

  test('the exploration tools: reads and errors the same, writes the same but for the door', async () => {
    const [refused] = await same('list_explorations', {});
    expect(refused?.error).toMatchObject({ code: 'unauthorised' });
    const [gone] = await same('get_exploration', { exploration: 'exp_'.padEnd(28, '0') });
    expect(gone?.error).toMatchObject({ code: 'not_found' });

    const started = await callTool('start_exploration', { question: 'who?' }, r.ctx);
    const { link } = started as { link: { url: string } };
    const exploration = link.url;
    const [empty] = await same('get_exploration', { exploration });
    expect(empty?.access).toMatchObject({ as: 'continue' });
    const doorsSeen: unknown[] = [];
    for (const d of all) {
      const noted = await d.call('add_note', { exploration, text: `from ${d.name}` });
      const { door } = noted.note as { door: string };
      doorsSeen.push(door);
    }
    expect(doorsSeen).toEqual(['unknown', 'http', 'mcp', 'mcp']);
    const saved = await all[1]?.call('save_step', { exploration, spec: f.spec });
    expect(saved).toMatchObject({ head: f.proposed.spec_sha256, step: { door: 'http' } });
    const [back] = await same('get_exploration', { exploration });
    expect(back?.steps).toHaveLength(1);
    expect(back?.notes).toHaveLength(all.length);
  });

  test('the same choices give the same spec_sha256 through every door', async () => {
    const choices = { measure: 'validator_stake_current_epoch', segments: 'backers', width: 'r2' };
    const outs = await same('propose_spec', {
      network: 'near-validators',
      sha256: f.sha256,
      choices,
    });
    expect(new Set(outs.map((o) => o.spec_sha256)).size).toBe(1);
    expect(outs[0]?.spec_sha256).toBe(f.proposed.spec_sha256);
  });

  test('errors are the same ToolError on every door', async () => {
    const calls: [string, Json][] = [
      ['compute_figures', { sha256: 'x', measure: 'm' }],
      ['get_network', { id: 'bitcoin-mining-pools' }],
      ['describe_snapshot', { sha256: 'd'.repeat(64) }],
      ['render_flower', { spec: { petal: 'spec/v1' }, include_svg: false }],
      ['propose_spec', { network: 'near-validators', sha256: f.sha256, choices: { texture: 'x' } }],
      ['quote_payment', { purpose: 'sponsor_coverage', amount_usd: 7 }],
    ];
    for (const [tool, input] of calls) {
      const [out] = await same(tool, input);
      expect(out?.error, tool).toBeDefined();
    }
  });

  test('publish through each door, then the map reads agree', async () => {
    const ids: string[] = [];
    for (const d of all) {
      const prep = await d.call('prepare_publish', { entry: f.draft });
      expect(prep.entry_sha256, d.name).toBe(entrySha256(f.draft as never));
      const proof = r.signer.sign({
        message: prep.message as string,
        nonce: prep.nonce as string,
        recipient: prep.recipient as string,
      });
      const pub = await d.call('publish_flower', { entry_sha256: prep.entry_sha256, proof });
      expect(pub, d.name).toMatchObject({
        key: `petal/v1/spec/${pub.id}`,
        receiver: 'petals.testnet',
        writer: 'petals-writer.testnet',
        tools_version: 'tools/v1',
      });
      ids.push(pub.id as string);
    }
    // each publish signs a fresh nonce, so each is its own entry
    expect(new Set(ids).size).toBe(all.length);
    const [list] = await same('list_flowers', {});
    expect(list?.flowers).toHaveLength(all.length);
    for (const id of ids) await same('get_flower', { id });
    await same('list_flowers', { network: 'near-validators', maker: 'maker.testnet', limit: 2 });
  });
});
