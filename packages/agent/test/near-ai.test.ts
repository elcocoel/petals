// T055: nearAiClient on a fake NEAR AI Cloud. Never the real one (no key in the build yet, T059).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { sha256Hex } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { nearAiClient } from '../src/index.ts';
import type { LlmMessage, LlmRequest } from '../src/llm.ts';
import {
  chosenModel,
  costUsd,
  createNearAiClient,
  DEFAULT_MODEL,
  effortFor,
  FALLBACK_MODELS,
  LlmCallError,
  MAX_COMPLETION_TOKENS,
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

test('Stop aborts the model’s fetch, tries no fallback, and says nothing about the model', async () => {
  const ai: string[] = [];
  const hanging: typeof fetch = (url, init) => {
    if (!String(url).endsWith('/chat/completions')) {
      return Promise.resolve(new Response('{}', { status: 404 }));
    }
    ai.push(String(url));
    return new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('aborted', 'AbortError')),
      );
    });
  };
  const llm = createNearAiClient(CFG, {
    apiKey: 'sk-test',
    baseURL: 'https://near-ai.test/v1',
    fetch: hanging,
    attestationsDir: join(tmpRoot(), 'attestations'),
    signatureDelaysMs: [0],
  });
  const stop = new AbortController();
  const call = llm.complete(ASK, { signal: stop.signal });
  while (!ai.length) await new Promise((r) => setTimeout(r, 1));
  stop.abort();
  await expect(call).rejects.toMatchObject({ name: 'LlmCallError', costUsd: 0 });
  expect(ai).toHaveLength(1);
  expect(llm.status()).toBe('up');
});

describe('PETAL_MODEL (T168)', () => {
  test('it replaces the default; unset, empty or blank leaves the default', () => {
    expect(chosenModel({ PETAL_MODEL: ' z-ai/glm-5.3 ' })).toBe('z-ai/glm-5.3');
    expect(chosenModel({})).toBe(DEFAULT_MODEL);
    expect(chosenModel({ PETAL_MODEL: '' })).toBe(DEFAULT_MODEL);
    expect(chosenModel({ PETAL_MODEL: '  ' })).toBe(DEFAULT_MODEL);
  });

  const listed = (fake: ReturnType<typeof fakeNearAi>, model: string, pricing: object) => {
    const inner = fake.fetch;
    const fetch: typeof globalThis.fetch = async (url, init) =>
      String(url).endsWith('/models')
        ? new Response(JSON.stringify({ data: [{ id: model, pricing }] }))
        : inner(url, init);
    return { ...fake, fetch };
  };

  test('a model outside PRICES is counted at the price NEAR AI lists, asked once', async () => {
    const fake = listed(fakeNearAi(), 'anthropic/x', { input: 10, output: 50 });
    let asked = 0;
    const count: typeof fetch = async (u, i) => {
      if (String(u).endsWith('/models')) asked++;
      return fake.fetch(u, i);
    };
    const llm = createNearAiClient(
      { ...CFG, model: 'anthropic/x' },
      {
        apiKey: 'k',
        baseURL: 'https://near-ai.test/v1',
        fetch: count,
        attestationsDir: join(tmpRoot(), 'a'),
      },
    );
    const c = await llm.complete(ASK);
    await llm.complete(ASK);
    expect(c.model).toBe('anthropic/x');
    // 1000 in and 100 out, at $10 and $50 a million
    expect(c.cost_usd).toBeCloseTo(0.015, 9);
    expect(asked).toBe(1);
  });

  test('the default asks for no list, and what fails to list warns and uses the default rates', async () => {
    const { llm, fake } = client();
    await llm.complete(ASK);
    expect(paths(fake).some((p) => p.endsWith('/models'))).toBe(false);
    const warnings: string[] = [];
    const unknown = createNearAiClient(
      { ...CFG, model: 'nobody/x' },
      {
        apiKey: 'k',
        baseURL: 'https://near-ai.test/v1',
        fetch: fakeNearAi().fetch,
        attestationsDir: join(tmpRoot(), 'a'),
        onWarning: (w) => warnings.push(w),
      },
    );
    const c = await unknown.complete(ASK);
    expect(c.cost_usd).toBeCloseTo((1000 * 0.3 + 100 * 1.35) / 1e6, 9);
    expect(warnings.join(' ')).toMatch(/no price for nobody\/x/);
  });

  test('a model with no report gets one look for a signature, not the 2.5 s of retries', async () => {
    const fake = fakeNearAi({ reportStatus: 503, noSignature: true });
    const { llm } = client(fake, { signatureDelaysMs: [0, 0, 0] });
    const c = await llm.complete(ASK);
    expect(c.signature).toBeNull();
    expect(paths(fake).filter((p) => p.includes('/signature/'))).toHaveLength(1);
  });
});

