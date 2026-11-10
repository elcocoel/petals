// nearAiClient (T055; research R10): Petal's model client on NEAR AI Cloud, through the `openai`
// SDK at https://cloud-api.near.ai/v1. Every call is non-streamed, sent with the canonical model id,
// `x-no-aliasing: true` and `Accept-Encoding: identity`, so it can get a `provider_tee` signature.
// A capturing fetch keeps the exact request and response bytes and their SHA-256 (never
// re-serialised JSON). The model and its fallbacks come from the bake-off (T060, research R10).
// Never called in tests: they use faked HTTP.
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex } from '@petal/core';
import type { ToolErrorCode } from '@petal/core/types';
import OpenAI, { APIError } from 'openai';
import { modelOf } from './catalogue.ts';
import { CONNECT_HINT } from './invites.ts';
import type {
  LlmCallOptions,
  LlmClient,
  LlmCompletion,
  LlmMessage,
  LlmRequest,
  LlmToolCall,
} from './llm.ts';
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
 * USD per million tokens (research R10; GET /v1/models on 2026-11-05, again 10 Nov: unchanged). Cached input
 * is billed at the cache-read rate (input_cache_read; docs.near.ai/cloud/guides/prompt-caching): a chat
 * resends its whole thread each call, so most of what it sends is read from the cache.
 */
export const PRICES: Record<string, { in: number; out: number; cached: number }> = {
  'z-ai/glm-5.3-flash': { in: 0.08, out: 0.5, cached: 0.012 },
  'Qwen/Qwen3.8-27B': { in: 0.04, out: 1.35, cached: 0.018 },
  'deepseek-ai/DeepSeek-V4.1-Flash-1017': { in: 0.3, out: 1.2, cached: 0.006 },
};
/** A model missing from PRICES and from NEAR AI's list: the dearest rates above, its cache read in full. */
const UNKNOWN_PRICE = { in: 0.3, out: 1.35 };

type Price = { in: number; out: number; cached?: number };

/** The price a model's calls are counted at: the table's, the catalogue's, NEAR AI's list, or the dearest. */
export function priceOf(
  model: string,
  listed?: Price,
): { in: number; cached: number; out: number } {
  const p: Price = PRICES[model] ?? modelOf(model)?.usd_per_million ?? listed ?? UNKNOWN_PRICE;
  return { in: p.in, cached: p.cached ?? p.in, out: p.out };
}

/** NEAR AI's id for a call: the UUIDv5 of the answer's own id in the DNS namespace (its usage reporting). */
export function inferenceIdOf(completionId: string): string {
  const dns = Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex');
  const h = createHash('sha1').update(dns).update(completionId, 'utf8').digest().subarray(0, 16);
  h[6] = ((h[6] as number) & 0x0f) | 0x50;
  h[8] = ((h[8] as number) & 0x3f) | 0x80;
  const x = h.toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/** What a call cost: its uncached input, its cached input at the cache-read rate, and its output. */
export function costUsd(
  model: string,
  usage: { in: number; out: number; cached?: number },
  listed?: Price,
): number {
  const p: Price = PRICES[model] ?? modelOf(model)?.usd_per_million ?? listed ?? UNKNOWN_PRICE;
  const cached = Math.min(usage.cached ?? 0, usage.in);
  const usd = (usage.in - cached) * p.in + cached * (p.cached ?? p.in) + usage.out * p.out;
  return Math.round((usd / 1e6) * 1e9) / 1e9;
}

/**
 * Includes reasoning tokens: a low limit returns empty content, because the reasoning used it all.
 * An unused limit costs nothing, and each chat is capped in dollars anyway (Budget).
 */
export const MAX_COMPLETION_TOKENS = 16_000;

type Effort = 'low' | 'medium' | 'high';

/**
 * The `reasoning_effort` a call sends: the catalogue's default for the model, or what was asked for.
 * T060: most of a chat's time was the model reasoning. At the models' own default a flower took
 * 63-92 s and often hit the 120 s limit; at "low" it takes 26-58 s, and the tools check the rest.
 * Anthropic's models on NEAR AI answer the field with a 400 ("Extra inputs are not permitted", 6 Nov),
 * so a model the catalogue gives no efforts never gets it. PETAL_MODEL can name a model the catalogue
 * doesn't list, and for that one nobody knows: slow beats a 400 on every call, so nothing is sent
 * unless a caller asks. A fallback that doesn't offer what the pick asked for takes its own default.
 */
export function effortFor(model: string, asked?: string | null): string | null {
  const listed = modelOf(model);
  if (listed && !listed.efforts.length) return null;
  if (asked === undefined) return listed?.default_effort ?? null;
  return listed && asked && !listed.efforts.includes(asked) ? listed.default_effort : asked;
}

/** Two listed models that promise the same. One the catalogue doesn't list promises nothing to break. */
function samePromise(a: string, b: string): boolean {
  const [x, y] = [modelOf(a), modelOf(b)];
  return !x || !y || x.promise === y.promise;
}

/** A model call that failed, with the error code the agent reports (tools.md codes). */
export class LlmCallError extends Error {
  readonly code: ToolErrorCode;
  readonly hint?: string;
  readonly retryAfterS?: number;
  /** whether another model might answer where this one failed */
  readonly tryNext: boolean;
  /** what the failed call still cost */
  readonly costUsd: number;
  /** it may have been billed for more than that, and nobody can say: it counts at its full hold */
  readonly costUnknown: boolean;
  constructor(
    code: ToolErrorCode,
    message: string,
    o: {
      hint?: string;
      retryAfterS?: number;
      tryNext?: boolean;
      costUsd?: number;
      costUnknown?: boolean;
    } = {},
  ) {
    super(message);
    this.name = 'LlmCallError';
    this.code = code;
    this.hint = o.hint;
    this.retryAfterS = o.retryAfterS;
    this.tryNext = o.tryNext ?? false;
    this.costUsd = o.costUsd ?? 0;
    this.costUnknown = o.costUnknown ?? false;
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
  /** how long the model reasons before it answers; default effortFor's, null the model's own */
  reasoningEffort?: Effort | null;
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
      ? "The sponsored key behind Petals' agent has reached its spending limit, so the agent stopped here."
      : type === 'insufficient_credits' || type === 'no_credits' || type === 'no_limit_configured'
        ? "Petals' sponsor account is out of NEAR AI credit, so the agent stopped here."
        : "NEAR AI Cloud refused to bill Petals' sponsor account, so the agent stopped here.";
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
      // A timeout on their side: the model may have run. Any other status is a refusal.
      costUnknown: s === 408 || s === 504,
    });
  }
  // No answer at all, a timeout included: the model may have run and been billed.
  const msg = e instanceof Error ? e.message : String(e);
  return new LlmCallError('source_failed', `${model}: ${msg}`, {
    tryNext: true,
    costUnknown: true,
  });
}

