// T072: the live end-to-end run, `PETAL_LIVE=1 pnpm test:e2e`. Skipped unless PETAL_LIVE=1.
// NEAR AI Cloud for the agent, the testnet shared map, the live House of Stake read and a live
// 1Click dry quote (no money moves, FR-031). Nothing here signs: publishing with a wallet is T073,
// so this stops at prepare_publish and its sign_url.
//
// The keys come from the environment only; this file never reads ../.secrets/. For example:
//   set -a; source ../.secrets/near-ai.env; set +a
//   PETAL_LIVE=1 PETAL_WRITER_KEY_FILE=../.secrets/petal-writer.testnet.json pnpm test:e2e
// The map defaults to testnet (petals.testnet, petals-writer.testnet) when no PETAL_MAP_* is set.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { petalApp } from '@petal/agent';
import type { FlowerResult, ModelSignature } from '@petal/core/types';
import { fastDataReader, mapKeys } from '@petal/near/map';
import { configFromEnv } from '@petal/tools';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  entryDraft,
  inOrder,
  longestGap,
  REPO,
  readSse,
  type TimedEvent,
  unbacked,
} from './helpers.ts';

const LIVE = process.env.PETAL_LIVE === '1';
const QUESTION = 'who stands behind NEAR’s validators?';
const CHAT_MS = 120_000;
const GAP_MS = 10_000;

type Json = Record<string, unknown>;

