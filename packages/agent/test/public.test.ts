// A public site (PETAL_PUBLIC=1) runs no agent for anyone: each person's own Claude Code, Codex or Hermes
// does the work on their machine. Health says agent_access none, a chat is refused before anything is
// read, and a model key in the config is never used. Nothing leaves the process.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from '@petal/tools';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { buildPetalApp } from '../src/app.ts';

// biome-ignore lint/suspicious/noExplicitAny: reading JSON answers
type Out = Record<string, any>;

const REPO = fileURLToPath(new URL('../../../', import.meta.url));

let outside: string[];
beforeEach(() => {
  outside = [];
  vi.stubGlobal('fetch', async (u: unknown) => {
    outside.push(String(u instanceof Request ? u.url : u));
    throw new Error('a public site called out');
  });
});
afterEach(() => vi.unstubAllGlobals());

function site() {
  const cfg: Config = {
    root: REPO,
    stateDir: mkdtempSync(join(tmpdir(), 'petal-public-agent-')),
    public: true,
    // a key that reached the config anyway: a public site never builds a model client with it
    nearAiApiKey: 'sk-never-used',
    llmDailyUsd: 5,
    map: {
      network: 'testnet',
      receiver: 'petals.testnet',
      writer: 'petals-writer.testnet',
      trustedWriters: ['petals-writer.testnet'],
    },
    apiBase: 'https://petals.example',
  };
  return buildPetalApp(cfg, { env: { PETAL_AGENT_ACCESS: 'gated', NODE_ENV: 'production' } });
}

test('health says there is no agent and no model, and reads no chain to say so', async () => {
  const health = (await (await site().request('/api/v1/health')).json()) as Out;
  expect(health).toMatchObject({ agent_access: 'none', llm: 'none', map: 'held', public: true });
  expect(outside).toEqual([]);
});

test('a chat is refused, with the way to bring your own agent', async () => {
  const res = await site().request('/api/v1/agent/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'who holds NEAR?' }] }),
  });
  expect(res.status).toBe(403);
  expect(((await res.json()) as Out).error).toMatchObject({
    code: 'not_on_this_site',
    hint: expect.stringContaining('/connect'),
  });
  expect(outside).toEqual([]);
});

test('sign-in still hands out a challenge for this site', async () => {
  const res = await site().request('/api/v1/auth/challenge', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://petals.example' },
    body: '{}',
  });
  expect(res.status).toBe(200);
  expect(((await res.json()) as Out).recipient).toBe('petals.example');
  expect(outside).toEqual([]);
});
