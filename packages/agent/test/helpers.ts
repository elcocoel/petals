// Test doubles for W5: a fake tool registry (W4 builds the real one in parallel), a fake tool
// context, scripted model clients, a fake NEAR AI Cloud over HTTP (never the real one), and an
// SSE reader.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Hex, specHash } from '@petal/core';
import type { AgentEvent, ModelSignature, Spec } from '@petal/core/types';
import type { ToolContext } from '@petal/tools';
import type { LlmClient, LlmCompletion, LlmMessage, LlmRequest, LlmToolCall } from '../src/llm.ts';
import { recordedClient, SKELETON_TRANSCRIPT } from '../src/recorded.ts';
import type { AnyTool } from '../src/tool-defs.ts';

export const SHA = '72a6d9676d967d63712dc82bcbb90282d2f61e5ca6495c3e2e54a4f9af77e9ec';
export const SPEC = { petal: 'spec/v1', marker: 'the proposed spec' } as unknown as Spec;
export const SPEC_SHA = specHash(SPEC);
export const RENDER_SHA = 'e'.repeat(64);
export const VIEW_URL = 'http://localhost:3000/f/draft';
export const SIGNER = '0x1234567890abcdef1234567890abcdef12345678';
const TV = { tools_version: 'tools/v1' };

export function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'petal-agent-'));
}

type Run = (args: Record<string, unknown>, ctx: ToolContext) => unknown;

function tool(name: string, run: Run): AnyTool {
  return {
    name,
    input: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' },
    output: { type: 'object' },
    run: async (i: Record<string, unknown>, ctx: ToolContext) => run(i, ctx),
  };
}

export interface FakeTools {
  registry: AnyTool[];
  calls: { name: string; args: Record<string, unknown> }[];
}

/** The tools the skeleton run calls, with shapes from tools.md (values made up but the hash). */
export function fakeRegistry(o: { failValidateOnce?: boolean } = {}): FakeTools {
  const calls: FakeTools['calls'] = [];
  let failValidate = o.failValidateOnce ?? false;
  const t = (name: string, run: Run) =>
    tool(name, (args, ctx) => {
      calls.push({ name, args });
      return run(args, ctx);
    });
  const registry = [
    t('list_networks', () => ({
      networks: [{ id: 'near-validators' }],
      cannot_read_hint: '',
      ...TV,
    })),
    t('list_flowers', () => ({ flowers: [], ...TV })),
    t('get_snapshot', (_a, ctx) => {
      ctx.onProgress?.({ stage: 'fetching', message: 'found in the fixtures', done: 1, total: 1 });
      return {
        sha256: SHA,
        reused: true,
        where: 'fixture',
        snapshot: { block_height: 222915356, as_of: '2026-11-03T19:40:23Z', final: true },
        ...TV,
      };
    }),
    t('describe_snapshot', () => ({
      measures: [{ id: 'validator_stake_current_epoch' }],
      top: [{ id: 'a.poolv1.near', label: 'A' }],
      ...TV,
    })),
    t('compute_figures', () => ({
      nakamoto: { threshold: 0.333333, count: 9 },
      participants_included: 371,
      top_k_share: { '10': 0.41 },
      ...TV,
    })),
    t('propose_spec', () => ({
      spec: SPEC,
      spec_sha256: SPEC_SHA,
      changed_from_default: ['segments'],
      ...TV,
    })),
    t('validate_spec', (args) => {
      const unknowns = (args.interpretation as { unknowns?: unknown[] } | undefined)?.unknowns;
      if (failValidate || !unknowns?.length) {
        failValidate = false;
        return {
          valid: false,
          errors: [
            { path: '/interpretation/unknowns', rule: 'unknowns', message: 'unknowns is empty' },
          ],
          warnings: [],
          ...TV,
        };
      }
      return { valid: true, errors: [], warnings: [], ...TV };
    }),
    t('render_flower', (args) => ({
      spec_sha256: specHash(args.spec as Spec),
      render_sha256: RENDER_SHA,
      svg: '<svg/>',
      legend: [
        { primitive: 'width', meaning: 'share of stake', sources: ['fastnear-rpc-validators'] },
      ],
      petals: [{ index: 0, id: 'a.poolv1.near' }],
      view_url: VIEW_URL,
      ...TV,
    })),
    t('prepare_publish', () => ({ sign_url: 'http://localhost:3000/publish/x', ...TV })),
    t('publish_flower', () => {
      throw new Error('the agent must never call publish_flower');
    }),
    t('explode', () => {
      throw new Error('boom');
    }),
  ];
  return { registry, calls };
}

