// A public site (PETAL_PUBLIC=1). Since 9 Nov (TGT-030, amended) it runs Petals' own agent on NEAR AI, for a
// person who pays for it in NEAR or holds an invite (pay.test.ts walks the paying). Health says the agent
// is gated and the model up, a stranger's chat is refused before anything is read or spent, and nothing
// leaves the process for either.
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
    // never reached: nobody here pays, so no call is made with it
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
  return buildPetalApp(cfg, {
    env: { PETAL_AGENT_ACCESS: 'gated', PETAL_WALLET_KEY: 'ab'.repeat(32), NODE_ENV: 'production' },
  });
}

test('health says the agent is gated and the model up, and reads no chain to say so', async () => {
  const health = (await (await site().request('/api/v1/health')).json()) as Out;
  expect(health).toMatchObject({ agent_access: 'gated', llm: 'up', map: 'held', public: true });
  expect(outside).toEqual([]);
});

test('a stranger’s chat is refused before anything is read or spent, with the way to bring your own agent', async () => {
  const res = await site().request('/api/v1/agent/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://petals.example' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'who holds NEAR?' }] }),
  });
  expect(res.status).toBe(403);
  expect(((await res.json()) as Out).error).toMatchObject({
    code: 'invite_required',
    hint: expect.stringContaining('/docs/connect-your-agent'),
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
