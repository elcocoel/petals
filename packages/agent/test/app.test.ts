// T058: petalApp = httpApp(ctx) + agentRoutes. @petal/tools is still stubs while W4 builds it, so
// its exported interface (registry, createContext, httpApp) is replaced by a stand-in here.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stateStore } from '@petal/store';
import type { Config } from '@petal/tools';
import { describe, expect, test, vi } from 'vitest';
import { buildPetalApp, llmHealth } from '../src/app.ts';
import { petalApp } from '../src/index.ts';
import { HAND_TRANSCRIPT, recordedClient } from '../src/recorded.ts';
import { LEDGER_DOWN, SKILL_HINT } from '../src/run.ts';
import { fileRunStore } from '../src/runs.ts';
import { configFromEnv } from '../src/serve.ts';
import { agreed, bodyOf, fakeNearAi, inOrder, parseSse, runIdOf, tmpRoot } from './helpers.ts';

vi.mock('@petal/tools', async (importOriginal) => {
  const { Hono } = await import('hono');
  const { fakeRegistry, fakeContext } = await import('./helpers.ts');
  return {
    ...(await importOriginal<typeof import('@petal/tools')>()),
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
      messages: agreed('who stands behind NEAR’s validators?'),
    }),
  });

/** These tests are about the model and the store, not who may ask: T196 has its own. */
const OPEN = { PETAL_AGENT_ACCESS: 'open', NODE_ENV: 'test' };

describe('petalApp', () => {
  test('with no key: the tool routes, and the agent replaying the recorded run', async () => {
    const root = tmpRoot();
    const app = petalApp({ root });
    const health = await app.request('/api/v1/health');
    expect(await health.json()).toEqual({
      ok: true,
      map: 'mirror',
      llm: 'recorded',
      agent_access: 'gated',
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
    expect(existsSync(join(root, '.petal', 'private.db'))).toBe(true);
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
      {
        nearAi: { fetch: fake.fetch, baseURL: 'https://near-ai.test/v1', signatureDelaysMs: [0] },
        env: OPEN,
      },
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
    expect(existsSync(join(stateDir, 'private.db'))).toBe(true);
    expect(fake.log.every((l) => l.url.host === 'near-ai.test')).toBe(true);
  });

  // The state folder sits under a file: it can't be made, whoever runs this.
  const unwritable = () => {
    const root = tmpRoot();
    writeFileSync(join(root, 'a-file'), '');
    return { root, stateDir: join(root, 'a-file', 'state') };
  };

  test('no writable state folder, no key: it starts, says so in one line, and the recorded chat works', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const app = petalApp(unwritable());
    expect(warn.mock.calls.filter(([l]) => /in memory/.test(String(l)))).toHaveLength(1);
    warn.mockRestore();
    expect((await bodyOf(app.request('/api/v1/health'))).llm).toBe('recorded');
    const es = parseSse(await (await chat(app)).text());
    expect(es.map((e) => e.event)).toContain('flower');
    expect(es.filter((e) => e.event === 'error')).toEqual([]);
    expect(es.at(-1)?.data).toMatchObject({ model: 'recorded' });
    // the run is kept for as long as this process lives
    const runId = runIdOf(es);
    expect((await bodyOf(app.request(`/api/v1/agent/runs/${runId}`))).status).toBe('done');
  });

  test('no writable state folder, with a key: it refuses to spend, because memory can’t hold a cap', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fake = fakeNearAi();
    const app = buildPetalApp(
      { ...unwritable(), nearAiApiKey: 'sk-test', llmDailyUsd: 1 },
      {
        nearAi: { fetch: fake.fetch, baseURL: 'https://near-ai.test/v1', signatureDelaysMs: [0] },
        env: OPEN,
      },
    );
    warn.mockRestore();
    const es = parseSse(await (await chat(app)).text());
    expect(fake.log).toEqual([]);
    expect(es.filter((e) => e.event === 'error').map((e) => e.data)).toEqual([
      { code: 'internal', message: LEDGER_DOWN, hint: SKILL_HINT },
    ]);
    expect(es.at(-1)?.event).toBe('done');
    expect(error.mock.calls.flat().join()).toMatch(/spend ledger failed/);
    error.mockRestore();
  });

  test('the store dies while the server is up: no model call, the API’s own plain error, tools still answer', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const root = tmpRoot();
    const stateDir = join(root, 'state');
    const fake = fakeNearAi();
    const app = buildPetalApp(
      { root, stateDir, nearAiApiKey: 'sk-test', llmDailyUsd: 1 },
      {
        nearAi: { fetch: fake.fetch, baseURL: 'https://near-ai.test/v1', signatureDelaysMs: [0] },
        env: OPEN,
      },
    );
    stateStore(stateDir).close();
    const res = await chat(app);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      error: { code: 'internal', message: expect.stringMatching(/can't reach its records/) },
      tools_version: 'tools/v1',
    });
    expect(fake.log).toEqual([]);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
    expect((await app.request('/api/v1/health')).status).toBe(200);
    expect((await bodyOf(app.request('/api/v1/networks'))).networks).toHaveLength(1);
  });

  test('the first boot brings the old state over; the old files stay', async () => {
    const root = tmpRoot();
    const stateDir = join(root, 'state');
    const old = fileRunStore(join(stateDir, 'runs'));
    const id = await old.create({ messages: [{ role: 'user', content: 'q' }] });
    await old.append(id, { event: 'message', data: { text: 'from before' } });
    const today = new Date().toISOString().slice(0, 10);
    const ledgerFile = join(stateDir, 'llm-ledger.json');
    writeFileSync(ledgerFile, JSON.stringify({ day: today, usd: 0.5 }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fake = fakeNearAi();
    const app = buildPetalApp(
      { root, stateDir, nearAiApiKey: 'sk-test', llmDailyUsd: 0.5 },
      {
        nearAi: { fetch: fake.fetch, baseURL: 'https://near-ai.test/v1', signatureDelaysMs: [0] },
        env: OPEN,
      },
    );
    // the start's work is done before the first answer
    await app.request('/api/v1/health');
    expect(log.mock.calls.flat().join()).toMatch(/imported 1 runs/);
    log.mockRestore();
    const stored = await bodyOf(app.request(`/api/v1/agent/runs/${id}`));
    expect(stored.messages).toHaveLength(2);
    expect(existsSync(join(stateDir, 'runs', `${id}.json`))).toBe(true);
    expect(readFileSync(ledgerFile, 'utf8')).toContain('0.5');
    // the day's spend came over with it: the cap is already reached, so no model call
    const es = parseSse(await (await chat(app)).text());
    expect(fake.log).toEqual([]);
    expect(
      es.filter((e) => e.event === 'error').map((e) => (e.data as { code: string }).code),
    ).toEqual(['budget_exhausted']);
    stateStore(stateDir).close();
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