export function fakeContext(root = tmpRoot()): ToolContext {
  return {
    config: { root, stateDir: join(root, '.petal'), fake: true },
    store: {},
    modules: {},
    map: { reader: {}, writer: null, receiver: 'petals.testnet', trustedWriters: [] },
    rpc: {},
    quote: async () => {
      throw new Error('no quotes in agent tests');
    },
    now: () => new Date('2026-11-04T12:00:00Z'),
  } as unknown as ToolContext;
}

export interface ScriptTurn {
  content?: string | null;
  calls?: { name: string; args: unknown; id?: string }[];
  signature?: ModelSignature | null;
}

/** A model that answers from a script, one turn per call, and remembers what it was asked. */
export function scriptedLlm(
  turns: ScriptTurn[],
  o: { kind?: LlmClient['kind']; costUsd?: number; delayMs?: number; model?: string } = {},
): LlmClient & { requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  const model = o.model ?? 'scripted';
  return {
    kind: o.kind ?? 'near-ai-cloud',
    model,
    requests,
    async complete(req): Promise<LlmCompletion> {
      requests.push(structuredClone(req));
      if (o.delayMs) await new Promise((r) => setTimeout(r, o.delayMs));
      const i = requests.length - 1;
      const turn = turns[i];
      if (!turn) throw new Error(`scriptedLlm: no turn ${i + 1}`);
      const tool_calls: LlmToolCall[] = (turn.calls ?? []).map((c, k) => ({
        id: c.id ?? `call_${i + 1}_${k + 1}`,
        name: c.name,
        arguments: typeof c.args === 'string' ? c.args : JSON.stringify(c.args),
      }));
      return {
        model,
        completion_id: `cmpl-${i + 1}`,
        message: tool_calls.length
          ? { role: 'assistant', content: turn.content ?? null, tool_calls }
          : { role: 'assistant', content: turn.content ?? null },
        usage: { in: 100, out: 10 },
        cost_usd: o.costUsd ?? 0,
        fallback_used: false,
        signature: turn.signature ?? null,
      };
    },
  };
}

/** recordedClient, slowed down. */
export function slowRecorded(delayMs: number): LlmClient {
  const inner = recordedClient(SKELETON_TRANSCRIPT);
  return {
    kind: inner.kind,
    model: inner.model,
    async complete(req) {
      await new Promise((r) => setTimeout(r, delayMs));
      return inner.complete(req);
    },
  };
}

export const INTERPRETATION = {
  summary: 'Stake decides who produces the blocks; nine validators hold a third of it.',
  power_means: [{ claim: 'Stake sets block production.', sources: ['fastnear-rpc-validators'] }],
  mappings: [{ primitive: 'width', why: 'share of stake', sources: ['fastnear-rpc-validators'] }],
  conflicts: [],
  unknowns: ['who controls the large unnamed delegators'],
  inferred: [],
  documents: [],
};

export function fakeSignature(completion: string): ModelSignature {
  return {
    provider: 'near-ai-cloud',
    model: 'z-ai/glm-5.3-flash',
    completion_id: completion,
    signature_kind: 'provider_tee',
    text: `z-ai/glm-5.3-flash:${'1'.repeat(64)}:${'2'.repeat(64)}`,
    signature: `0x${'ab'.repeat(65)}`,
    signing_address: SIGNER,
    signing_algo: 'ecdsa',
    request_sha256: '1'.repeat(64),
    response_sha256: '2'.repeat(64),
    fetched_at: '2026-11-04T12:00:00.000Z',
  };
}

// ---------------------------------------------------------------------------------------------
// A fake NEAR AI Cloud: attestation report, chat completions (answered by recordedClient, so it
// replays the skeleton transcript) and signatures over the exact bytes it received and sent.

type OpenAiMessage = {
  role: string;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: { id: string; function: { name: string; arguments: string } }[];
};

function fromOpenAi(m: OpenAiMessage): LlmMessage {
  if (m.role === 'tool')
    return { role: 'tool', tool_call_id: m.tool_call_id ?? '', content: m.content ?? '' };
  if (m.role === 'assistant') {
    return m.tool_calls?.length
      ? {
          role: 'assistant',
          content: m.content,
          tool_calls: m.tool_calls.map((c) => ({
            id: c.id,
            name: c.function.name,
            arguments: c.function.arguments,
          })),
        }
      : { role: 'assistant', content: m.content };
  }
  return { role: m.role as 'user' | 'system', content: m.content ?? '' };
}

export interface FakeNearAi {
  fetch: typeof fetch;
  log: { method: string; url: URL; headers: Headers; body?: string }[];
  /** completion id -> what was signed */
  exchanges: Map<string, { model: string; request: Uint8Array; response: Uint8Array }>;
  report: Uint8Array;
}

