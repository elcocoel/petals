// T053 (tools.md, http-api.md Contract tests): the registry in process, HTTP, MCP over /mcp and
// MCP over stdio return identical JSON for the same call (minus transport fields); the same
// choices give the same spec_sha256 through every door.
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

vi.mock('@petal/core', async (o) => (await import('../doubles/core.ts')).mockCore(await o()));
vi.mock('@petal/inputs', async (o) => (await import('../doubles/inputs.ts')).mockInputs(await o()));
vi.mock('@petal/near/auth', async (o) => (await import('../doubles/near.ts')).mockAuth(await o()));
vi.mock('@petal/near/map', async (o) => (await import('../doubles/near.ts')).mockMap(await o()));

import { callTool } from '../../src/registry.ts';
import { entrySha256 } from '../../src/verify.ts';
import { flow, INTERPRETATION, rig, type TestRig } from '../helpers.ts';
import { type Door, doors, type Json } from './doors.ts';

let r: TestRig;
let all: Door[];
let close: () => Promise<void>;
let f: Awaited<ReturnType<typeof flow>>;

beforeAll(async () => {
  r = rig();
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
    ];
    for (const [tool, input] of calls) {
      const [out] = await same(tool, input);
      expect(out?.tools_version, tool).toBe('tools/v1');
      expect(out?.error, tool).toBeUndefined();
    }
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
        writer: 'writer.petals.testnet',
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
