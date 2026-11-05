// T058: petalApp = httpApp(ctx) + agentRoutes. @petal/tools is still stubs while W4 builds it, so
// its exported interface (registry, createContext, httpApp) is replaced by a stand-in here.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '@petal/tools';
import { describe, expect, test, vi } from 'vitest';
import { buildPetalApp, llmHealth } from '../src/app.ts';
import { petalApp } from '../src/index.ts';
import { HAND_TRANSCRIPT, recordedClient } from '../src/recorded.ts';
import { configFromEnv } from '../src/serve.ts';
import { bodyOf, fakeNearAi, inOrder, parseSse, runIdOf, tmpRoot } from './helpers.ts';

vi.mock('@petal/tools', async () => {
  const { Hono } = await import('hono');
  const { fakeRegistry, fakeContext } = await import('./helpers.ts');
  return {
    registry: fakeRegistry().registry,
    createContext: (cfg: Config) => ({ ...fakeContext(cfg.root), config: cfg }),
    httpApp: () => {
      const app = new Hono();
      app.get('/api/v1/health', (c) =>
        c.json({
          ok: true,
          map: 'mirror',
          llm: 'down',
          version: 'api/v1',
          tools_version: 'tools/v1',
        }),
      );
      app.get('/api/v1/networks', (c) =>
        c.json({ networks: [{ id: 'near-validators' }], tools_version: 'tools/v1' }),
      );
      return app;
    },
  };
});

const chat = (app: ReturnType<typeof petalApp>) =>
  app.request('/api/v1/agent/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'who stands behind NEAR’s validators?' }],
    }),
  });

describe('petalApp', () => {
  test('with no key: the tool routes, and the agent replaying the recorded run', async () => {
    const root = tmpRoot();
    const app = petalApp({ root });
    const health = await app.request('/api/v1/health');
    expect(await health.json()).toEqual({
      ok: true,
      map: 'mirror',
      llm: 'recorded',
      version: 'api/v1',
      tools_version: 'tools/v1',
    });
    expect((await bodyOf(app.request('/api/v1/networks'))).networks).toHaveLength(1);
    const es = parseSse(await (await chat(app)).text());
    const n = es.map((e) => e.event);
    expect(inOrder(n, ['run', 'stage', 'tool_call', 'tool_result', 'flower', 'done'])).toBe(true);
    expect(es.at(-1)?.data).toMatchObject({ model: 'recorded' });
    // the run is stored under the config's state dir
    const runId = runIdOf(es);
    const stored = await app.request(`/api/v1/agent/runs/${runId}`);
    expect((await bodyOf(stored)).status).toBe('done');
    expect(existsSync(join(root, '.petal', 'runs', `${runId}.json`))).toBe(true);
  });

  test('a key with cfg.fake still replays: fakes everywhere, never NEAR AI Cloud', async () => {
    const app = petalApp({ root: tmpRoot(), nearAiApiKey: 'sk-should-not-be-used', fake: true });
    expect((await bodyOf(app.request('/api/v1/health'))).llm).toBe('recorded');
  });

  test('with a key: NEAR AI Cloud (here faked), signed, reports kept in <stateDir>/attestations', async () => {
    const root = tmpRoot();
    const stateDir = join(root, 'state');
    const fake = fakeNearAi();
    const app = buildPetalApp(
      { root, stateDir, nearAiApiKey: 'sk-test', llmDailyUsd: 1 },
      { nearAi: { fetch: fake.fetch, baseURL: 'https://near-ai.test/v1', signatureDelaysMs: [0] } },
    );
    expect((await bodyOf(app.request('/api/v1/health'))).llm).toBe('up');
    const es = parseSse(await (await chat(app)).text());
    expect(
      inOrder(
        es.map((e) => e.event),
        ['run', 'flower', 'signature', 'done'],
      ),
    ).toBe(true);
    const sig = es.find((e) => e.event === 'signature')?.data as {
      attestation: { report_url: string };
    };
    const report = await app.request(sig.attestation.report_url);
    expect(new Uint8Array(await report.arrayBuffer())).toEqual(fake.report);
    expect(existsSync(join(stateDir, 'llm-ledger.json'))).toBe(true);
    expect(fake.log.every((l) => l.url.host === 'near-ai.test')).toBe(true);
  });

  test('llmHealth and configFromEnv', () => {
    expect(llmHealth(recordedClient(HAND_TRANSCRIPT))).toBe('recorded');
    const cfg = configFromEnv({ NEAR_AI_API_KEY: '', PETAL_LLM_DAILY_USD: '2.5' }, 8787);
    expect(cfg).toMatchObject({
      nearAiApiKey: undefined,
      llmDailyUsd: 2.5,
      apiBase: 'http://localhost:8787',
    });
    expect(existsSync(join(cfg.root, 'pnpm-workspace.yaml'))).toBe(true);
    expect(configFromEnv({ PETAL_LLM_DAILY_USD: 'x' }).llmDailyUsd).toBeUndefined();
  });
});
