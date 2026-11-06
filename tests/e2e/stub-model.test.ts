// A person's first question on the stub model, through the real NEAR AI client and the real tools: what
// journey-server.ts shows in a browser, without one. A new map waits for a yes (J4), so the stub has to
// be able to ask, then replay. $0: nothing leaves this machine.
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPetalApp } from '@petal/agent';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { REPO, readSse } from './helpers.ts';
import { stubModel } from './stub-model.ts';

const stub = stubModel();
let server: Server;
let stateDir: string;
let app: ReturnType<typeof buildPetalApp>;

beforeAll(async () => {
  server = createServer((req, res) => stub.handle(req, res));
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  stateDir = mkdtempSync(join(tmpdir(), 'petal-stub-model-'));
  app = buildPetalApp(
    { root: REPO, stateDir, nearAiApiKey: 'stub', llmDailyUsd: 1, map: null },
    {
      nearAi: {
        baseURL: `http://127.0.0.1:${port}/v1`,
        signatureDelaysMs: [0],
        attestationsDir: join(stateDir, 'attestations'),
      },
      env: { NODE_ENV: 'test', PETAL_AGENT_ACCESS: 'open' },
    },
  );
});

afterAll(() => {
  server.close();
  rmSync(stateDir, { recursive: true, force: true });
});

/** A run belongs to the session that started it, so this keeps its cookie, as a browser would. */
let cookie = '';

async function say(content: string, run_id?: string) {
  const sent = Date.now();
  const res = await app.request('/api/v1/agent/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ messages: [{ role: 'user', content }], ...(run_id ? { run_id } : {}) }),
  });
  cookie = res.headers.get('set-cookie')?.split(';')[0] ?? cookie;
  return readSse(res, sent);
}

test('the first question asks, and the yes draws the flower', async () => {
  const first = await say('Who stands behind NEAR’s validators?');
  const names = first.map((e) => e.event);
  expect(names).toContain('approval_required');
  expect(names).not.toContain('flower');
  expect(names).not.toContain('error');
  expect(names.at(-1)).toBe('done');
  const asked = first.findLast((e) => e.event === 'message')?.data as { text: string } | undefined;
  expect(asked?.text).toMatch(/yes or no/i);

  const run = first[0]?.data as { run_id: string } | undefined;
  const second = await say('yes', run?.run_id);
  expect(second.map((e) => e.event)).toContain('flower');
  expect(second.map((e) => e.event)).not.toContain('approval_required');
  expect(second.map((e) => e.event)).not.toContain('error');
});

test("its token counts are sized to what it's sent, so a composer's figures move", async () => {
  const events = await say('Who stands behind NEAR’s validators?');
  const done = events.findLast((e) => e.event === 'done')?.data as {
    tokens: { in: number };
    context_tokens: number;
  };
  expect(done.context_tokens).toBeGreaterThan(1000);
  expect(done.tokens.in).toBeGreaterThanOrEqual(done.context_tokens);
});

test("it refuses reasoning_effort on Anthropic's models, as NEAR AI does", async () => {
  const { port } = server.address() as AddressInfo;
  const ask = (model: string, reasoning_effort?: string) =>
    fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      body: JSON.stringify({
        model,
        messages: [],
        ...(reasoning_effort ? { reasoning_effort } : {}),
      }),
    }).then((r) => r.status);
  expect(await ask('anthropic/claude-haiku-5-5', 'low')).toBe(400);
  expect(await ask('anthropic/claude-haiku-5-5')).toBe(200);
  expect(await ask('z-ai/glm-5.3-flash', 'low')).toBe(200);
});
