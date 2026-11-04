// T020: the hand-made skeleton transcript replays in quickstart step 2's tool order, takes every
// value from tool results, and its interpretation is schema-valid with sources the fixture has.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { schemas } from '@petal/core';
import type { Snapshot } from '@petal/core/types';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { describe, expect, test } from 'vitest';
import type { LlmMessage } from '../src/llm.ts';
import { loadTranscript, recordedClient, SKELETON_TRANSCRIPT } from '../src/recorded.ts';

const SHA = '72a6d9676d967d63712dc82bcbb90282d2f61e5ca6495c3e2e54a4f9af77e9ec';
const SPEC = { petal: 'spec/v1', marker: 'the proposed spec' };
// What the tools would answer (shapes from tools.md; values made up except the fixture hash).
const fakeTools: Record<string, (args: Record<string, unknown>) => unknown> = {
  get_snapshot: () => ({
    sha256: SHA,
    reused: true,
    where: 'fixture',
    snapshot: { block_height: 222915356 },
  }),
  describe_snapshot: () => ({ measures: [{ id: 'validator_stake_current_epoch' }] }),
  compute_figures: () => ({
    nakamoto: { threshold: 0.333333, count: 9 },
    participants_included: 371,
  }),
  propose_spec: () => ({ spec: SPEC, spec_sha256: 'f'.repeat(64) }),
  validate_spec: () => ({ valid: true, errors: [], warnings: [] }),
  render_flower: () => ({
    view_url: 'http://localhost:3000/f/draft',
    render_sha256: 'e'.repeat(64),
  }),
};

async function replay() {
  const llm = recordedClient(SKELETON_TRANSCRIPT);
  const t = loadTranscript(SKELETON_TRANSCRIPT);
  const messages: LlmMessage[] = [{ role: 'user', content: t.question }];
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  for (let i = 0; i < 20; i++) {
    const r = await llm.complete({ messages });
    messages.push(r.message);
    if (!r.message.tool_calls?.length) return { calls, answer: r.message.content ?? '', last: r };
    for (const c of r.message.tool_calls) {
      const args = JSON.parse(c.arguments) as Record<string, unknown>;
      calls.push({ name: c.name, args });
      const run = fakeTools[c.name];
      if (!run) throw new Error(`no fake for ${c.name}`);
      messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(run(args)) });
    }
  }
  throw new Error('the transcript never answered');
}

describe('recordedClient on the skeleton transcript', () => {
  test('calls the tools in the order of quickstart step 2', async () => {
    const { calls } = await replay();
    expect(calls.map((c) => c.name)).toEqual([
      'get_snapshot',
      'describe_snapshot',
      'compute_figures',
      'propose_spec',
      'validate_spec',
      'render_flower',
    ]);
    expect(calls.length).toBeLessThanOrEqual(8); // tool rounds per chat (http-api.md)
  });

  test('takes hashes and the spec from tool results, never from the transcript', async () => {
    const { calls } = await replay();
    expect(calls[1]?.args.sha256).toBe(SHA);
    expect(calls[3]?.args).toMatchObject({ sha256: SHA, choices: { segments: 'backers' } });
    expect(calls[4]?.args.spec).toEqual(SPEC);
    expect(calls[5]?.args.spec).toEqual(SPEC);
  });

  test('every number in the answer comes from a tool result', async () => {
    const { answer, last } = await replay();
    expect(answer).toContain('9 of 371 seated validators');
    expect(answer).toContain('block 222915356');
    expect(answer).toContain('http://localhost:3000/f/draft');
    expect(answer).not.toMatch(/\{\{|\$from/);
    expect(last).toMatchObject({ model: 'recorded', signature: null, cost_usd: 0 });
  });

  test('is stateless: the same conversation gives the same reply', async () => {
    const llm = recordedClient(SKELETON_TRANSCRIPT);
    const messages: LlmMessage[] = [
      { role: 'user', content: 'who stands behind NEAR’s validators?' },
    ];
    expect(await llm.complete({ messages })).toEqual(await llm.complete({ messages }));
  });

  test('says which tool result is missing', async () => {
    const llm = recordedClient(SKELETON_TRANSCRIPT);
    const messages: LlmMessage[] = [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: null, tool_calls: [] },
    ];
    await expect(llm.complete({ messages })).rejects.toThrow(/call_1/);
  });

  test('the interpretation is schema-valid and cites only sources the fixture has', async () => {
    const { calls } = await replay();
    const interpretation = calls[4]?.args.interpretation;
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    addFormatsModule.default(ajv);
    const validate = ajv.compile(schemas.interpretation);
    expect(validate(interpretation), JSON.stringify(validate.errors)).toBe(true);

    const fixture = join(
      import.meta.dirname,
      '..',
      '..',
      '..',
      'fixtures',
      'snapshots',
      `${SHA}.json.gz`,
    );
    const s = JSON.parse(gunzipSync(readFileSync(fixture)).toString('utf8')) as Snapshot;
    const known = new Set(s.sources.map((x) => x.id));
    const cited = JSON.stringify(interpretation).match(/"sources":\[[^\]]*\]/g) ?? [];
    const ids = cited.flatMap((c) => JSON.parse(c.slice('"sources":'.length)) as string[]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(known.has(id), id).toBe(true);
  });
});
