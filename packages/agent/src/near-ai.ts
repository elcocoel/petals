// nearAiClient (T055; research R10): Petal's model client on NEAR AI Cloud, through the `openai`
// SDK at https://cloud-api.near.ai/v1. Every call is non-streamed, sent with the canonical model id,
// `x-no-aliasing: true` and `Accept-Encoding: identity`, so it can get a `provider_tee` signature.
// A capturing fetch keeps the exact request and response bytes and their SHA-256 (never
// re-serialised JSON). The model and its fallbacks come from the bake-off (T060, research R10).
// Never called in tests: they use faked HTTP.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex } from '@petal/core';
import type { ToolErrorCode } from '@petal/core/types';
import OpenAI, { APIError } from 'openai';
import { CONNECT_HINT } from './invites.ts';
import type { LlmClient, LlmCompletion, LlmMessage, LlmRequest, LlmToolCall } from './llm.ts';
import {
  type AttestationRef,
  type AttestationStore,
  attestationStore,
  buildSignature,
  checkSignature,
  fetchAttestation,
  fetchSignature,
  type NearAiHttp,
} from './signature.ts';

export const NEAR_AI_BASE_URL = 'https://cloud-api.near.ai/v1';
export const DEFAULT_MODEL = 'deepseek-ai/DeepSeek-V4.1-Flash-1017';
export const FALLBACK_MODELS: readonly string[] = ['z-ai/glm-5.3-flash', 'Qwen/Qwen3.8-27B'];

/** The model asked first: PETAL_MODEL, else DEFAULT_MODEL (T168). */
export function chosenModel(env: Record<string, string | undefined> = process.env): string {
  return env.PETAL_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * USD per million tokens (research R10; GET /v1/models on 2026-11-05). Cached input is cheaper on
 * NEAR AI (input_cache_read); it is priced in full here, so spend is never under-counted.
 */
export const PRICES: Record<string, { in: number; out: number }> = {
  'z-ai/glm-5.3-flash': { in: 0.08, out: 0.5 },
  'Qwen/Qwen3.8-27B': { in: 0.04, out: 1.35 },
  'deepseek-ai/DeepSeek-V4.1-Flash-1017': { in: 0.3, out: 1.2 },
};
/** A model missing from PRICES and from NEAR AI's list: the dearest rates above. */
const UNKNOWN_PRICE = { in: 0.3, out: 1.35 };

export function costUsd(
  model: string,
  usage: { in: number; out: number },
  listed?: { in: number; out: number },
): number {
  const p = PRICES[model] ?? listed ?? UNKNOWN_PRICE;
  return Math.round(((usage.in * p.in + usage.out * p.out) / 1e6) * 1e9) / 1e9;
}

/**
 * Includes reasoning tokens: a low limit returns empty content, because the reasoning used it all.
 * An unused limit costs nothing, and each chat is capped in dollars anyway (Budget).
 */
export const MAX_COMPLETION_TOKENS = 16_000;

/**
 * T060: most of a chat's time was the model reasoning. At the models' own default a flower took
 * 63-92 s and often hit the 120 s limit; at "low" it takes 26-58 s, and the tools check the rest.
 */
export const REASONING_EFFORT = 'low';

/** A model call that failed, with the error code the agent reports (tools.md codes). */
export class LlmCallError extends Error {
  readonly code: ToolErrorCode;
  readonly hint?: string;
  readonly retryAfterS?: number;
  /** whether another model might answer where this one failed */
  readonly tryNext: boolean;
  /** what the failed call still cost */
  readonly costUsd: number;
  constructor(
    code: ToolErrorCode,
    message: string,
    o: { hint?: string; retryAfterS?: number; tryNext?: boolean; costUsd?: number } = {},
  ) {
    super(message);
    this.name = 'LlmCallError';
    this.code = code;
    this.hint = o.hint;
    this.retryAfterS = o.retryAfterS;
    this.tryNext = o.tryNext ?? false;
    this.costUsd = o.costUsd ?? 0;
  }
}

export interface NearAiOptions {
  /** the key itself; default process.env[cfg.apiKeyEnv] */
  apiKey?: string;
  baseURL?: string;
  /** the transport; tests pass a fake (never the real NEAR AI Cloud) */
  fetch?: typeof fetch;
  /** where attestation reports are kept; default <repo>/.petal/attestations */
  attestationsDir?: string;
  /** public base of Petal's API, for report_url; default relative (/api/v1/attestations/…) */
  apiBase?: string;
  /** default MAX_COMPLETION_TOKENS; includes reasoning tokens */
  maxCompletionTokens?: number;
  /** how long the model reasons before it answers; default REASONING_EFFORT, null the model's own */
  reasoningEffort?: 'low' | 'medium' | 'high' | null;
  /** per attempt, default 60 s */
  timeoutMs?: number;
  /** a report is reused for this long before a fresh one is fetched; default 10 min */
  attestationTtlMs?: number;
  /** after a model fails, the next one is tried first for this long; default 5 min */
  stickyFallbackMs?: number;
  /** waits between signature lookups (404 is often a race); default [300, 700, 1500] */
  signatureDelaysMs?: number[];
  now?: () => Date;
  /** signature or attestation trouble that does not fail the call */
  onWarning?: (message: string) => void;
}

/** A NEAR AI client plus what the health route reports. */
export interface NearAiClient extends LlmClient {
  readonly kind: 'near-ai-cloud';
  /** "up" until a call fails with no model answering; "down" then, until one answers */
  status(): 'up' | 'down';
}

// A joined path, not new URL('…', import.meta.url): bundlers (Next's Turbopack, for the web
// app's API mock) read that form as an asset to copy, and .petal/ may not exist yet.
const DEFAULT_ATTESTATIONS = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '.petal',
  'attestations',
);

