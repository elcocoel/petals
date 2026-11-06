// T300, findings 1 to 3 on the agent's own routes: the same address helper, the same body limit, and
// the data budget on what a stranger can write here.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fakeRpc, implicitSigner } from '@petal/near/auth/testing';
import { describe, expect, test } from 'vitest';
import { buildPetalApp } from '../../src/app.ts';
import { limiter } from '../../src/routes.ts';
import { fakeRegistry, scriptedLlm, tmpRoot } from '../helpers.ts';

const SITE = 'https://petals.example';
const WALLET_KEY = 'a'.repeat(64);
const QUESTION = { messages: [{ role: 'user', content: 'who?' }] };
const random = () => Array.from({ length: 4 }, () => Math.floor(Math.random() * 250)).join('.');

function setup(
  o: {
    apiBase?: string;
    access?: string;
    limits?: Record<string, number>;
    recorded?: boolean;
  } = {},
) {
  const root = tmpRoot();
  const stateDir = join(root, 'state');
  const app = buildPetalApp(
    {
      root,
      stateDir,
      apiBase: o.apiBase ?? SITE,
      llmDailyUsd: 1,
      ...(o.limits ? { limits: o.limits } : {}),
    } as never,
    {
      ...(o.recorded
        ? {}
        : { llm: scriptedLlm(Array(50).fill({ content: 'hi' }), { costUsd: 0.001 }) }),
      rpcFor: () => fakeRpc({}),
      registry: fakeRegistry().registry,
      env: {
        PETAL_AGENT_ACCESS: o.access ?? 'gated',
        PETAL_WALLET_KEY: WALLET_KEY,
        NODE_ENV: 'test',
      },
    },
  );
  return { app, stateDir };
}

const chat = (
  app: ReturnType<typeof setup>['app'],
  headers: Record<string, string> = {},
  body: unknown = QUESTION,
) =>
  app.request('/api/v1/agent/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      origin: SITE,
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('spoofing the address', () => {
  test('a new x-forwarded-for per chat gets no fresh limit', async () => {
    const { app } = setup({ access: 'open' });
    const seen: number[] = [];
    for (let i = 0; i < 11; i++)
      seen.push((await chat(app, { 'x-forwarded-for': random() })).status);
    expect(seen.slice(0, 10).every((s) => s === 202)).toBe(true);
    expect(seen[10]).toBe(429);
  });

  test('a new x-real-ip per auth POST gets no fresh limit', async () => {
    const { app } = setup();
    let last = 0;
    for (let i = 0; i < 31; i++) {
      const res = await app.request('/api/v1/auth/challenge', {
        method: 'POST',
        headers: { origin: SITE, 'x-real-ip': random(), 'x-forwarded-for': random() },
      });
      last = res.status;
    }
    expect(last).toBe(429);
  });

  test('cf-connecting-ip is the one name for a caller', async () => {
    const { app } = setup({ access: 'open' });
    const seen: number[] = [];
    for (let i = 0; i < 11; i++)
      seen.push((await chat(app, { 'cf-connecting-ip': '198.51.100.3' })).status);
    expect(seen[10]).toBe(429);
    expect((await chat(app, { 'cf-connecting-ip': '198.51.100.4' })).status).toBe(202);
  });

  test('the limiter’s memory has an end, and a request never scans it', () => {
    let scans = 0;
    class Watched<K, V> extends Map<K, V> {
      override [Symbol.iterator]() {
        scans++;
        return super[Symbol.iterator]();
      }
      override entries() {
        scans++;
        return super.entries();
      }
    }
    const hits = new Watched<string, number[]>();
    const limit = limiter(5, 60_000, () => 0, hits);
    for (let i = 0; i < 10_050; i++) limit(`k${i}`);
    expect(hits.size).toBeGreaterThan(0);
    expect(hits.size).toBeLessThanOrEqual(10_000);
    expect(scans).toBe(0);
  });
});

describe('body limit', () => {
  test('a chat may be larger than the rest, up to its own limit; say which', async () => {
    const { app } = setup({ access: 'open' });
    const padded = (n: number) => ({
      messages: Array.from({ length: Math.ceil(n / 19_000) }, () => ({
        role: 'user',
        content: 'x'.repeat(19_000),
      })),
    });
    expect((await chat(app, {}, padded(300 * 1024))).status).toBe(202);
    const huge = await chat(app, {}, padded(600 * 1024));
    expect(huge.status).toBe(400);
    expect(((await huge.json()) as { error: { message: string } }).error.message).toMatch(
      /512 KiB/,
    );
  });

  test('a stranger’s refused chat isn’t even parsed: the body limit and the invite come first', async () => {
    const { app } = setup({ access: 'gated' });
    const res = await chat(app, {}, 'not json at all');
    expect(res.status).toBe(403);
  });
});

describe('the data budget on the agent’s routes', () => {
  function over(stateDir: string) {
    mkdirSync(join(stateDir, 'cache'), { recursive: true });
    writeFileSync(join(stateDir, 'cache', 'big'), Buffer.alloc(2 * 1024 * 1024));
  }

  test('a chat with no sponsor writes nothing past it', async () => {
    const { app, stateDir } = setup({
      recorded: true,
      limits: { dataMaxMb: 1 },
      apiBase: 'http://localhost:3186',
    });
    over(stateDir);
    const res = await app.request('/api/v1/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(QUESTION),
    });
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('budget_exhausted');
  });

  test('a new wallet can’t add a person past it', async () => {
    const { app, stateDir } = setup({ limits: { dataMaxMb: 1 } });
    over(stateDir);
    const post = (path: string, json?: unknown) =>
      app.request(path, {
        method: 'POST',
        headers: { origin: SITE, 'content-type': 'application/json' },
        ...(json ? { body: JSON.stringify(json) } : {}),
      });
    const ch = (await (await post('/api/v1/auth/challenge')).json()) as {
      nonce: string;
      message: string;
      recipient: string;
    };
    const proof = implicitSigner('late-comer').sign({
      message: ch.message,
      nonce: ch.nonce,
      recipient: ch.recipient,
    });
    const res = await post('/api/v1/auth/verify', { network: 'testnet', proof });
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('budget_exhausted');
  });
});