describe('nearAiClient', () => {
  test('one non-streamed call with the canonical id, x-no-aliasing and Accept-Encoding: identity', async () => {
    const { llm, fake } = client();
    expect(llm.kind).toBe('near-ai-cloud');
    expect(llm.model).toBe('deepseek-ai/DeepSeek-V4.1-Flash-1017');
    await llm.complete(ASK);
    const call = fake.log.find((l) => l.url.pathname.endsWith('/chat/completions'));
    expect(call?.method).toBe('POST');
    expect(call?.headers.get('x-no-aliasing')).toBe('true');
    expect(call?.headers.get('accept-encoding')).toBe('identity');
    expect(call?.headers.get('authorization')).toBe('Bearer sk-test');
    const body = JSON.parse(call?.body ?? '{}');
    expect(body).toMatchObject({
      model: 'deepseek-ai/DeepSeek-V4.1-Flash-1017',
      stream: false,
      tool_choice: 'auto',
    });
    expect(body.tools[0]).toEqual({
      type: 'function',
      function: { name: 'get_snapshot', description: 'snapshot', parameters: { type: 'object' } },
    });
  });

  test('asks for a generous token limit and low reasoning, so reasoning never eats the answer', async () => {
    const { llm, fake } = client();
    await llm.complete(ASK);
    const call = fake.log.find((l) => l.url.pathname.endsWith('/chat/completions'));
    expect(JSON.parse(call?.body ?? '{}')).toMatchObject({
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      reasoning_effort: 'low',
    });
    expect(MAX_COMPLETION_TOKENS).toBeGreaterThanOrEqual(16_000);
  });

  test('reasoningEffort null leaves it to the model', async () => {
    const { llm, fake } = client(fakeNearAi(), { reasoningEffort: null });
    await llm.complete(ASK);
    const call = fake.log.find((l) => l.url.pathname.endsWith('/chat/completions'));
    expect(JSON.parse(call?.body ?? '{}')).not.toHaveProperty('reasoning_effort');
  });

  describe('reasoning_effort, by model, from the catalogue', () => {
    const askOf = (fake: ReturnType<typeof fakeNearAi>) =>
      fake.log
        .filter((l) => l.url.pathname.endsWith('/chat/completions'))
        .map((l) => JSON.parse(l.body ?? '{}') as Record<string, unknown>);
    const on = (
      model: string,
      fallbacks: string[],
      fake: ReturnType<typeof fakeNearAi>,
      o: NearAiOptions = {},
    ) =>
      createNearAiClient(
        { apiKeyEnv: 'NEAR_AI_API_KEY', model, fallbacks },
        {
          apiKey: 'sk-test',
          baseURL: 'https://near-ai.test/v1',
          fetch: fake.fetch,
          attestationsDir: join(tmpRoot(), 'attestations'),
          signatureDelaysMs: [0, 0, 0],
          ...o,
        },
      );

    test.each(['anthropic/claude-sonnet-5-5', 'anthropic/claude-haiku-5-5'])(
      '%s refuses it (HTTP 400), so it is never sent, whatever was asked for',
      async (model) => {
        const fake = fakeNearAi();
        await on(model, [], fake, { reasoningEffort: 'high' }).complete(ASK);
        expect(askOf(fake)[0]).not.toHaveProperty('reasoning_effort');
      },
    );

    test('a model the catalogue does not list gets none, because a 400 on every call is worse than slow', async () => {
      const fake = fakeNearAi();
      await on('anthropic/claude-opus-5-5', [], fake).complete(ASK);
      expect(askOf(fake)[0]).not.toHaveProperty('reasoning_effort');
    });

    test('unless a caller asks for it by name', async () => {
      const fake = fakeNearAi();
      await on('someone/unlisted', [], fake, { reasoningEffort: 'medium' }).complete(ASK);
      expect(askOf(fake)[0]).toMatchObject({ reasoning_effort: 'medium' });
    });

    test('a fallback is judged on its own: the first model gets it, the Anthropic one does not', async () => {
      const fake = fakeNearAi({ fail: { 'someone/unlisted': 503 } });
      await on('someone/unlisted', ['anthropic/claude-haiku-5-5'], fake, {
        reasoningEffort: 'medium',
      }).complete(ASK);
      const [first, second] = askOf(fake);
      expect(first).toMatchObject({ model: 'someone/unlisted', reasoning_effort: 'medium' });
      expect(second?.model).toBe('anthropic/claude-haiku-5-5');
      expect(second).not.toHaveProperty('reasoning_effort');
    });

    describe('a conversation’s pick (T371)', () => {
      const [GLM, QWEN] = FALLBACK_MODELS as [string, string];
      const HAIKU = 'anthropic/claude-haiku-5-5';
      const SONNET = 'anthropic/claude-sonnet-5-5';

      test('names the model and its effort, call by call, on the one client', async () => {
        const fake = fakeNearAi();
        const llm = on(DEFAULT_MODEL, [...FALLBACK_MODELS], fake);
        await llm.complete(ASK, { model: GLM, effort: 'high' });
        const answered = await llm.complete(ASK, { model: HAIKU, effort: null });
        await llm.complete(ASK);
        const [high, passed, own] = askOf(fake);
        expect(high).toMatchObject({ model: GLM, reasoning_effort: 'high' });
        expect(passed?.model).toBe(HAIKU);
        expect(passed).not.toHaveProperty('reasoning_effort');
        expect(own).toMatchObject({ model: DEFAULT_MODEL, reasoning_effort: 'low' });
        expect(answered).toMatchObject({ model: HAIKU, fallback_used: false });
      });

      test('a signed pick falls back only to signed models, and says so', async () => {
        const fake = fakeNearAi({ fail: { [GLM]: 503 } });
        const llm = on(DEFAULT_MODEL, [...FALLBACK_MODELS], fake);
        const c = await llm.complete(ASK, { model: GLM, effort: 'medium' });
        expect(c).toMatchObject({ model: QWEN, fallback_used: true });
        expect(askOf(fake).map((a) => a.model)).toEqual([GLM, QWEN]);
        expect(askOf(fake)[1]).toMatchObject({ reasoning_effort: 'medium' });
      });

      test('a signed model never becomes unsigned, even if the server’s own list says it may', async () => {
        const fake = fakeNearAi({ fail: { [DEFAULT_MODEL]: 503 } });
        const llm = on(DEFAULT_MODEL, [HAIKU], fake);
        await expect(llm.complete(ASK)).rejects.toBeInstanceOf(LlmCallError);
        expect(askOf(fake).map((a) => a.model)).toEqual([DEFAULT_MODEL]);
      });

      test('a passed-through pick with no fallback fails plainly, asking nothing else', async () => {
        const fake = fakeNearAi({ fail: { [HAIKU]: 503 } });
        const llm = on(DEFAULT_MODEL, [...FALLBACK_MODELS], fake);
        await expect(llm.complete(ASK, { model: HAIKU, effort: null })).rejects.toThrow(/503/);
        expect(askOf(fake).map((a) => a.model)).toEqual([HAIKU]);
        // and the server's own model isn't reported down for it
        expect(llm.status()).toBe('up');
      });

      test('the server’s own model on a passed-through PETAL_MODEL fails the same way', async () => {
        const fake = fakeNearAi({ fail: { [HAIKU]: 503 } });
        const llm = on(HAIKU, [...FALLBACK_MODELS], fake);
        await expect(llm.complete(ASK)).rejects.toThrow(/503/);
        expect(askOf(fake).map((a) => a.model)).toEqual([HAIKU]);
      });

      test('one pick’s trouble says nothing about another’s', async () => {
        const fake = fakeNearAi({ fail: { [GLM]: 503 } });
        const llm = on(DEFAULT_MODEL, [...FALLBACK_MODELS], fake);
        await llm.complete(ASK, { model: GLM, effort: 'low' });
        expect(await llm.complete(ASK)).toMatchObject({
          model: DEFAULT_MODEL,
          fallback_used: false,
        });
      });

      test('what it costs comes from the catalogue, not a guess', async () => {
        const fake = fakeNearAi();
        const c = await on(DEFAULT_MODEL, [], fake).complete(ASK, { model: SONNET, effort: null });
        expect(c.cost_usd).toBeCloseTo((c.usage.in * 2 + c.usage.out * 10) / 1e6, 9);
        expect(paths(fake)).not.toContain('GET /v1/models');
      });
    });

    test.each([
      ['deepseek-ai/DeepSeek-V4.1-Flash-1017', 'low'],
      ['z-ai/glm-5.3-flash', 'low'],
      ['Qwen/Qwen3.8-27B', 'low'],
      ['anthropic/claude-sonnet-5-5', null],
      ['someone/unlisted', null],
    ])('%s: %s', (model, effort) => {
      expect(effortFor(model)).toBe(effort);
    });
  });

  test('an answer cut off by the token limit moves to the next model, and its cost still counts', async () => {
    const fake = fakeNearAi({ truncate: [DEFAULT_MODEL] });
    const { llm } = client(fake);
    const c = await llm.complete(ASK);
    expect(c.model).toBe(FALLBACK_MODELS[0]);
    expect(c.fallback_used).toBe(true);
    const own = costUsd(FALLBACK_MODELS[0] as string, c.usage);
    expect(c.cost_usd).toBeCloseTo(own + costUsd(DEFAULT_MODEL, c.usage), 9);
  });

  test('cached input is counted at the cache-read rate NEAR AI bills it at', async () => {
    const { llm } = client(fakeNearAi({ cached: 900 }));
    const c = await llm.complete(ASK);
    expect(c.usage).toMatchObject({ in: 1000, out: 100, cached: 900 });
    // DeepSeek: 100 uncached at $0.30, 900 cached at $0.006, 100 out at $1.20, per million
    expect(c.cost_usd).toBeCloseTo((100 * 0.3 + 900 * 0.006 + 100 * 1.2) / 1e6, 9);
    expect(c.cost_usd).toBeLessThan(costUsd(DEFAULT_MODEL, { in: 1000, out: 100 }));
  });

  test('an attempt that timed out is counted at its input in full, not at the whole chat', async () => {
    const { llm } = client(fakeNearAi({ fail: { [DEFAULT_MODEL]: 504 } }));
    const c = await llm.complete(ASK);
    expect(c.model).toBe(FALLBACK_MODELS[0]);
    expect(c.cost_unknown).toBeUndefined();
    expect(c.cost_usd).toBeCloseTo(
      costUsd(FALLBACK_MODELS[0] as string, c.usage) + costUsd(DEFAULT_MODEL, { in: 1000, out: 0 }),
      9,
    );
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
      model: 'deepseek-ai/DeepSeek-V4.1-Flash-1017',
      completion_id: 'chatcmpl-1',
      signature_kind: 'provider_tee',
      signing_address: SIGNER,
      signing_algo: 'ecdsa',
      request_sha256: sha256Hex(ex?.request ?? ''),
      response_sha256: sha256Hex(ex?.response ?? ''),
    });
    expect(sig?.text).toBe(
      `deepseek-ai/DeepSeek-V4.1-Flash-1017:${sig?.request_sha256}:${sig?.response_sha256}`,
    );
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
    expect(c.cost_usd).toBeCloseTo((1000 * 0.3 + 100 * 1.2) / 1e6, 12);
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

  test('falls back to GLM when the default fails, and keeps GLM first for a while', async () => {
    const { llm, fake } = client(
      fakeNearAi({ fail: { 'deepseek-ai/DeepSeek-V4.1-Flash-1017': 503 } }),
    );
    const c = await llm.complete(ASK);
    expect(c.model).toBe('z-ai/glm-5.3-flash');
    expect(c.fallback_used).toBe(true);
    expect(c.signature?.model).toBe('z-ai/glm-5.3-flash');
    fake.log.length = 0;
    await llm.complete(ASK);
    const asked = fake.log.filter((l) => l.body).map((l) => JSON.parse(l.body ?? '{}').model);
    expect(asked).toEqual(['z-ai/glm-5.3-flash']);
  });

  test('then Qwen; when no model answers it is down, with source_failed', async () => {
    const all = {
      'deepseek-ai/DeepSeek-V4.1-Flash-1017': 500,
      'z-ai/glm-5.3-flash': 502,
      'Qwen/Qwen3.8-27B': 503,
    };
    const { llm, fake } = client(fakeNearAi({ fail: all }));
    const err = await llm.complete(ASK).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmCallError);
    expect((err as LlmCallError).code).toBe('source_failed');
    expect((err as LlmCallError).message).toMatch(/no model answered/);
    expect(llm.status()).toBe('down');
    const asked = fake.log.filter((l) => l.body).map((l) => JSON.parse(l.body ?? '{}').model);
    expect(asked).toEqual([
      'deepseek-ai/DeepSeek-V4.1-Flash-1017',
      'z-ai/glm-5.3-flash',
      'Qwen/Qwen3.8-27B',
    ]);
  });

  test('a refused key or no credits is not retried on another model', async () => {
    for (const [status, code] of [
      [401, 'source_failed'],
      [402, 'budget_exhausted'],
    ] as const) {
      const { llm, fake } = client(
        fakeNearAi({ fail: { 'deepseek-ai/DeepSeek-V4.1-Flash-1017': status } }),
      );
      const err = (await llm.complete(ASK).catch((e: unknown) => e)) as LlmCallError;
      expect(err.code).toBe(code);
      expect(fake.log.filter((l) => l.body)).toHaveLength(1);
    }
  });

  test('each kind of 402 says what it is, no figures, and no other model is tried', async () => {
    const said: Record<string, RegExp> = {
      api_key_limit_exceeded: /sponsored key .* spending limit/,
      insufficient_credits: /sponsor account is out/,
      no_credits: /sponsor account is out/,
      no_limit_configured: /sponsor account is out/,
      something_new: /refused to bill/,
    };
    for (const [failType, message] of Object.entries(said)) {
      const { llm, fake } = client(
        fakeNearAi({ fail: { 'deepseek-ai/DeepSeek-V4.1-Flash-1017': 402 }, failType }),
      );
      const err = (await llm.complete(ASK).catch((e: unknown) => e)) as LlmCallError;
      expect(err.code).toBe('budget_exhausted');
      expect(err.message).toMatch(message);
      expect(err.message).not.toMatch(/HTTP|402|is down/);
      expect(err.hint).toMatch(/\/connect/);
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
