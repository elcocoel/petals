// runAgent (T057): the agent loop. The model chooses and interprets; the registry (@petal/tools,
// called in process) counts, validates and draws. Events follow http-api.md: `run` first, then
// stage, progress, tool_call, tool_result, message…, `flower` and its `signature` as soon as the
// flower is drawn, and `done` last. A heartbeat goes out whenever nothing else has for a while, so
// no gap reaches 10 s. Limits per chat: tool rounds, wall time and dollars (Budget), and the daily
// cap shared by every run on the server.
import { specHash } from '@petal/core';
import type {
  AgentEvent,
  ChatMessage,
  FlowerResult,
  Interpretation,
  ModelSignature,
  Spec,
  Stage,
  ToolError,
  Validation,
} from '@petal/core/types';
import { registry as defaultRegistry, type ToolContext } from '@petal/tools';
import { Channel } from './channel.ts';
import type { Budget, LlmClient, LlmCompletion, LlmMessage, LlmToolCall } from './llm.ts';
import { LlmCallError } from './near-ai.ts';
import { agentNotes, SYSTEM_PROMPT } from './prompt.ts';
import { newRunId } from './runs.ts';
import { forModel, isToolError, summarize } from './summary.ts';
import { type AnyTool, llmTools, STAGE_MESSAGE, STAGE_OF } from './tool-defs.ts';

export interface RunInput {
  messages: ChatMessage[];
  draft?: { spec?: Spec; entry?: unknown };
}

export interface RunDeps {
  tools: ToolContext;
  llm: LlmClient;
  budget: Budget;
}

export interface RunOptions {
  /** the run id the `run` event names; default a fresh one */
  runId?: string;
  /** default the @petal/tools registry; tests inject a fake */
  registry?: readonly AnyTool[];
  /** a heartbeat goes out after this long with no other event; default 8000 ms (< 10 s) */
  heartbeatMs?: number;
  /** ms clock for the wall-time limit; default Date.now */
  clock?: () => number;
  /** today's date in the system message; default new Date() */
  today?: () => Date;
}

export const DEFAULT_HEARTBEAT_MS = 8000;

export const SKILL_HINT =
  'Bring your own agent: install the Petal skill (skill/petal/SKILL.md), or add the MCP server with `claude mcp add petal -- pnpm -s --dir <repo> petal mcp`, and ask it the same question.';

/** The contract signature (packages.md). */
export function runAgent(input: RunInput, deps: RunDeps): AsyncIterable<AgentEvent> {
  return startRun(input, deps);
}

/** runAgent with the options the routes and tests need. Starts when first iterated. */
export function startRun(
  input: RunInput,
  deps: RunDeps,
  opts: RunOptions = {},
): AsyncIterable<AgentEvent> {
  return {
    [Symbol.asyncIterator]() {
      const ch = new Channel<AgentEvent>();
      const hbMs = opts.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const beat = () => {
        clearTimeout(timer);
        if (ch.closed) return;
        timer = setTimeout(() => emit({ event: 'heartbeat', data: {} }), hbMs);
        timer.unref?.();
      };
      const emit = (e: AgentEvent) => {
        if (ch.closed) return;
        ch.push(e);
        beat();
      };
      ch.onReturn = () => clearTimeout(timer);
      loop(input, deps, opts, emit, () => ch.closed)
        .catch((e: unknown) => {
          // the loop catches what it expects; this is a bug, still told to the client
          emit({ event: 'error', data: { code: 'internal', message: String(e) } });
          emit({
            event: 'done',
            data: {
              turns: 0,
              model: deps.llm.model,
              fallback_used: false,
              tokens: { in: 0, out: 0 },
              cost_usd: 0,
            },
          });
        })
        .finally(() => {
          clearTimeout(timer);
          ch.close();
        });
      return ch;
    },
  };
}

class Timeout extends Error {}

/** p, or a Timeout once the deadline passes. */
function before<T>(p: Promise<T>, deadline: number, clock: () => number): Promise<T> {
  const left = deadline - clock();
  if (left <= 0) return Promise.reject(new Timeout());
  let t: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Timeout()), left);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(t));
}

type Obj = Record<string, unknown>;

function hashOf(spec: unknown): string | undefined {
  if (!spec || typeof spec !== 'object') return undefined;
  try {
    return specHash(spec as Spec);
  } catch {
    return undefined;
  }
}

function toolError(code: ToolError['error']['code'], message: string, hint?: string): ToolError {
  return { error: hint ? { code, message, hint } : { code, message } };
}

/** Each tool call sees the run's own progress callback (and the server's, if it has one). */
function withProgress(ctx: ToolContext, onProgress: ToolContext['onProgress']): ToolContext {
  const own = ctx.onProgress;
  const both: ToolContext['onProgress'] = (e) => {
    onProgress?.(e);
    own?.(e);
  };
  if (Object.getPrototypeOf(ctx) === Object.prototype) return { ...ctx, onProgress: both };
  return Object.assign(Object.create(ctx) as ToolContext, { onProgress: both });
}