export function fakeNearAi(
  o: {
    llm?: LlmClient;
    /** model -> HTTP status it fails with */
    fail?: Record<string, number>;
    signatureMisses?: number;
    noSignature?: boolean;
    reportStatus?: number;
  } = {},
): FakeNearAi {
  const llm = o.llm ?? recordedClient(SKELETON_TRANSCRIPT);
  const log: FakeNearAi['log'] = [];
  const exchanges: FakeNearAi['exchanges'] = new Map();
  const enc = new TextEncoder();
  const json = { 'content-type': 'application/json' };
  const report = enc.encode(
    JSON.stringify({
      gateway_attestation: { intel_quote: 'cd'.repeat(16) },
      model_attestations: [
        { signing_address: SIGNER, signing_algo: 'ecdsa', intel_quote: 'ab'.repeat(16) },
      ],
    }),
  );
  let n = 0;
  let misses = o.signatureMisses ?? 0;
  const fetchFn: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    const body = typeof init?.body === 'string' ? init.body : undefined;
    log.push({ method: init?.method ?? 'GET', url, headers: new Headers(init?.headers), body });
    if (url.pathname.endsWith('/attestation/report')) {
      if (o.reportStatus) return new Response('{}', { status: o.reportStatus, headers: json });
      return new Response(report, { headers: json });
    }
    if (url.pathname.endsWith('/chat/completions')) {
      const req = JSON.parse(body ?? '{}') as { model: string; messages: OpenAiMessage[] };
      const status = o.fail?.[req.model];
      if (status) {
        return new Response(JSON.stringify({ error: { message: `${req.model} is down` } }), {
          status,
          headers: json,
        });
      }
      const r = await llm.complete({ messages: req.messages.map(fromOpenAi) });
      const id = `chatcmpl-${++n}`;
      const res = enc.encode(
        JSON.stringify({
          id,
          object: 'chat.completion',
          created: 1762257600,
          model: req.model,
          choices: [
            {
              index: 0,
              finish_reason: r.message.tool_calls?.length ? 'tool_calls' : 'stop',
              message: {
                role: 'assistant',
                content: r.message.content,
                ...(r.message.tool_calls?.length
                  ? {
                      tool_calls: r.message.tool_calls.map((c) => ({
                        id: c.id,
                        type: 'function',
                        function: { name: c.name, arguments: c.arguments },
                      })),
                    }
                  : {}),
              },
            },
          ],
          usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 },
        }),
      );
      exchanges.set(id, { model: req.model, request: enc.encode(body ?? ''), response: res });
      return new Response(res, { headers: json });
    }
    const sig = url.pathname.match(/\/signature\/([^/]+)$/);
    if (sig?.[1]) {
      const ex = exchanges.get(decodeURIComponent(sig[1]));
      if (o.noSignature || !ex || misses-- > 0) {
        return new Response('{"detail":"not found"}', { status: 404, headers: json });
      }
      return new Response(
        JSON.stringify({
          text: `${ex.model}:${sha256Hex(ex.request)}:${sha256Hex(ex.response)}`,
          signature: `0x${'ab'.repeat(65)}`,
          signing_address: SIGNER,
          signing_algo: 'ecdsa',
          signature_kind: 'provider_tee',
        }),
        { headers: json },
      );
    }
    return new Response('not found', { status: 404 });
  };
  return { fetch: fetchFn, log, exchanges, report };
}

// ---------------------------------------------------------------------------------------------
// SSE

export interface SseEvent {
  event: string;
  data: unknown;
  id?: string;
}

export function parseSse(text: string): SseEvent[] {
  return text
    .split('\n\n')
    .filter((b) => b.trim())
    .map((block) => {
      const e: SseEvent = { event: 'message', data: '' };
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) e.event = line.slice(7);
        else if (line.startsWith('data: ')) data.push(line.slice(6));
        else if (line.startsWith('id: ')) e.id = line.slice(4);
      }
      e.data = JSON.parse(data.join('\n'));
      return e;
    });
}

/** The run id the `run` event names (always the first event). */
export function runIdOf(es: SseEvent[]): string {
  const run = es.find((e) => e.event === 'run')?.data as { run_id?: unknown } | undefined;
  if (typeof run?.run_id !== 'string') throw new Error('no run event');
  return run.run_id;
}

/** A JSON response body, typed loosely for assertions. */
export interface Body {
  error: { code: string; message: string; hint?: string; retry_after_s?: number };
  [k: string]: unknown;
}
export async function bodyOf(res: Response | Promise<Response>): Promise<Body> {
  return (await (await res).json()) as Body;
}

export async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

/** true when `want` appears in `names` in this order (other names may sit in between). */
export function inOrder(names: string[], want: string[]): boolean {
  let i = 0;
  for (const n of names) if (n === want[i]) i++;
  return i === want.length;
}
