// T055: nearAiClient on a fake NEAR AI Cloud. Never the real one (no key in the build yet, T059).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { sha256Hex } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { nearAiClient } from '../src/index.ts';
import type { LlmMessage, LlmRequest } from '../src/llm.ts';
import {
  costUsd,
  createNearAiClient,
  DEFAULT_MODEL,
  FALLBACK_MODELS,
  LlmCallError,
  type NearAiOptions,
} from '../src/near-ai.ts';
import { fakeNearAi, SIGNER, tmpRoot } from './helpers.ts';

const CFG = {
  apiKeyEnv: 'NEAR_AI_API_KEY' as const,
  model: DEFAULT_MODEL,
  fallbacks: [...FALLBACK_MODELS],
};
const ASK: LlmRequest = {
  messages: [
    { role: 'system', content: 'You are Petal.' },
    { role: 'user', content: 'who stands behind NEAR’s validators?' },
  ],
  tools: [{ name: 'get_snapshot', description: 'snapshot', parameters: { type: 'object' } }],
};

function client(fake = fakeNearAi(), o: NearAiOptions = {}) {
  const dir = join(tmpRoot(), 'attestations');
  const warnings: string[] = [];
  const llm = createNearAiClient(CFG, {
    apiKey: 'sk-test',
    baseURL: 'https://near-ai.test/v1',
    fetch: fake.fetch,
    attestationsDir: dir,
    signatureDelaysMs: [0, 0, 0],
    onWarning: (w) => warnings.push(w),
    ...o,
  });
  return { llm, fake, dir, warnings };
}

const paths = (fake: ReturnType<typeof fakeNearAi>) =>
  fake.log.map((l) => `${l.method} ${l.url.pathname}`);