function bodyBytes(body: unknown): Uint8Array {
  if (typeof body === 'string') return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array();
}

function toOpenAi(m: LlmMessage): OpenAI.Chat.Completions.ChatCompletionMessageParam {
  switch (m.role) {
    case 'system':
      return { role: 'system', content: m.content };
    case 'user':
      return { role: 'user', content: m.content };
    case 'tool':
      return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content };
    case 'assistant':
      return m.tool_calls?.length
        ? {
            role: 'assistant',
            content: m.content,
            tool_calls: m.tool_calls.map((c) => ({
              id: c.id,
              type: 'function' as const,
              function: { name: c.name, arguments: c.arguments },
            })),
          }
        : { role: 'assistant', content: m.content ?? '' };
  }
}

/**
 * NEAR AI answers 402 four ways (near-ai.md, section 2): `api_key_limit_exceeded` is this key's own
 * lifetime cap, and the rest are the organization behind it. None gets better on another model. The
 * body holds spend figures, so they stay out of what a viewer of the run reads.
 */
function paymentRefused(type: string | null | undefined): LlmCallError {
  const message =
    type === 'api_key_limit_exceeded'
      ? "The sponsored key behind Petal's agent has reached its spending limit, so the agent stopped here."
      : type === 'insufficient_credits' || type === 'no_credits' || type === 'no_limit_configured'
        ? "Petal's sponsor account is out of NEAR AI credit, so the agent stopped here."
        : "NEAR AI Cloud refused to bill Petal's sponsor account, so the agent stopped here.";
  return new LlmCallError('budget_exhausted', message, { hint: CONNECT_HINT });
}

/** Sort an SDK or transport error into tools.md codes, and whether a fallback model may help. */
function classify(e: unknown, model: string): LlmCallError {
  if (e instanceof LlmCallError) return e;
  if (e instanceof APIError && typeof e.status === 'number') {
    const s = e.status;
    const what = `${model}: HTTP ${s}${e.message ? ` (${e.message.slice(0, 200)})` : ''}`;
    if (s === 401 || s === 403) {
      return new LlmCallError('source_failed', `NEAR AI Cloud refused the server's key: ${what}`, {
        hint: 'Check NEAR_AI_API_KEY.',
      });
    }
    if (s === 402) return paymentRefused(e.type);
    const retry = Number(e.headers?.get?.('retry-after'));
    return new LlmCallError(s === 429 ? 'rate_limited' : 'source_failed', what, {
      tryNext: true,
      retryAfterS: Number.isFinite(retry) && retry > 0 ? retry : undefined,
    });
  }
  const msg = e instanceof Error ? e.message : String(e);
  return new LlmCallError('source_failed', `${model}: ${msg}`, { tryNext: true });
}

