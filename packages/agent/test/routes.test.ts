// T058: the agent routes. A signed run goes through the real nearAiClient over a fake NEAR AI Cloud
// (it replays the skeleton transcript), so the whole chain is exercised without calling it.
import { join } from 'node:path';
import { sha256Hex } from '@petal/core';
import type { Run } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { agentRoutes } from '../src/index.ts';
import { DEFAULT_BUDGET, type LlmClient } from '../src/llm.ts';
import { createNearAiClient, DEFAULT_MODEL, FALLBACK_MODELS } from '../src/near-ai.ts';
import { recordedClient, SKELETON_TRANSCRIPT } from '../src/recorded.ts';
import { type AgentRouteOptions, createAgentRoutes } from '../src/routes.ts';
import { fileRunStore } from '../src/runs.ts';
import {
  bodyOf,
  fakeContext,
  fakeNearAi,
  fakeRegistry,
  inOrder,
  parseSse,
  runIdOf,
  type SseEvent,
  scriptedLlm,
  slowRecorded,
  tmpRoot,
} from './helpers.ts';

const QUESTION = { messages: [{ role: 'user', content: 'who stands behind NEAR’s validators?' }] };

function setup(o: { llm?: LlmClient; opts?: AgentRouteOptions } = {}) {
  const root = tmpRoot();
  const state = join(root, '.petal');
  const fake = fakeNearAi();
  const llm =
    o.llm ??
    createNearAiClient(
      { apiKeyEnv: 'NEAR_AI_API_KEY', model: DEFAULT_MODEL, fallbacks: [...FALLBACK_MODELS] },
      {
        apiKey: 'sk-test',
        baseURL: 'https://near-ai.test/v1',
        fetch: fake.fetch,
        attestationsDir: join(state, 'attestations'),
        signatureDelaysMs: [0],
      },
    );
  const tools = fakeRegistry();
  const runs = fileRunStore(join(state, 'runs'));
  const app = createAgentRoutes(
    { tools: fakeContext(root), llm, budget: DEFAULT_BUDGET, runs },
    { registry: tools.registry, ...o.opts },
  );
  return { app, fake, runs, tools };
}

