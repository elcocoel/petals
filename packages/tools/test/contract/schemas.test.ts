// T053 (tools.md, Contract tests): each tool's input and output validate against their JSON
// Schemas, on the near-validators fixture; every error validates against the ToolError schema.

import { schemas } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { compile, describeErrors, TOOL_ERROR_SCHEMA } from '../../src/define.ts';
import { isToolError } from '../../src/errors.ts';
import { findTool, registry } from '../../src/registry.ts';
import { flow, INTERPRETATION, rig } from '../helpers.ts';

type Json = Record<string, unknown>;

describe('inputs and outputs match their schemas (near-validators fixture)', () => {
  test('one call per tool, success outputs against output, errors against ToolError', async () => {
    const r = await rig();
    const covered = new Set<string>();
    const checkError = compile(TOOL_ERROR_SCHEMA);
    const run = async (name: string, input: unknown): Promise<Json> => {
      const tool = findTool(name);
      if (!tool) throw new Error(name);
      const inOk = compile(tool.input);
      expect(typeof input, name).toBe('object');
      expect(inOk(input), `${name} input: ${describeErrors(inOk.errors)}`).toBe(true);
      const out = (await tool.run(input, r.ctx)) as Json;
      if (isToolError(out)) {
        expect(checkError(out), `${name} error: ${describeErrors(checkError.errors)}`).toBe(true);
        throw new Error(`${name} failed: ${JSON.stringify(out)}`);
      }
      const outOk = compile(tool.output);
      expect(outOk(out), `${name} output: ${describeErrors(outOk.errors)}`).toBe(true);
      covered.add(name);
      return out;
    };

    const f = await flow(run);
    await run('list_networks', {});
    await run('get_network', { id: 'near-validators' });
    await run('describe_snapshot', { sha256: f.sha256 });
    await run('compute_figures', { sha256: f.sha256, measure: 'validator_stake_current_epoch' });
    const v = await run('validate_spec', { spec: f.spec, interpretation: INTERPRETATION });
    expect(v.valid).toBe(true);
    await run('render_flower', { spec: f.spec, include_svg: true });
    const prep = await run('prepare_publish', { entry: f.draft });
    const proof = r.signer.sign({
      message: prep.message as string,
      nonce: prep.nonce as string,
      recipient: prep.recipient as string,
    });
    const pub = await run('publish_flower', { entry_sha256: prep.entry_sha256, proof });
    await run('list_flowers', {});
    const got = await run('get_flower', { id: pub.id });
    await run('quote_payment', { purpose: 'sponsor_refresh' });

    expect([...covered].sort()).toEqual(registry.map((t) => t.name).sort());
    // the documents inside the outputs are the contract's own schemas
    expect(compile(schemas.spec as Json)(f.spec)).toBe(true);
    expect(compile(schemas.entry as Json)(got.entry)).toBe(true);
  });

  test('outputs carry no snapshot body (step 1 lesson: never hand an agent a raw dump)', async () => {
    const r = await rig();
    const f = await flow(async (name, input) => (await findTool(name)?.run(input, r.ctx)) as Json);
    for (const out of [f.snap, f.proposed, f.rendered]) {
      expect(JSON.stringify(out)).not.toMatch(/"(participants|holdings|relationships)":\[/);
    }
  });
});
