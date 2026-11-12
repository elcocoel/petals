// T046: one registry; schemas; errors returned, never thrown; tools_version on every output.

import { NotImplementedError } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { compile, defineTool, TOOL_ERROR_SCHEMA } from '../src/define.ts';
import { callTool, describeTool, registry } from '../src/registry.ts';
import { rig } from './helpers.ts';

const PHASE_A = [
  'list_networks',
  'get_network',
  'get_snapshot',
  'describe_snapshot',
  'add_layer',
  'compose_view',
  'compute_figures',
  'propose_spec',
  'validate_spec',
  'render_flower',
  'list_flowers',
  'get_flower',
  'prepare_publish',
  'publish_flower',
  'quote_payment',
  'look_up',
  'get_map',
  'list_publishable',
  'find_target',
  'read_chain',
  'read_page',
  'search',
  'search_petals',
  'list_calls',
  'find_voting_blocs',
  'list_payouts',
  'keep_data',
  'list_data',
  'account_groups',
  'shared_accounts',
  'related_groups',
  'relations_overview',
  'power_path',
  'list_explorations',
  'get_exploration',
  'start_exploration',
  'save_step',
  'add_note',
  'take_job',
  'report_job',
  'list_jobs',
  'brain_route',
  'brain_file',
  'brain_index',
  'brain_context',
  'brain_usage',
  'keep_layer',
  'list_layers',
  'fork_dataset',
  'add_annotation',
  'list_annotations',
];

describe('registry', () => {
  test('holds the Phase A tools of tools.md, find_target, the relations and exploration tools, once each', () => {
    expect(registry.map((t) => t.name)).toEqual(PHASE_A);
  });

  test('every tool has object schemas that compile, a description, and tools_version out', () => {
    for (const t of registry) {
      expect(t.input.type, t.name).toBe('object');
      expect(t.output.type, t.name).toBe('object');
      expect(() => compile(t.input), t.name).not.toThrow();
      expect(() => compile(t.output), t.name).not.toThrow();
      expect((t.output.required as string[]).includes('tools_version'), t.name).toBe(true);
      const d = describeTool(t);
      expect(d.description.length, t.name).toBeGreaterThan(40);
      expect(t.input.description, t.name).toBe(d.description);
    }
  });

  test('a bad input is a bad_input, with tools_version', async () => {
    const { ctx } = await rig();
    const out = await callTool('compute_figures', { sha256: 'nope' }, ctx);
    expect(compile(TOOL_ERROR_SCHEMA)(out)).toBe(true);
    expect(out).toMatchObject({ error: { code: 'bad_input' }, tools_version: 'tools/v2' });
    expect((out as { error: { message: string } }).error.message).toMatch(/sha256|measure/);
  });

  test('an unknown tool is a bad_input naming the tools', async () => {
    const out = await callTool('draw_texture', {}, (await rig()).ctx);
    expect(out).toMatchObject({
      error: { code: 'bad_input', hint: expect.stringContaining('render_flower') },
    });
  });

  test('a throw inside a tool comes back as a ToolError; a stub as internal "not built yet"', async () => {
    const throwing = defineTool<object, object>({
      name: 'x',
      title: 'x',
      description: 'x',
      input: { type: 'object' },
      output: { type: 'object' },
      async run() {
        throw new NotImplementedError('fileStore');
      },
    });
    const out = await throwing.run({}, (await rig()).ctx);
    expect(out).toMatchObject({
      error: { code: 'internal', message: 'not built yet: fileStore' },
      tools_version: 'tools/v2',
    });
    const coded = defineTool<object, object>({
      ...throwing,
      failure: 'source_failed',
      async run() {
        throw Object.assign(new Error('rpc down'), { code: 'rate_limited', retry_after_s: 7 });
      },
    });
    expect(await coded.run({}, (await rig()).ctx)).toMatchObject({
      error: { code: 'rate_limited', message: 'rpc down', retry_after_s: 7 },
    });
    const plain = defineTool<object, object>({
      ...throwing,
      failure: 'source_failed',
      async run() {
        throw new Error('boom');
      },
    });
    expect(await plain.run({}, (await rig()).ctx)).toMatchObject({
      error: { code: 'source_failed' },
    });
  });
});