describe('nearAiClient', () => {
  test('one non-streamed call with the canonical id, x-no-aliasing and Accept-Encoding: identity', async () => {
    const { llm, fake } = client();
    expect(llm.kind).toBe('near-ai-cloud');
    expect(llm.model).toBe('z-ai/glm-5.3-flash');
    await llm.complete(ASK);
    const call = fake.log.find((l) => l.url.pathname.endsWith('/chat/completions'));
    expect(call?.method).toBe('POST');
    expect(call?.headers.get('x-no-aliasing')).toBe('true');
    expect(call?.headers.get('accept-encoding')).toBe('identity');
    expect(call?.headers.get('authorization')).toBe('Bearer sk-test');
    const body = JSON.parse(call?.body ?? '{}');
    expect(body).toMatchObject({ model: 'z-ai/glm-5.3-flash', stream: false, tool_choice: 'auto' });
    expect(body.tools[0]).toEqual({
      type: 'function',
      function: { name: 'get_snapshot', description: 'snapshot', parameters: { type: 'object' } },
    });
  });

  test('fetches the attestation report before the completion, the signature right after', async () => {
    const { llm, fake } = client();
    await llm.complete(ASK);
    expect(paths(fake)).toEqual([
      'GET /v1/attestation/report',
      'POST /v1/chat/completions',
      'GET /v1/signature/chatcmpl-1',
    ]);
  });

  test('signs over the exact request and response bytes, and keeps the report', async () => {
    const { llm, fake, dir, warnings } = client();
    const c = await llm.complete(ASK);
    const ex = fake.exchanges.get('chatcmpl-1');
    expect(ex).toBeDefined();
    const sig = c.signature;
    expect(sig).toMatchObject({
      provider: 'near-ai-cloud',
      model: 'z-ai/glm-5.3-flash',
      completion_id: 'chatcmpl-1',
      signature_kind: 'provider_tee',
      signing_address: SIGNER,
      signing_algo: 'ecdsa',
      request_sha256: sha256Hex(ex?.request ?? ''),
      response_sha256: sha256Hex(ex?.response ?? ''),
    });
    expect(sig?.text).toBe(`z-ai/glm-5.3-flash:${sig?.request_sha256}:${sig?.response_sha256}`);
    const sha = sha256Hex(fake.report);
    expect(sig?.attestation).toEqual({
      nonce: expect.stringMatching(/^[0-9a-f]{64}$/),
      report_sha256: sha,
      report_url: `/api/v1/attestations/${sha}`,
    });
    expect(existsSync(join(dir, `${sha}.json`))).toBe(true);
    expect(warnings).toEqual([]);
  });

  test('maps the answer: tool calls, usage and cost', async () => {
    const { llm } = client();
    const c = await llm.complete(ASK);
    expect(c.message.tool_calls).toEqual([
      {
        id: 'call_1',
        name: 'get_snapshot',
        arguments: JSON.stringify({ network: 'near-validators' }),
      },
    ]);
    expect(c.usage).toEqual({ in: 1000, out: 100 });
    expect(c.cost_usd).toBeCloseTo((1000 * 0.08 + 100 * 0.5) / 1e6, 12);
    expect(c.fallback_used).toBe(false);
    expect(costUsd('someone/unknown', { in: 1e6, out: 1e6 })).toBeCloseTo(1.65, 9);
  });

  test('sends tool calls and tool results back in OpenAI form', async () => {
    const { llm, fake } = client();
    const messages: LlmMessage[] = [
      ...ASK.messages,
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call_1', name: 'get_snapshot', arguments: '{"network":"near-validators"}' },
        ],
      },
      { role: 'tool', tool_call_id: 'call_1', content: JSON.stringify({ sha256: 'f'.repeat(64) }) },
    ];
    await llm.complete({ messages, tools: ASK.tools });
    const body = JSON.parse(fake.log.find((l) => l.body)?.body ?? '{}');
    expect(body.messages.slice(2)).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'get_snapshot', arguments: '{"network":"near-validators"}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'call_1', content: JSON.stringify({ sha256: 'f'.repeat(64) }) },
    ]);
  });

  test('falls back to Qwen when GLM fails, and keeps Qwen first for a while', async () => {
    const { llm, fake } = client(fakeNearAi({ fail: { 'z-ai/glm-5.3-flash': 503 } }));
    const c = await llm.complete(ASK);
    expect(c.model).toBe('Qwen/Qwen3.8-27B');
    expect(c.fallback_used).toBe(true);
    expect(c.signature?.model).toBe('Qwen/Qwen3.8-27B');
    fake.log.length = 0;
    await llm.complete(ASK);
    const asked = fake.log.filter((l) => l.body).map((l) => JSON.parse(l.body ?? '{}').model);
    expect(asked).toEqual(['Qwen/Qwen3.8-27B']);
  });

  test('then DeepSeek; when no model answers it is down, with source_failed', async () => {
    const all = {
      'z-ai/glm-5.3-flash': 500,
      'Qwen/Qwen3.8-27B': 502,
      'deepseek-ai/DeepSeek-V4.1-Flash-1017': 503,
    };
    const { llm, fake } = client(fakeNearAi({ fail: all }));
    const err = await llm.complete(ASK).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmCallError);
    expect((err as LlmCallError).code).toBe('source_failed');
    expect((err as LlmCallError).message).toMatch(/no model answered/);
    expect(llm.status()).toBe('down');
    const asked = fake.log.filter((l) => l.body).map((l) => JSON.parse(l.body ?? '{}').model);
    expect(asked).toEqual([
      'z-ai/glm-5.3-flash',
      'Qwen/Qwen3.8-27B',
      'deepseek-ai/DeepSeek-V4.1-Flash-1017',
    ]);
  });

  test('a refused key or no credits is not retried on another model', async () => {
    for (const [status, code] of [
      [401, 'source_failed'],
      [402, 'budget_exhausted'],
    ] as const) {
      const { llm, fake } = client(fakeNearAi({ fail: { 'z-ai/glm-5.3-flash': status } }));
      const err = (await llm.complete(ASK).catch((e: unknown) => e)) as LlmCallError;
      expect(err.code).toBe(code);
      expect(fake.log.filter((l) => l.body)).toHaveLength(1);
    }
  });

  test('a late signature is waited for; a missing one leaves signature null, not an error', async () => {
    const late = client(fakeNearAi({ signatureMisses: 2 }));
    expect((await late.llm.complete(ASK)).signature).not.toBeNull();
    const none = client(fakeNearAi({ noSignature: true }));
    const c = await none.llm.complete(ASK);
    expect(c.signature).toBeNull();
    expect(c.message.tool_calls?.[0]?.name).toBe('get_snapshot');
    expect(none.warnings.join(' ')).toMatch(/no signature for chatcmpl-1/);
  });

  test('without a report the signature still comes, without attestation', async () => {
    const { llm, warnings } = client(fakeNearAi({ reportStatus: 500 }));
    const c = await llm.complete(ASK);
    expect(c.signature).not.toBeNull();
    expect(c.signature).not.toHaveProperty('attestation');
    expect(warnings.join(' ')).toMatch(/no attestation report/);
  });

  test('reuses a fresh report across calls', async () => {
    const { llm, fake } = client();
    await llm.complete(ASK);
    await llm.complete(ASK);
    expect(paths(fake).filter((p) => p.endsWith('/attestation/report'))).toHaveLength(1);
  });

  test('with no key it fails before any request; the contract form reads NEAR_AI_API_KEY', async () => {
    const { llm, fake } = client(fakeNearAi(), { apiKey: '' });
    const saved = process.env.NEAR_AI_API_KEY;
    delete process.env.NEAR_AI_API_KEY;
    try {
      await expect(llm.complete(ASK)).rejects.toThrow(/NEAR_AI_API_KEY is not set/);
      expect(fake.log).toHaveLength(0);
      const plain = nearAiClient(CFG);
      expect(plain.kind).toBe('near-ai-cloud');
      await expect(plain.complete(ASK)).rejects.toThrow(/NEAR_AI_API_KEY is not set/);
    } finally {
      if (saved !== undefined) process.env.NEAR_AI_API_KEY = saved;
    }
  });
});