/** What the answer says it used. A count that's missing, or none at all, is no count. */
function usageOf(
  usage:
    | {
        prompt_tokens?: unknown;
        completion_tokens?: unknown;
        prompt_tokens_details?: { cached_tokens?: unknown } | null;
      }
    | undefined,
) {
  const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null);
  const [input, output] = [count(usage?.prompt_tokens), count(usage?.completion_tokens)];
  // the input read from NEAR AI's cache, null or 0 on a first call (docs: prompt caching)
  const cached = count(usage?.prompt_tokens_details?.cached_tokens);
  return {
    usage: {
      in: input ?? 0,
      out: output ?? 0,
      ...(cached ? { cached: Math.min(cached, input ?? 0) } : {}),
    },
    known: input !== null && output !== null && input + output > 0,
  };
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
  /**
   * What a chat on `head` tries, in order. The server's own model has the server's list, and a pick has
   * its catalogue row. Either way nothing crosses a promise: a signed pick never becomes unsigned, and a
   * passed-through model with no fallback fails plainly.
   */
  const chainOf = (head: string) => [
    head,
    ...(head === cfg.model ? cfg.fallbacks : (modelOf(head)?.fallbacks ?? [])).filter(
      (m) => m !== head && samePromise(head, m),
    ),
  ];
  const attestTtl = o.attestationTtlMs ?? 10 * 60_000;
  const stickyMs = o.stickyFallbackMs ?? 5 * 60_000;
  const reports = new Map<string, { at: number; ref: Promise<AttestationRef | undefined> }>();
  const prices = new Map<string, Promise<{ in: number; out: number } | undefined>>();
  // After a model fails, the next one goes first for a while, each chain apart: one pick's trouble says
  // nothing about another's.
  const sticky = new Map<string, { start: number; until: number }>();
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
    if (PRICES[model] || modelOf(model)) return Promise.resolve(undefined);
    const known = prices.get(model);
    if (known) return known;
    const asked = (async () => {
      try {
        const res = await transport(`${baseURL}/models`, {
          headers: { Authorization: `Bearer ${key()}` },
        });
        const list = (await res.json()) as {
          data?: {
            id: string;
            pricing?: { input?: unknown; output?: unknown; input_cache_read?: unknown };
          }[];
        };
        const p = list.data?.find((m) => m.id === model)?.pricing;
        if (typeof p?.input === 'number' && typeof p.output === 'number') {
          // per token, as text ("0.000000006"), where input and output are per million
          const cached = Number(p.input_cache_read) * 1e6;
          return { in: p.input, out: p.output, ...(cached >= 0 ? { cached } : {}) };
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
    call: { head: string; signal?: AbortSignal; effort?: string | null },
  ): Promise<LlmCompletion> {
    const { signal } = call;
    // these two are shared with other runs, so Stop doesn't cancel them: it just buys nothing after
    const attested = await attestation(model);
    const listed = await listedPrice(model);
    signal?.throwIfAborted();
    let captured: { request: Uint8Array; response: Uint8Array } | undefined;
    // the id NEAR AI's billing knows the call by (docs.near.ai, usage reporting)
    let inferenceId: string | undefined;
    const capture: typeof fetch = async (input, init) => {
      const res = await transport(input, init);
      const response = new Uint8Array(await res.arrayBuffer());
      captured = { request: bodyBytes(init?.body), response };
      inferenceId = res.headers.get('inference-id') ?? undefined;
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
    const effort = effortFor(model, call.effort !== undefined ? call.effort : o.reasoningEffort);
    const completion = await client.chat.completions.create(
      {
        model,
        messages: req.messages.map(toOpenAi),
        stream: false,
        max_completion_tokens: o.maxCompletionTokens ?? MAX_COMPLETION_TOKENS,
        ...(effort ? { reasoning_effort: effort as Effort } : {}),
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
    const { usage, known } = usageOf(completion.usage);
    if (choice.finish_reason === 'length' && !content?.trim() && !tool_calls.length) {
      throw new LlmCallError('source_failed', `${model}: used its token limit before answering`, {
        tryNext: true,
        costUsd: costUsd(model, usage, listed),
        costUnknown: !known,
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
      ...(known ? {} : { cost_unknown: true }),
      fallback_used: model !== call.head,
      signature,
      // its header, or, as NEAR AI defines it, the UUIDv5 of the answer's id in the DNS namespace
      inference_id: inferenceId ?? inferenceIdOf(completion.id),
      list_price: priceOf(model, listed),
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
    /** NEAR AI's own bill per call (POST /v1/billing/costs, nano-dollars); a call it doesn't know yet is left out */
    async billed(ids) {
      const known = new Map<string, number>();
      if (!ids.length || !key()) return known;
      const res = await transport(`${baseURL}/billing/costs`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestIds: ids }),
      });
      if (!res.ok) throw new Error(`NEAR AI's billing answered ${res.status}`);
      const answer = (await res.json()) as {
        requests?: { requestId: string; costNanoUsd: number }[];
      };
      // 0 is what it says for a call it hasn't counted yet
      for (const r of answer.requests ?? [])
        if (r.costNanoUsd > 0) known.set(r.requestId, r.costNanoUsd / 1e9);
      return known;
    },
    async complete(req, { signal, model: picked, effort }: LlmCallOptions = {}) {
      if (!key()) {
        throw new LlmCallError('source_failed', `${cfg.apiKeyEnv} is not set`, {
          hint: 'Without a key, Petals replays a recorded run (recordedClient).',
        });
      }
      const head = picked ?? cfg.model;
      const models = chainOf(head);
      const stuck = sticky.get(head);
      const first = stuck && now().getTime() < stuck.until ? stuck.start : 0;
      const order = [...models.slice(first), ...models.slice(0, first)];
      const failures: LlmCallError[] = [];
      let lost = 0; // what failed attempts still cost, so spend is never under-counted
      // the models whose attempt may have cost more than anyone can say (a timeout, no answer)
      const unknownOn: string[] = [];
      for (const model of order) {
        try {
          const out = await callModel(model, req, {
            head,
            ...(signal ? { signal } : {}),
            ...(effort !== undefined ? { effort } : {}),
          });
          healthy = true;
          // An attempt that said nothing of its cost was sent the same request this answer read: it's
          // counted at that input in full, uncached, rather than at the whole chat's hold.
          const unsaid = unknownOn.reduce(
            (sum, m) => sum + costUsd(m, { in: out.usage.in, out: 0 }),
            0,
          );
          return { ...out, cost_usd: out.cost_usd + lost + unsaid, failed_usd: lost + unsaid };
        } catch (e) {
          const err = classify(e, model);
          failures.push(err);
          if (err.costUnknown) unknownOn.push(model);
          else lost += err.costUsd;
          // Stop says nothing about this model, so no fallback, and its health stands
          if (signal?.aborted) {
            throw new LlmCallError('source_failed', `${model}: stopped`, {
              costUsd: lost,
              costUnknown: true,
            });
          }
          if (!err.tryNext) {
            throw new LlmCallError(err.code, err.message, {
              ...(err.hint ? { hint: err.hint } : {}),
              ...(err.retryAfterS ? { retryAfterS: err.retryAfterS } : {}),
              costUsd: lost,
              costUnknown: unknownOn.length > 0,
            });
          }
          // the next model goes first for a while, so each turn doesn't wait on a failing one
          const next = (models.indexOf(model) + 1) % models.length;
          sticky.set(head, { start: next, until: now().getTime() + stickyMs });
        }
      }
      // a pick failing says that pick is down. What the health route reports is the server's own model
      if (head === cfg.model) healthy = false;
      const last = failures[failures.length - 1];
      throw new LlmCallError(
        last?.code === 'rate_limited' ? 'rate_limited' : 'source_failed',
        `NEAR AI Cloud: no model answered (${failures.map((f) => f.message).join('; ')})`,
        {
          retryAfterS: last?.retryAfterS,
          hint: 'Try again in a minute, or bring your own agent.',
          costUsd: lost,
          costUnknown: unknownOn.length > 0,
        },
      );
    },
  };
}