const chat = (app: ReturnType<typeof setup>['app'], body: unknown = QUESTION, ip = '203.0.113.7') =>
  app.request('/api/v1/agent/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const names = (es: SseEvent[]) => es.map((e) => e.event);
const data = <T>(es: SseEvent[], name: string) => es.find((e) => e.event === name)?.data as T;

async function waitFor(f: () => Promise<boolean>, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await f()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('waitFor: timed out');
}

describe('POST /api/v1/agent/chat', () => {
  test('SSE order: run → stage → tool_call → tool_result … → flower → signature → done', async () => {
    const { app } = setup();
    const res = await chat(app);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const es = parseSse(await res.text());
    const n = names(es);
    expect(n[0]).toBe('run');
    expect(n.at(-1)).toBe('done');
    expect(
      inOrder(n, ['run', 'stage', 'tool_call', 'tool_result', 'flower', 'signature', 'done']),
    ).toBe(true);
    expect(n[n.indexOf('flower') + 1]).toBe('signature');
    expect(es.map((e) => e.id)).toEqual(es.map((_, i) => String(i)));
    const done = data<{ model: string; turns: number; tokens: { in: number } }>(es, 'done');
    expect(done).toMatchObject({ model: 'z-ai/glm-5.3-flash', turns: 7, fallback_used: false });
    expect(done.tokens.in).toBe(7000);
    const propose = es.find(
      (e) => e.event === 'tool_call' && (e.data as { name: string }).name === 'propose_spec',
    );
    expect(propose?.data).toMatchObject({ args: { choices: { segments: 'backers' } } });
  });

  test('the signature is the provider_tee one over the exact bytes of the validate_spec call', async () => {
    const { app, fake } = setup();
    const es = parseSse(await (await chat(app)).text());
    const sig = data<{
      completion_id: string;
      text: string;
      request_sha256: string;
      response_sha256: string;
      attestation: { report_sha256: string; report_url: string };
    }>(es, 'signature');
    // the 5th completion is the one that called validate_spec with the interpretation
    expect(sig.completion_id).toBe('chatcmpl-5');
    const ex = fake.exchanges.get('chatcmpl-5');
    expect(sig.request_sha256).toBe(sha256Hex(ex?.request ?? ''));
    expect(sig.response_sha256).toBe(sha256Hex(ex?.response ?? ''));
    expect(sig.text).toBe(`z-ai/glm-5.3-flash:${sig.request_sha256}:${sig.response_sha256}`);
    expect(new TextDecoder().decode(ex?.response)).toContain('validate_spec');
    expect(sig.attestation.report_url).toBe(
      `/api/v1/attestations/${sig.attestation.report_sha256}`,
    );
  });

  test('a recorded run (no key) says so: done.model = "recorded", no signature event', async () => {
    const { app } = setup({ llm: recordedClient(SKELETON_TRANSCRIPT) });
    const es = parseSse(await (await chat(app)).text());
    expect(data<{ model: string }>(es, 'done').model).toBe('recorded');
    expect(inOrder(names(es), ['run', 'stage', 'tool_call', 'tool_result', 'flower', 'done'])).toBe(
      true,
    );
    expect(names(es)).not.toContain('signature');
  });

  test('bad bodies are bad_input, with tools_version', async () => {
    const { app } = setup({ llm: scriptedLlm([]) });
    for (const body of [
      '{nope',
      { messages: [] },
      { messages: [{ role: 'system', content: 'x' }] },
      { ...QUESTION, run_id: '../x' },
    ]) {
      const res = await chat(app, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        error: { code: 'bad_input' },
        tools_version: 'tools/v1',
      });
    }
    const res = await chat(app, { ...QUESTION, run_id: 'nosuchrun1' });
    expect(res.status).toBe(404);
    expect((await bodyOf(res)).error.code).toBe('not_found');
  });

  test('at most 10 chats an hour per IP: then 429 rate_limited with retry_after_s', async () => {
    const { app } = setup({
      llm: scriptedLlm(Array.from({ length: 20 }, () => ({ content: 'hi' }))),
    });
    for (let i = 0; i < 10; i++) expect((await chat(app)).status).toBe(200);
    const res = await chat(app);
    expect(res.status).toBe(429);
    const body = await bodyOf(res);
    expect(body.error.code).toBe('rate_limited');
    expect(body.error.retry_after_s).toBeGreaterThan(3500);
    expect((await chat(app, QUESTION, '198.51.100.1')).status).toBe(200);
  });
});

