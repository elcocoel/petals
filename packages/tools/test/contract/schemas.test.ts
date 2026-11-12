// T053 (tools.md, Contract tests): each tool's input and output validate against their JSON
// Schemas, on the near-validators fixture; every error validates against the ToolError schema.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { schemas } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { compile, describeErrors, TOOL_ERROR_SCHEMA } from '../../src/define.ts';
import { privateStore } from '../../src/drafts.ts';
import { isToolError } from '../../src/errors.ts';
import { findTool, registry } from '../../src/registry.ts';
import { flow, INTERPRETATION, rig } from '../helpers.ts';

type Json = Record<string, unknown>;

describe('inputs and outputs match their schemas (near-validators fixture)', () => {
  test('one call per tool, success outputs against output, errors against ToolError', async () => {
    const r = await rig();
    const covered = new Set<string>();
    const checkError = compile(TOOL_ERROR_SCHEMA);
    const run = async (name: string, input: unknown, ctx = r.ctx): Promise<Json> => {
      const tool = findTool(name);
      if (!tool) throw new Error(name);
      const inOk = compile(tool.input);
      expect(typeof input, name).toBe('object');
      expect(inOk(input), `${name} input: ${describeErrors(inOk.errors)}`).toBe(true);
      const out = (await tool.run(input, ctx)) as Json;
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
    const testLayer = {
      petal: 'layer/v1',
      about: 'near:mainnet:validators',
      kind: 'measures',
      measures: [{ name: 'proposals_written', unit: 'proposals', kind: 'count' }],
      rows: [
        { participant: 'astro-stakers.poolv1.near', measure: 'proposals_written', value: '3' },
      ],
      how: { method: 'a test layer', sources: [{ url: 'https://example.org/' }] },
      from: [f.sha256],
      when: { as_of: '2026-11-09T00:00:00Z' },
      standing: 'inferred',
    };
    const added = await run('add_layer', { layer: testLayer });
    await run('compose_view', { base: f.sha256, layers: [added.hash as string] });
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
    await run('find_target', { query: 'near validators' });
    await run('look_up', { query: 'near validators' });
    await run('look_up', { query: '0x000000000000000000000000000000000000dead' });
    await run('look_up', { query: 'astro-stakers.poolv1.near' });
    await run('read_chain', { address: '0x000000000000000000000000000000000000dead' });
    await run('read_page', { url: 'https://example.org/' });
    await run('search', { query: 'near validators' });
    await run('search_petals', { q: 'near validators' });
    await run('list_calls', {});
    await run('list_calls', {
      kind: 'rfp',
      q: 'relayer',
      closes_before: '2027-01-01T00:00:00.000Z',
    });
    const fixtures = join(import.meta.dirname, '..', '..', '..', 'core', 'schema', 'fixtures');
    const hos = JSON.parse(readFileSync(join(fixtures, 'proposals.v2.json'), 'utf8'));
    await privateStore(r.ctx.config).proposals.put({
      about: hos.about,
      body: JSON.stringify(hos),
      read_at: hos.read_at,
    });
    await run('find_voting_blocs', { map: hos.about, min_shared: 2 });
    const overview = await run('relations_overview', { kind: 'holdings' });
    const pair = (overview.pairs as { a: string; b: string }[])[0] as { a: string; b: string };
    const shared = await run('shared_accounts', { group_a: pair.a, group_b: pair.b });
    await run('related_groups', { group: pair.a, by: 'share', limit: 3 });
    const member = (shared.accounts as { account_a: string; account_b: string }[])[0] as {
      account_a: string;
      account_b: string;
    };
    await run('account_groups', { account: member.account_a });
    await run('power_path', {
      account_a: member.account_a,
      account_b: member.account_b,
      include_inferred: true,
    });
    const started = await run('start_exploration', { question: 'who holds it?' });
    const exploration = (started.link as { url: string }).url;
    await run('save_step', { exploration, spec: f.spec, note: 'a first look' });
    const noted = await run('add_note', { exploration, text: 'a note' });
    // a job handed out in the project, as the page's agent does, then taken and reported
    await privateStore(r.ctx.config).job.add({
      id: 'job_contract',
      exploration: noted.exploration as string,
      run: null,
      kind: 'map',
      title: 'Map the validators',
      brief: 'Who stands behind NEAR validators?',
      inputs: {},
      at: r.ctx.now().toISOString(),
    });
    const took = await run('take_job', { exploration });
    await run('take_job', { exploration });
    await run('report_job', {
      exploration,
      job: (took.job as { id: string }).id,
      result: { summary: 'A few pools hold most of the stake.', steps: [0] },
    });
    await run('list_jobs', { exploration });
    // the brain, from the repo's brain/
    await run('brain_index', {});
    await run('brain_route', { question: 'who holds the power here?', answers: ['sharesToken()'] });
    await run('brain_file', { id: 'doctrine' });
    await run('brain_context', { question: 'who votes together in this DAO' });
    await run(
      'brain_usage',
      {},
      { ...r.ctx, brainUsage: async () => ({ receipts: [], layers: { total: 0, with_brain: 0 } }) },
    );
    // layers kept on the site, and a fork of the version that made
    const kept = await run('keep_layer', { exploration, layer: testLayer });
    await run('list_layers', { exploration });
    await run('list_layers', { exploration, hash: kept.hash as string });
    await run('fork_dataset', {
      exploration,
      version: (kept.version as { id: string }).id,
      drop: [],
    });
    // annotations, what an agent adds about an account (annotations.ts)
    const about = 'eip155:100:0x1111111111111111111111111111111111111111';
    await run('add_annotation', {
      exploration,
      as: 'codex',
      annotations: [
        {
          subject: about,
          verb: 'noted',
          object: { value: 'Signs for the treasury.' },
          kind: 'sourced',
          evidence: [{ url: 'https://example.org/signers' }],
        },
      ],
    });
    await run('list_annotations', { exploration });
    await run('list_annotations', { exploration, about });
    // what an agent keeps in the project (data.ts)
    const markFixture = JSON.parse(
      readFileSync(
        join(import.meta.dirname, '..', '..', '..', 'core', 'schema', 'fixtures', 'mark.v1.json'),
        'utf8',
      ),
    );
    await run('keep_data', { exploration, document: markFixture });
    await run('list_data', { exploration });
    const fork = await run('start_exploration', { fork_of: exploration });
    await run('get_exploration', { exploration: (fork.link as { url: string }).url });
    const signedIn = { ...r.ctx, caller: { subject: 'prs_test', door: 'test' } };
    await run('start_exploration', { question: 'mine' }, signedIn);
    await run('list_explorations', {}, signedIn);

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