async function loop(
  input: RunInput,
  deps: RunDeps,
  opts: RunOptions,
  emit: (e: AgentEvent) => void,
  stopped: () => boolean,
): Promise<void> {
  const { llm, budget } = deps;
  const clock = opts.clock ?? Date.now;
  const registry = opts.registry ?? defaultRegistry;
  const runId = opts.runId ?? newRunId();
  const deadline = clock() + budget.wallSeconds * 1000;
  const totals = { turns: 0, in: 0, out: 0, usd: 0, fallback: false, model: llm.model };
  let stage: Stage | undefined;

  const setStage = (s: Stage, message = STAGE_MESSAGE[s]) => {
    if (s === stage) return;
    stage = s;
    emit({ event: 'stage', data: { stage: s, message } });
  };
  const fail = (code: ToolError['error']['code'], message: string, hint?: string, retry?: number) =>
    emit({
      event: 'error',
      data: {
        code,
        message,
        ...(hint ? { hint } : {}),
        ...(retry ? { retry_after_s: retry } : {}),
      },
    });
  const done = () =>
    emit({
      event: 'done',
      data: {
        turns: totals.turns,
        model: totals.model,
        fallback_used: totals.fallback,
        tokens: { in: totals.in, out: totals.out },
        cost_usd: Math.round(totals.usd * 1e6) / 1e6,
      },
    });
  const spend = async (usd: number) => {
    if (usd > 0) await budget.ledger?.add(usd).catch(() => {});
  };

  emit({
    event: 'run',
    data: { run_id: runId, resume_url: `/make?run=${encodeURIComponent(runId)}` },
  });
  if (llm.kind === 'recorded') {
    setStage('recorded');
  }
  setStage('thinking', 'Reading the question');

  if (llm.kind !== 'recorded' && budget.ledger) {
    const spent = await budget.ledger.spentToday().catch(() => 0);
    if (spent >= budget.usdPerDay) {
      fail(
        'budget_exhausted',
        `Petal's agent has used today's budget ($${budget.usdPerDay}); it starts again tomorrow (UTC).`,
        SKILL_HINT,
      );
      return done();
    }
  }

  // What the loop remembers, so the flower event can carry the spec, its validation, the
  // interpretation that passed, and the signature of the completion that wrote them.
  const specs = new Map<string, Spec>();
  const passed = new Map<
    string,
    { interpretation: Interpretation; validation: Validation; signature: ModelSignature | null }
  >();
  const draftSpec = input.draft?.spec;
  const draftHash = hashOf(draftSpec);
  if (draftSpec && draftHash) specs.set(draftHash, draftSpec);
  const hasValidator = registry.some((t) => t.name === 'validate_spec');
  const tools = llmTools(registry);

  const system = `${SYSTEM_PROMPT}\n\n${agentNotes({
    budget,
    today: (opts.today ?? (() => new Date()))(),
    draftSpec,
  })}`;
  const messages: LlmMessage[] = [
    { role: 'system', content: system },
    ...input.messages.map((m): LlmMessage => ({ role: m.role, content: m.content })),
  ];

  async function callTool(call: LlmToolCall, by: LlmCompletion): Promise<unknown> {
    let args: unknown;
    try {
      args = call.arguments.trim() ? JSON.parse(call.arguments) : {};
    } catch {
      args = undefined;
    }
    // A spec may be named by its spec_sha256 instead of being copied: copying long JSON is where
    // small models slip.
    if (args && typeof args === 'object' && !Array.isArray(args)) {
      const a = args as Obj;
      const ref = typeof a.spec === 'string' ? a.spec : a.spec === undefined ? a.spec_sha256 : null;
      const known = typeof ref === 'string' ? specs.get(ref.trim()) : undefined;
      if (known) {
        const { spec_sha256: _ref, ...rest } = a;
        args = { ...rest, spec: known };
      }
      if (call.name === 'render_flower') args = { ...(args as Obj), include_svg: false };
    }
    emit({
      event: 'tool_call',
      data: { id: call.id, name: call.name, args: args ?? call.arguments },
    });
    setStage(STAGE_OF[call.name] ?? 'thinking');

    const tool = registry.find((t) => t.name === call.name);
    const t0 = clock();
    let out: unknown;
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      out = toolError('bad_input', `the arguments of ${call.name} are not a JSON object`);
    } else if (!tool || !tools.some((d) => d.name === call.name)) {
      out = toolError(
        'not_found',
        `no tool named ${call.name}`,
        `Tools: ${tools.map((d) => d.name).join(', ')}`,
      );
    } else if (
      call.name === 'render_flower' &&
      hasValidator &&
      !passed.has(hashOf((args as Obj).spec) ?? '')
    ) {
      out = toolError(
        'bad_input',
        'render_flower draws only a spec that passed validate_spec with your interpretation.',
        'Call validate_spec with { spec, interpretation } first, fix any errors, then render_flower with the same spec.',
      );
    } else {
      const ctx = withProgress(deps.tools, (e) => emit({ event: 'progress', data: e }));
      try {
        out = await before(tool.run(args, ctx), deadline, clock);
      } catch (e) {
        if (e instanceof Timeout) throw e;
        out = toolError('internal', `${call.name} failed: ${(e as Error)?.message ?? String(e)}`);
      }
    }
    const ok = !isToolError(out);
    emit({
      event: 'tool_result',
      data: {
        id: call.id,
        name: call.name,
        ok,
        summary: summarize(call.name, out),
        ms: clock() - t0,
      },
    });
    if (ok) remember(call.name, args as Obj, out as Obj, by);
    return out;
  }

  function remember(name: string, args: Obj, out: Obj, by: LlmCompletion) {
    if (name === 'propose_spec' && out.spec && typeof out.spec === 'object') {
      const h = typeof out.spec_sha256 === 'string' ? out.spec_sha256 : hashOf(out.spec);
      if (h) specs.set(h, out.spec as Spec);
      const own = hashOf(out.spec);
      if (own && own !== h) specs.set(own, out.spec as Spec);
    }
    if (name === 'validate_spec' && out.valid === true && args.interpretation) {
      const h = hashOf(args.spec);
      if (h) {
        specs.set(h, args.spec as Spec);
        passed.set(h, {
          interpretation: args.interpretation as Interpretation,
          validation: {
            valid: true,
            errors: (out.errors as Validation['errors']) ?? [],
            warnings: (out.warnings as Validation['warnings']) ?? [],
          },
          // the completion that wrote the interpretation and sent the spec to be checked
          signature: by.signature,
        });
      }
    }
    if (name === 'render_flower') {
      const h = hashOf(args.spec);
      const v = h ? passed.get(h) : undefined;
      if (!h || !v) return;
      const flower: FlowerResult = {
        spec: args.spec as Spec,
        spec_sha256: typeof out.spec_sha256 === 'string' ? out.spec_sha256 : h,
        render_sha256: out.render_sha256 as string,
        view_url: out.view_url as string,
        legend: (out.legend as FlowerResult['legend']) ?? [],
        interpretation: v.interpretation,
        validation: v.validation,
      };
      emit({ event: 'flower', data: flower });
      if (v.signature) emit({ event: 'signature', data: v.signature });
    }
  }

  let rounds = 0;
  try {
    while (!stopped()) {
      const last = rounds >= budget.toolRounds;
      if (totals.turns > 0) setStage('thinking');
      // Out of tool rounds: one last call without tools. A user turn, not a second system
      // message, because some chat templates (Qwen's) accept a system message only first.
      const req = last
        ? {
            messages: [
              ...messages,
              {
                role: 'user' as const,
                content: `(Petal: the ${budget.toolRounds} tool rounds are used. Answer now with what the tools gave you.)`,
              },
            ],
          }
        : { messages, tools };
      const pending = llm.complete(req);
      let c: LlmCompletion;
      try {
        c = await before(pending, deadline, clock);
      } catch (e) {
        // a late answer is still paid for
        if (e instanceof Timeout) pending.then((late) => spend(late.cost_usd)).catch(() => {});
        throw e;
      }
      totals.turns++;
      totals.in += c.usage.in;
      totals.out += c.usage.out;
      totals.usd += c.cost_usd;
      totals.fallback ||= c.fallback_used;
      totals.model = c.model;
      await spend(c.cost_usd);
      if (stopped()) return;

      messages.push(c.message);
      const text = c.message.content?.trim();
      if (text) emit({ event: 'message', data: { text } });
      const calls = c.message.tool_calls ?? [];
      if (!calls.length) {
        if (!text) fail('source_failed', 'The model gave an empty answer.');
        break;
      }
      if (last) {
        fail('budget_exhausted', `The chat used its ${budget.toolRounds} tool rounds.`, SKILL_HINT);
        break;
      }
      rounds++;
      for (const call of calls) {
        if (stopped()) return;
        const out = await callTool(call, c);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(forModel(call.name, out)),
        });
      }
      if (totals.usd >= budget.usdPerChat) {
        fail('budget_exhausted', `The chat used its $${budget.usdPerChat} budget.`, SKILL_HINT);
        break;
      }
    }
  } catch (e) {
    if (e instanceof Timeout) {
      fail('budget_exhausted', `The chat ran past its ${budget.wallSeconds} s.`, SKILL_HINT);
    } else if (e instanceof LlmCallError) {
      fail(e.code, e.message, e.hint, e.retryAfterS);
    } else {
      fail('source_failed', `The model call failed: ${(e as Error)?.message ?? String(e)}`);
    }
  }
  if (!stopped()) done();
}
