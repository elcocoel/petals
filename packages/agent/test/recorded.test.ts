// T020: the hand-made skeleton transcript replays in quickstart step 2's tool order, takes every
// value from tool results, and its interpretation is schema-valid with sources the fixture has.
// T061: the real run replays on the real tools, with the signatures it got when it was recorded.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { schemas, sha256Hex } from '@petal/core';
import type { FlowerResult, ModelSignature, Snapshot, Stage } from '@petal/core/types';
import { createContext } from '@petal/tools';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { describe, expect, test } from 'vitest';
import { buildPetalApp } from '../src/app.ts';
import { DEFAULT_BUDGET, type LlmMessage } from '../src/llm.ts';
import { DEFAULT_MODEL } from '../src/near-ai.ts';
import {
  HAND_TRANSCRIPT,
  loadTranscript,
  RECORDED_ATTESTATIONS,
  recordedClient,
  SKELETON_TRANSCRIPT,
} from '../src/recorded.ts';
import { startRun } from '../src/run.ts';
import { collect, tmpRoot } from './helpers.ts';

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
  const llm = recordedClient(HAND_TRANSCRIPT);
  const t = loadTranscript(HAND_TRANSCRIPT);
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

describe('recordedClient on the hand-made transcript', () => {
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

  test('every number in the answer comes from compute_figures', async () => {
    const { answer, last } = await replay();
    expect(answer).toContain('9 of 371 seated validators');
    expect(answer).toContain('found in its fixture (reused: true)');
    // only compute_figures numbers: no block height (a get_snapshot value) in the answer
    expect(answer).not.toContain('222915356');
    expect(answer).toContain('http://localhost:3000/f/draft');
    expect(answer).not.toMatch(/\{\{|\$from/);
    expect(last).toMatchObject({ model: 'recorded', signature: null, cost_usd: 0 });
  });

  test('is stateless: the same conversation gives the same reply', async () => {
    const llm = recordedClient(HAND_TRANSCRIPT);
    const messages: LlmMessage[] = [
      { role: 'user', content: 'who stands behind NEAR’s validators?' },
    ];
    expect(await llm.complete({ messages })).toEqual(await llm.complete({ messages }));
  });

  test('says which tool result is missing', async () => {
    const llm = recordedClient(HAND_TRANSCRIPT);
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

describe('the recorded skeleton run (T061)', () => {
  const REPO = join(import.meta.dirname, '..', '..', '..');
  const t = loadTranscript(SKELETON_TRANSCRIPT) as ReturnType<typeof loadTranscript> & {
    run: { spec_sha256: string };
  };
  const signed = t.turns.map((x) => x.signature as ModelSignature);
  const replay = () =>
    collect(
      startRun(
        { messages: [{ role: 'user', content: t.question }] },
        {
          tools: createContext({ root: REPO, fake: true, stateDir: tmpRoot() } as never),
          llm: recordedClient(SKELETON_TRANSCRIPT),
          budget: DEFAULT_BUDGET,
        },
      ),
    );

  test('is a real run on the model Petal uses: every reply has its enclave signature', () => {
    expect(t).toMatchObject({ kind: 'recorded', model: DEFAULT_MODEL });
    expect(signed.length).toBe(t.turns.length);
    for (const sig of signed) {
      expect(sig).toMatchObject({
        provider: 'near-ai-cloud',
        model: DEFAULT_MODEL,
        signature_kind: 'provider_tee',
      });
      expect(sig.text).toBe(`${sig.model}:${sig.request_sha256}:${sig.response_sha256}`);
      expect(sig.signature.length).toBeGreaterThan(64);
    }
  });

  test('its attestation report ships with it, byte for byte, and names the signer', () => {
    for (const sig of signed) {
      const sha = sig.attestation?.report_sha256 as string;
      const bytes = readFileSync(join(RECORDED_ATTESTATIONS, `${sha}.json`));
      expect(sha256Hex(new Uint8Array(bytes))).toBe(sha);
      const report = JSON.parse(bytes.toString('utf8')) as {
        model_attestations: { signing_address: string }[];
      };
      const signers = report.model_attestations.map((a) => a.signing_address.toLowerCase());
      expect(signers).toContain(sig.signing_address.toLowerCase());
    }
  });

  test('the report is served to anyone, also with no key and no state of its own', async () => {
    const app = buildPetalApp({ root: REPO, fake: true, stateDir: tmpRoot() } as never);
    const sha = signed[0]?.attestation?.report_sha256 as string;
    const res = await app.request(`/api/v1/attestations/${sha}`);
    expect(res.status).toBe(200);
    expect(sha256Hex(new Uint8Array(await res.arrayBuffer()))).toBe(sha);
  });

  test('replays on the real tools to the flower it recorded, and says it is a recording', async () => {
    const es = await replay();
    const first = es.find((e) => e.event === 'stage')?.data as { stage: Stage };
    expect(first.stage).toBe('recorded');
    const flower = es.find((e) => e.event === 'flower')?.data as FlowerResult;
    expect(flower.spec_sha256).toBe(t.run.spec_sha256);
    expect(flower.validation).toMatchObject({ valid: true, errors: [] });
    expect(flower.spec.encodings.segments).toMatchObject({ by: 'backers' });
    const done = es.at(-1)?.data as { model: string; cost_usd: number };
    expect(done).toMatchObject({ model: 'recorded', cost_usd: 0 });

    // the signature shown is the real one, of the reply that wrote the interpretation
    const sig = es.find((e) => e.event === 'signature')?.data as ModelSignature;
    const writer = t.turns.find((x) => x.tool_calls?.some((c) => c.name === 'validate_spec'));
    expect(sig).toEqual(writer?.signature);

    // the model was given a short link; the person gets the real one
    const answer = es.findLast((e) => e.event === 'message')?.data as { text: string };
    expect(answer.text).toContain(flower.view_url);
    expect(answer.text).not.toMatch(/\{\{|\/draft\?flower=/);
  });

  test('its interpretation is schema-valid and cites only sources the fixture has', async () => {
    const es = await replay();
    const flower = es.find((e) => e.event === 'flower')?.data as FlowerResult;
    const { interpretation } = flower;
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    addFormatsModule.default(ajv);
    const validate = ajv.compile(schemas.interpretation);
    expect(validate(interpretation), JSON.stringify(validate.errors)).toBe(true);
    const fixture = join(REPO, 'fixtures', 'snapshots', `${SHA}.json.gz`);
    const s = JSON.parse(gunzipSync(readFileSync(fixture)).toString('utf8')) as Snapshot;
    const known = new Set(s.sources.map((x) => x.id));
    for (const m of [...interpretation.mappings, ...interpretation.power_means]) {
      for (const id of m.sources) expect(known.has(id), id).toBe(true);
    }
  });

  test('the client hands back the recorded signature, under the name "recorded"', async () => {
    const c = await recordedClient(SKELETON_TRANSCRIPT).complete({
      messages: [{ role: 'user', content: 'anything' }],
    });
    expect(c).toMatchObject({ model: 'recorded', cost_usd: 0, usage: { in: 0, out: 0 } });
    expect(c.signature).toEqual(t.turns[0]?.signature);
  });
});