describe('runs you can leave and come back to', () => {
  test('GET /api/v1/agent/runs/:id: the finished run, its flower, messages and draft', async () => {
    const { app } = setup();
    const es = parseSse(await (await chat(app)).text());
    const { run_id } = data<{ run_id: string }>(es, 'run');
    const res = await app.request(`/api/v1/agent/runs/${run_id}`);
    expect(res.status).toBe(200);
    const run = (await res.json()) as Run & { tools_version: string };
    expect(run).toMatchObject({ run_id, status: 'done', tools_version: 'tools/v1' });
    expect(run.flower?.view_url).toBe('http://localhost:3000/f/draft');
    expect(run.messages[0]).toEqual(QUESTION.messages[0]);
    expect(run.messages.at(-1)?.content).toContain('9 of 371 seated validators');
    expect(run.events.map((e) => e.event)).toEqual(names(es).filter((n) => n !== 'heartbeat'));
    expect(run.draft?.entry?.provenance?.agent?.signature?.completion_id).toBe('chatcmpl-5');
  });

  test('with Accept: text/event-stream a finished run is replayed through done', async () => {
    const { app } = setup({ llm: recordedClient(SKELETON_TRANSCRIPT) });
    const live = parseSse(await (await chat(app)).text());
    const { run_id } = data<{ run_id: string }>(live, 'run');
    const res = await app.request(`/api/v1/agent/runs/${run_id}`, {
      headers: { accept: 'text/event-stream' },
    });
    expect(names(parseSse(await res.text()))).toEqual(names(live));
  });

  test('the run goes on when the browser leaves mid-run, and can be followed again', async () => {
    const { app, runs } = setup({ llm: slowRecorded(25), opts: { heartbeatMs: 1000 } });
    const res = await chat(app);
    const reader = res.body?.getReader();
    const first = await reader?.read();
    const runId = runIdOf(parseSse(new TextDecoder().decode(first?.value)));
    await reader?.cancel(); // the tab closes
    // someone opens the resume link while it is still running
    const again = await app.request(`/api/v1/agent/runs/${runId}`, {
      headers: { accept: 'text/event-stream' },
    });
    const followed = parseSse(await again.text());
    expect(names(followed)[0]).toBe('run');
    expect(names(followed).at(-1)).toBe('done');
    expect(names(followed)).toContain('flower');
    await waitFor(async () => (await runs.get(runId))?.status === 'done');
    expect((await runs.get(runId))?.flower?.spec_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test('a chat with run_id continues the run: same id, earlier messages kept', async () => {
    const llm = scriptedLlm([{ content: 'first answer' }, { content: 'second answer' }]);
    const { app } = setup({ llm });
    const one = parseSse(await (await chat(app)).text());
    const { run_id } = data<{ run_id: string }>(one, 'run');
    const two = parseSse(
      await (await chat(app, { messages: [{ role: 'user', content: 'and now?' }], run_id })).text(),
    );
    expect(data<{ run_id: string }>(two, 'run').run_id).toBe(run_id);
    expect(llm.requests[1]?.messages.slice(1)).toEqual([
      { role: 'user', content: QUESTION.messages[0]?.content },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'and now?' },
    ]);
    const run = (await (await app.request(`/api/v1/agent/runs/${run_id}`)).json()) as Run;
    expect(run.status).toBe('done');
    expect(run.messages.map((m) => m.content)).toEqual([
      QUESTION.messages[0]?.content,
      'first answer',
      'and now?',
      'second answer',
    ]);
    expect(run.events.filter((e) => e.event === 'run')).toHaveLength(2);
  });

  test('a run that is still going cannot take a second chat', async () => {
    const { app } = setup({ llm: slowRecorded(40) });
    const res = await chat(app);
    const reader = res.body?.getReader();
    const first = await reader?.read();
    const runId = runIdOf(parseSse(new TextDecoder().decode(first?.value)));
    const busy = await chat(app, { messages: [{ role: 'user', content: 'x' }], run_id: runId });
    expect(busy.status).toBe(400);
    expect((await bodyOf(busy)).error.hint).toMatch(/GET \/api\/v1\/agent\/runs\//);
    await reader?.cancel();
  });

  test('unknown and malformed run ids', async () => {
    const { app } = setup({ llm: scriptedLlm([]) });
    expect((await app.request('/api/v1/agent/runs/nosuchrun1')).status).toBe(404);
    expect((await app.request('/api/v1/agent/runs/a.b')).status).toBe(400);
  });
});

describe('GET /api/v1/attestations/:sha256', () => {
  test('serves the stored report byte for byte, and its SHA-256 matches report_sha256', async () => {
    const { app, fake } = setup();
    const es = parseSse(await (await chat(app)).text());
    const { report_sha256, report_url } = data<{
      attestation: { report_sha256: string; report_url: string };
    }>(es, 'signature').attestation;
    const res = await app.request(report_url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('cache-control')).toMatch(/immutable/);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes).toEqual(fake.report);
    expect(sha256Hex(bytes)).toBe(report_sha256);
  });

  test('404 for an unknown report, 400 for a malformed hash', async () => {
    const { app } = setup({ llm: scriptedLlm([]) });
    const missing = await app.request(`/api/v1/attestations/${'0'.repeat(64)}`);
    expect(missing.status).toBe(404);
    expect((await bodyOf(missing)).error.code).toBe('not_found');
    expect((await app.request('/api/v1/attestations/xyz')).status).toBe(400);
  });
});

test('agentRoutes, the contract form, mounts the same routes', async () => {
  const root = tmpRoot();
  const app = agentRoutes({
    tools: fakeContext(root),
    llm: scriptedLlm([{ content: 'hello' }]),
    budget: DEFAULT_BUDGET,
    runs: fileRunStore(join(root, '.petal', 'runs')),
  });
  const es = parseSse(await (await chat(app)).text());
  expect(names(es)).toEqual(['run', 'stage', 'message', 'done']);
});