/** The full client. `nearAiClient` in index.ts is this with the contract's arguments only. */
export function createNearAiClient(
  cfg: { apiKeyEnv: 'NEAR_AI_API_KEY'; model: string; fallbacks: string[] },
  o: NearAiOptions = {},
): NearAiClient {
  const baseURL = (o.baseURL ?? NEAR_AI_BASE_URL).replace(/\/+$/, '');
  const transport = o.fetch ?? globalThis.fetch;
  const now = o.now ?? (() => new Date());
  const warn = o.onWarning ?? (() => {});
  const store: AttestationStore = attestationStore(o.attestationsDir ?? DEFAULT_ATTESTATIONS);
  const models = [cfg.model, ...cfg.fallbacks.filter((m) => m !== cfg.model)];
  const attestTtl = o.attestationTtlMs ?? 10 * 60_000;
  const stickyMs = o.stickyFallbackMs ?? 5 * 60_000;
  const reports = new Map<string, { at: number; ref: Promise<AttestationRef | undefined> }>();
  const prices = new Map<string, Promise<{ in: number; out: number } | undefined>>();
  let start = 0; // index of the model tried first
  let startUntil = 0;
  let healthy = true;

  const key = () => o.apiKey ?? process.env[cfg.apiKeyEnv] ?? '';
  const http = (signal?: AbortSignal): NearAiHttp => ({
    baseURL,
    apiKey: key(),
    fetch: signal ? (url, init) => transport(url, { ...init, signal }) : transport,
  });

  /** The report fetched before the completion, reused for a while; never fails the call. */
  function attestation(model: string): Promise<AttestationRef | undefined> {
    const hit = reports.get(model);
    if (hit && now().getTime() - hit.at < attestTtl) return hit.ref;
    const ref = fetchAttestation(http(), model, store, { apiBase: o.apiBase }).catch((e) => {
      warn(`no attestation report for ${model}: ${(e as Error).message}`);
      reports.delete(model);
      return undefined;
    });
    reports.set(model, { at: now().getTime(), ref });
    return ref;
  }

  /**
   * PETAL_MODEL can name any listed model, some at 30 times the default's price, so spend and the
   * caps must use its real price. GET /v1/models costs no inference; asked once per model.
   */
  function listedPrice(model: string) {
    if (PRICES[model]) return Promise.resolve(undefined);
    const known = prices.get(model);
    if (known) return known;
    const asked = (async () => {
      try {
        const res = await transport(`${baseURL}/models`, {
          headers: { Authorization: `Bearer ${key()}` },
        });
        const list = (await res.json()) as {
          data?: { id: string; pricing?: { input?: unknown; output?: unknown } }[];
        };
        const p = list.data?.find((m) => m.id === model)?.pricing;
        if (typeof p?.input === 'number' && typeof p.output === 'number') {
          return { in: p.input, out: p.output };
        }
      } catch {
        // falls through to the warning
      }
      warn(`no price for ${model} on NEAR AI's list: counting it at the default rates`);
      return undefined;
    })();
    prices.set(model, asked);
    return asked;
  }

  async function callModel(
    model: string,
    req: LlmRequest,
    signal?: AbortSignal,
  ): Promise<LlmCompletion> {
    // these two are shared with other runs, so Stop doesn't cancel them: it just buys nothing after
    const attested = await attestation(model);
    const listed = await listedPrice(model);
    signal?.throwIfAborted();
    let captured: { request: Uint8Array; response: Uint8Array } | undefined;
    const capture: typeof fetch = async (input, init) => {
      const res = await transport(input, init);
      const response = new Uint8Array(await res.arrayBuffer());
      captured = { request: bodyBytes(init?.body), response };
      const nullBody = res.status === 204 || res.status === 304;
      return new Response(nullBody ? null : response, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    };
    const client = new OpenAI({
      apiKey: key(),
      baseURL,
      organization: null,
      project: null,
      maxRetries: 0,
      timeout: o.timeoutMs ?? 60_000,
      defaultHeaders: { 'x-no-aliasing': 'true', 'Accept-Encoding': 'identity' },
      fetch: capture,
    });
    const effort = o.reasoningEffort === undefined ? REASONING_EFFORT : o.reasoningEffort;
    const completion = await client.chat.completions.create(
      {
        model,
        messages: req.messages.map(toOpenAi),
        stream: false,
        max_completion_tokens: o.maxCompletionTokens ?? MAX_COMPLETION_TOKENS,
        ...(effort ? { reasoning_effort: effort } : {}),
        ...(req.tools?.length
          ? {
              tool_choice: 'auto' as const,
              tools: req.tools.map((t) => ({
                type: 'function' as const,
                function: { name: t.name, description: t.description, parameters: t.parameters },
              })),
            }
          : {}),
      },
      signal ? { signal } : {},
    );
    const choice = completion.choices?.[0];
    if (!choice?.message) {
      throw new LlmCallError('source_failed', `${model}: the answer has no message`, {
        tryNext: true,
      });
    }
    const tool_calls: LlmToolCall[] = (choice.message.tool_calls ?? []).flatMap((c, i) =>
      c.type === 'function'
        ? [
            {
              id: c.id || `call_${i + 1}`,
              name: c.function.name,
              arguments: c.function.arguments ?? '',
            },
          ]
        : [],
    );
    const content = choice.message.content ?? null;
    const usage = {
      in: completion.usage?.prompt_tokens ?? 0,
      out: completion.usage?.completion_tokens ?? 0,
    };
    if (choice.finish_reason === 'length' && !content?.trim() && !tool_calls.length) {
      throw new LlmCallError('source_failed', `${model}: used its token limit before answering`, {
        tryNext: true,
        costUsd: costUsd(model, usage, listed),
      });
    }
    const signature = captured
      ? await sign(model, completion.id, captured, attested, signal)
      : null;
    return {
      model,
      completion_id: completion.id,
      message: tool_calls.length
        ? { role: 'assistant', content, tool_calls }
        : { role: 'assistant', content },
      usage,
      cost_usd: costUsd(model, usage, listed),
      fallback_used: model !== cfg.model,
      signature,
    };
  }

  async function sign(
    model: string,
    completionId: string,
    bytes: { request: Uint8Array; response: Uint8Array },
    attested: AttestationRef | undefined,
    signal?: AbortSignal,
  ) {
    const request_sha256 = sha256Hex(bytes.request);
    const response_sha256 = sha256Hex(bytes.response);
    try {
      // With no report the model has no enclave to sign in: one look is enough, not a 2.5 s wait.
      const raw = await fetchSignature(http(signal), completionId, model, {
        delaysMs: attested ? o.signatureDelaysMs : [],
      });
      const sig = buildSignature({
        model,
        completion_id: completionId,
        raw,
        request_sha256,
        response_sha256,
        attestation: attested,
        fetched_at: now(),
      });
      for (const p of checkSignature(sig, attested?.signing_addresses)) {
        warn(`signature of ${completionId}: ${p}`);
      }
      return sig;
    } catch (e) {
      warn(`no signature for ${completionId}: ${(e as Error).message}`);
      return null;
    }
  }

  return {
    kind: 'near-ai-cloud',
    model: cfg.model,
    status: () => (healthy ? 'up' : 'down'),
    async complete(req, { signal } = {}) {
      if (!key()) {
        throw new LlmCallError('source_failed', `${cfg.apiKeyEnv} is not set`, {
          hint: 'Without a key, Petal replays a recorded run (recordedClient).',
        });
      }
      const first = now().getTime() < startUntil ? start : 0;
      const order = [...models.slice(first), ...models.slice(0, first)];
      const failures: LlmCallError[] = [];
      let lost = 0; // what failed attempts still cost, so spend is never under-counted
      for (const model of order) {
        try {
          const out = await callModel(model, req, signal);
          healthy = true;
          return lost ? { ...out, cost_usd: out.cost_usd + lost } : out;
        } catch (e) {
          const err = classify(e, model);
          failures.push(err);
          lost += err.costUsd;
          // Stop says nothing about this model, so no fallback, and its health stands
          if (signal?.aborted) {
            throw new LlmCallError('source_failed', `${model}: stopped`, { costUsd: lost });
          }
          if (!err.tryNext) throw err;
          // the next model goes first for a while, so each turn doesn't wait on a failing one
          const next = (models.indexOf(model) + 1) % models.length;
          start = next;
          startUntil = now().getTime() + stickyMs;
        }
      }
      healthy = false;
      const last = failures[failures.length - 1];
      throw new LlmCallError(
        last?.code === 'rate_limited' ? 'rate_limited' : 'source_failed',
        `NEAR AI Cloud: no model answered (${failures.map((f) => f.message).join('; ')})`,
        {
          retryAfterS: last?.retryAfterS,
          hint: 'Try again in a minute, or bring your own agent.',
          costUsd: lost,
        },
      );
    },
  };
}