describe.skipIf(!LIVE)('quickstart, live (PETAL_LIVE=1)', () => {
  let tmp: string;
  let app: ReturnType<typeof petalApp>;
  const env = { ...process.env };
  if (!env.PETAL_MAP_NETWORK && !env.PETAL_MAP_RECEIVER) env.PETAL_MAP_NETWORK = 'testnet';

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'petal-e2e-live-'));
    // a fresh state folder: an empty cache, so House of Stake is really fetched
    app = petalApp({ ...configFromEnv(env, REPO), stateDir: join(tmp, 'state'), live: true });
  });
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  async function call(path: string, body?: unknown): Promise<{ status: number; json: Json }> {
    const init =
      body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          };
    const res = await app.request(path, init);
    return { status: res.status, json: (await res.json()) as Json };
  }

  const chat: { events: TimedEvent[]; flower?: FlowerResult; proposeArgs?: Json } = {
    events: [],
  };

  test('the live environment is set (a key for the agent, a writer key for the map)', () => {
    const missing = ['NEAR_AI_API_KEY', 'PETAL_WRITER_KEY_FILE'].filter((k) => !env[k]?.trim());
    expect(missing, `PETAL_LIVE=1 needs ${missing.join(', ')} (see the top of this file)`).toEqual(
      [],
    );
  });

  test('health: the agent and the testnet map are up', async () => {
    const { status, json } = await call('/api/v1/health');
    expect(status).toBe(200);
    expect(json).toMatchObject({ ok: true, llm: 'up', map: 'up' });
  });

  test('step 2: the chat ends within 120 s, no gap over 10 s, signed by the model', {
    timeout: CHAT_MS + 30_000,
  }, async () => {
    const sent = Date.now();
    const res = await app.request('/api/v1/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: QUESTION }] }),
    });
    expect(res.status).toBe(200);
    const events = await readSse(res, sent);
    chat.events = events;
    const names = events.map((e) => e.event);

    expect(names[0]).toBe('run');
    expect(names.at(-1)).toBe('done');
    expect(names).not.toContain('error');
    expect(events.at(-1)?.at).toBeLessThanOrEqual(CHAT_MS);
    expect(longestGap(events)).toBeLessThanOrEqual(GAP_MS);
    expect(inOrder(names, ['run', 'tool_call', 'tool_result', 'flower', 'done'])).toBe(true);
    const done = events.at(-1)?.data as { model: string };
    expect(done.model).not.toBe('recorded');

    const calls = events
      .filter((e) => e.event === 'tool_call')
      .map((e) => e.data as { name: string; args: Json });
    const used = new Set(calls.map((c) => c.name));
    for (const name of ['get_snapshot', 'propose_spec', 'validate_spec', 'render_flower'])
      expect(used, name).toContain(name);
    expect(used.has('describe_snapshot') || used.has('compute_figures')).toBe(true);
    const propose = calls.filter((c) => c.name === 'propose_spec').at(-1);
    expect(propose?.args).toMatchObject({ choices: { segments: 'backers' } });
    chat.proposeArgs = propose?.args;

    const flower = events.findLast((e) => e.event === 'flower')?.data as FlowerResult;
    chat.flower = flower;
    expect(flower.validation).toMatchObject({ valid: true });
    expect(flower.interpretation.unknowns.length).toBeGreaterThan(0);

    // step 2.6: a model signature from the TEE, for the completion that proposed the spec
    const sig = events.find((e) => e.event === 'signature')?.data as ModelSignature | undefined;
    expect(sig).toMatchObject({ provider: 'near-ai-cloud', signature_kind: 'provider_tee' });
    expect(sig?.signing_address).toBeTruthy();
  });

  test('step 2.5: every number in the answer comes from compute_figures or describe_snapshot', async () => {
    const calls = chat.events
      .filter((e) => e.event === 'tool_call')
      .map((e) => e.data as { name: string; args: Json });
    // the agent's own calls, made again: both tools are deterministic
    const outputs: unknown[] = [];
    for (const c of calls) {
      if (c.name === 'compute_figures') outputs.push((await call('/api/v1/figures', c.args)).json);
      if (c.name === 'describe_snapshot') {
        const top = c.args.top === undefined ? '' : `?top=${c.args.top}`;
        outputs.push((await call(`/api/v1/snapshots/${c.args.sha256}/describe${top}`)).json);
      }
    }
    const answer = chat.events
      .filter((e) => e.event === 'message')
      .map((e) => (e.data as { text: string }).text)
      .join('\n');
    expect(answer.length).toBeGreaterThan(0);
    expect(unbacked(answer, outputs)).toEqual([]);
  });

  test('step 3: prepare_publish hands back a sign_url (signing is T073)', async () => {
    const flower = chat.flower as FlowerResult;
    const done = chat.events.at(-1)?.data as { model: string };
    const sig = chat.events.find((e) => e.event === 'signature')?.data as ModelSignature;
    const draft = entryDraft(flower, {
      title: QUESTION,
      model: done.model,
      signature: sig ?? null,
      created_at: new Date().toISOString(),
    });
    const { status, json } = await call('/api/v1/publish/prepare', { entry: draft });
    expect(status).toBe(200);
    expect(json.recipient).toBeTruthy();
    expect(json.sign_url).toMatch(/\/publish\/[0-9a-f]{64}\?nonce=/);
  });

  test('step 1: the gallery reads the testnet map', async () => {
    const { status, json } = await call('/api/v1/flowers');
    expect(status).toBe(200);
    for (const f of json.flowers as { where: string }[])
      expect(['map', 'fixture']).toContain(f.where);
  });

  test('step 3.5: House of Stake is fetched live (reused: false), then reused in under 1 s', {
    timeout: 150_000,
  }, async () => {
    const t0 = performance.now();
    const first = await call('/api/v1/snapshots', { network: 'near-house-of-stake' });
    const fetchMs = performance.now() - t0;
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({ reused: false, where: 'fetched' });
    // about 10 s on dRPC (research); the test only bounds it
    expect(fetchMs).toBeLessThan(60_000);

    const t1 = performance.now();
    const second = await call('/api/v1/snapshots', { network: 'near-house-of-stake' });
    expect(second.json).toMatchObject({ sha256: first.json.sha256, reused: true });
    expect(performance.now() - t1).toBeLessThan(1000);

    // the fingerprint and the index key went to the testnet map: read them back directly
    // (what `curl kv.test.fastnear.com/v0/latest/...` does), allowing 30 s for indexing
    const m = configFromEnv(env, REPO).map;
    expect(m?.writer).toBeTruthy();
    const reader = fastDataReader({
      network: m?.network ?? 'testnet',
      receiver: m?.receiver ?? '',
    });
    const sha = first.json.sha256 as string;
    const block = (first.json.snapshot as { block_height: number }).block_height;
    const keys = [mapKeys.snapshot(sha), mapKeys.index('near:mainnet', 'house-of-stake', block)];
    for (const key of keys) {
      let row = null;
      for (let i = 0; i < 15 && !row; i++) {
        row = await reader.get(key, m?.writer as string);
        if (!row) await new Promise((r) => setTimeout(r, 2000));
      }
      expect(row, key).not.toBeNull();
    }
  });

  test('step 4: the MCP door gives the same spec_sha256', { timeout: 60_000 }, async () => {
    const transport = new StdioClientTransport({
      command: 'pnpm',
      args: ['-s', '--dir', REPO, 'petal', 'mcp'],
      env: getDefaultEnvironment(),
      stderr: 'pipe',
    });
    const client = new Client({ name: 'petal-e2e-live', version: '1' });
    await client.connect(transport);
    try {
      const r = await client.callTool({ name: 'propose_spec', arguments: chat.proposeArgs ?? {} });
      expect(r.isError ?? false).toBe(false);
      expect((r.structuredContent as Json).spec_sha256).toBe(chat.flower?.spec_sha256);
    } finally {
      await client.close();
    }
  });

  test('step 5: a live 1Click quote, dry', { timeout: 30_000 }, async () => {
    const { status, json } = await call('/api/v1/quote', {
      purpose: 'sponsor_refresh',
      amount_usd: 1,
    });
    expect(status).toBe(200);
    expect(json).toMatchObject({ dry: true, note: 'Dry quote. Paying is not switched on.' });
    expect(Number(json.amount_in_usd)).toBeGreaterThan(0.99);
    expect(Number(json.amount_in_usd)).toBeLessThan(1.1);
    expect(JSON.stringify(json)).not.toMatch(/deposit_?address/i);
  });
});
