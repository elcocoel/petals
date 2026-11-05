// agentRoutes (T058; http-api.md): POST /api/v1/agent/chat (SSE), GET /api/v1/agent/runs/:id
// (JSON, or SSE replay), GET /api/v1/attestations/:sha256 (the stored report, byte for byte).
// A chat is a run: it runs in the background and is stored event by event, so it keeps going when
// the browser disconnects, and the SSE stream only follows it.
import { join } from 'node:path';
import { sha256Hex, TOOLS_VERSION } from '@petal/core';
import type {
  AgentEvent,
  ChatInput,
  ChatMessage,
  Draft,
  ToolError,
  ToolErrorCode,
} from '@petal/core/types';
import type { Config, ToolContext } from '@petal/tools';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { Channel } from './channel.ts';
import type { Budget, LlmClient, LlmMessage } from './llm.ts';
import { RECORDED_ATTESTATIONS } from './recorded.ts';
import { startRun } from './run.ts';
import { RUN_ID, type RunStore } from './runs.ts';
import { attestationStore } from './signature.ts';
import { type EarlierFlower, flowersOf } from './thread.ts';
import type { AnyTool } from './tool-defs.ts';

/** HTTP status per error code (http-api.md, Rules). */
export const STATUS: Record<ToolErrorCode, number> = {
  bad_input: 400,
  unauthorised: 401,
  not_found: 404,
  cannot_read: 422,
  invalid_spec: 422,
  rate_limited: 429,
  budget_exhausted: 429,
  source_failed: 502,
  internal: 500,
};

export interface AgentRouteDeps {
  tools: ToolContext;
  llm: LlmClient;
  budget: Budget;
  runs: RunStore;
}

export interface AgentRouteOptions {
  /** default the @petal/tools registry */
  registry?: readonly AnyTool[];
  heartbeatMs?: number;
  /** new chats per IP per hour; default 10 */
  chatsPerHour?: number;
  /** follow-ups per IP per hour, on top: a conversation is many messages; default 60 */
  followUpsPerHour?: number;
  /** default <stateDir>/attestations */
  attestationsDir?: string;
  /** keeps a background run alive on a serverless host (Vercel's waitUntil, Next's after) */
  waitUntil?: (p: Promise<unknown>) => void;
  clock?: () => number;
}

export function stateDirOf(config: Config): string {
  return config.stateDir ?? join(config.root, '.petal');
}

type ErrorBody = ToolError['error'];

function fail(c: Context, code: ToolErrorCode, message: string, hint?: string, retry?: number) {
  const error: ErrorBody = { code, message };
  if (hint) error.hint = hint;
  if (retry !== undefined) error.retry_after_s = retry;
  return c.json({ error, tools_version: TOOLS_VERSION }, STATUS[code] as 400);
}

/** The caller's address: proxy headers first, then the Node socket. */
function clientIp(c: Context): string {
  const fwd = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  const h = fwd || c.req.header('x-real-ip') || c.req.header('cf-connecting-ip');
  if (h) return h;
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress ?? 'unknown';
}

/** In memory, per process (Phase A). Returns null, or the seconds to wait. */
function limiter(max: number, windowMs: number, clock: () => number) {
  const hits = new Map<string, number[]>();
  return (key: string): number | null => {
    const now = clock();
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    }
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      hits.set(key, list);
      return Math.max(1, Math.ceil(((list[0] ?? now) + windowMs - now) / 1000));
    }
    list.push(now);
    hits.set(key, list);
    return null;
  };
}

/** Checks the chat body (http-api.md, Agent chat). Returns the input, or what is wrong. */
export function parseChat(body: unknown): ChatInput | string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'the body must be an object';
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.messages) || b.messages.length === 0)
    return 'messages must be a non-empty list';
  if (b.messages.length > 100) return 'at most 100 messages';
  const messages: ChatMessage[] = [];
  for (const [i, m] of b.messages.entries()) {
    const role = (m as { role?: unknown })?.role;
    const content = (m as { content?: unknown })?.content;
    if (role !== 'user' && role !== 'assistant')
      return `messages[${i}].role must be user or assistant`;
    if (typeof content !== 'string') return `messages[${i}].content must be a string`;
    if (content.length > 20_000)
      return `messages[${i}].content is too long (20,000 characters at most)`;
    messages.push({ role, content });
  }
  if (!messages.some((m) => m.role === 'user')) return 'there must be a user message';
  const input: ChatInput = { messages };
  if (b.draft !== undefined && b.draft !== null) {
    const d = b.draft as Record<string, unknown>;
    if (typeof d !== 'object' || Array.isArray(d)) return 'draft must be an object';
    for (const k of ['spec', 'entry'] as const) {
      if (
        d[k] !== undefined &&
        (typeof d[k] !== 'object' || d[k] === null || Array.isArray(d[k]))
      ) {
        return `draft.${k} must be an object`;
      }
    }
    input.draft = d as Draft;
  }
  if (b.run_id !== undefined) {
    if (typeof b.run_id !== 'string' || !RUN_ID.test(b.run_id)) return 'run_id is not a run id';
    input.run_id = b.run_id;
  }
  return input;
}

/** The client may send the whole conversation or only what is new. */
function merge(stored: ChatMessage[], sent: ChatMessage[]): ChatMessage[] {
  const prefix =
    sent.length >= stored.length &&
    stored.every((m, i) => sent[i]?.role === m.role && sent[i]?.content === m.content);
  return prefix ? sent : [...stored, ...sent];
}

/** A chat running in this process: its events so far, and who follows them. */
class LiveRun {
  readonly events: AgentEvent[] = [];
  /** how many stored events the run had before this chat (earlier chats of the same run) */
  readonly storedBefore: number;
  running = true;
  /** the background chat; it ends after `done` */
  task?: Promise<void>;
  #subs = new Set<Channel<AgentEvent>>();
  constructor(storedBefore: number) {
    this.storedBefore = storedBefore;
  }
  push(e: AgentEvent) {
    if (e.event !== 'heartbeat') this.events.push(e);
    for (const s of this.#subs) s.push(e);
  }
  finish() {
    this.running = false;
    for (const s of this.#subs) s.close();
    this.#subs.clear();
  }
  /** this chat's events from `from` on, then live ones until the chat ends */
  follow(from = 0): Channel<AgentEvent> {
    const ch = new Channel<AgentEvent>();
    for (const e of this.events.slice(from)) ch.push(e);
    if (!this.running) ch.close();
    else {
      this.#subs.add(ch);
      ch.onReturn = () => this.#subs.delete(ch);
    }
    return ch;
  }
}

function wantsSse(c: Context): boolean {
  return (c.req.header('accept') ?? '').includes('text/event-stream');
}

/** Write events as SSE; `id` is the event's index in this stream. */
function sse(c: Context, events: AsyncIterable<AgentEvent> | AgentEvent[], stop?: () => void) {
  return streamSSE(c, async (stream) => {
    let seq = 0;
    let open = true;
    stream.onAbort(() => {
      open = false;
      stop?.();
    });
    for await (const e of events) {
      if (!open) break;
      await stream.writeSSE({ event: e.event, data: JSON.stringify(e.data), id: String(seq++) });
    }
  });
}

/** The full routes; `agentRoutes` in index.ts is this with the contract's arguments only. */
export function createAgentRoutes(deps: AgentRouteDeps, o: AgentRouteOptions = {}): Hono {
  const clock = o.clock ?? Date.now;
  const live = new Map<string, LiveRun>();
  const perHour = o.chatsPerHour ?? 10;
  const chatLimit = limiter(perHour, 3_600_000, clock);
  const followUpsPerHour = o.followUpsPerHour ?? 60;
  const followUpLimit = limiter(followUpsPerHour, 3_600_000, clock);
  const reports = attestationStore(
    o.attestationsDir ?? join(stateDirOf(deps.tools.config), 'attestations'),
  );
  // A recorded run names a report no server fetched: it ships with the transcript (T061).
  const recordedReports = attestationStore(RECORDED_ATTESTATIONS);

  function keepAlive(c: Context, p: Promise<unknown>) {
    if (o.waitUntil) return o.waitUntil(p);
    try {
      c.executionCtx.waitUntil(p);
    } catch {
      // Node: the process stays up, so the run just goes on
    }
  }

  function start(
    runId: string,
    input: ChatInput,
    storedBefore: number,
    earlier: { thread?: LlmMessage[]; flowers?: EarlierFlower[] } = {},
  ): LiveRun {
    const run = new LiveRun(storedBefore);
    live.set(runId, run);
    const keep = async (e: AgentEvent) => {
      if (e.event !== 'heartbeat') {
        // a store that fails must not stop the chat; the stream still carries every event
        await deps.runs.append(runId, e).catch(() => {});
      }
      run.push(e);
    };
    run.task = (async () => {
      try {
        const events = startRun(
          { messages: input.messages, ...(input.draft ? { draft: input.draft } : {}), ...earlier },
          { tools: deps.tools, llm: deps.llm, budget: deps.budget },
          {
            runId,
            registry: o.registry,
            heartbeatMs: o.heartbeatMs,
            onThread: (t) => deps.runs.saveThread?.(runId, t),
          },
        );
        for await (const e of events) await keep(e);
      } catch (e) {
        await keep({ event: 'error', data: { code: 'internal', message: String(e) } });
        await keep({
          event: 'done',
          data: {
            turns: 0,
            model: deps.llm.model,
            fallback_used: false,
            tokens: { in: 0, out: 0 },
            cost_usd: 0,
          },
        });
      } finally {
        run.finish();
        const t = setTimeout(() => {
          if (live.get(runId) === run) live.delete(runId);
        }, 60_000);
        t.unref?.();
      }
    })();
    return run;
  }

  const app = new Hono();
  app.use('/api/v1/agent/*', cors());
  app.use('/api/v1/attestations/*', cors());

  app.post(
    '/api/v1/agent/chat',
    bodyLimit({
      maxSize: 512 * 1024,
      onError: (c) => fail(c, 'bad_input', 'the body is larger than 512 KiB'),
    }),
    async (c) => {
      let raw: unknown;
      try {
        raw = await c.req.json();
      } catch {
        raw = undefined;
      }
      // A follow-up is not a new chat: only the daily cap and this wider limit bound a conversation.
      const followUp = !!(raw as { run_id?: unknown } | undefined)?.run_id;
      const wait = (followUp ? followUpLimit : chatLimit)(clientIp(c));
      if (wait !== null) {
        const n = followUp ? `${followUpsPerHour} follow-ups` : `${perHour} chats`;
        return fail(c, 'rate_limited', `At most ${n} an hour from one address.`, undefined, wait);
      }
      if (raw === undefined) return fail(c, 'bad_input', 'the body is not JSON');
      const parsed = parseChat(raw);
      if (typeof parsed === 'string') return fail(c, 'bad_input', parsed);

      let input: ChatInput = parsed;
      let storedBefore = 0;
      let earlier: { thread?: LlmMessage[]; flowers?: EarlierFlower[] } = {};
      let runId: string;
      if (parsed.run_id) {
        const id = parsed.run_id;
        if (live.get(id)?.running) {
          return fail(
            c,
            'bad_input',
            `run ${id} is still going`,
            `Follow it at GET /api/v1/agent/runs/${id}.`,
          );
        }
        const stored = await deps.runs.get(id);
        if (!stored) return fail(c, 'not_found', `no run ${id}`);
        const draft = parsed.draft ?? stored.draft;
        input = {
          messages: merge(stored.messages, parsed.messages),
          ...(draft ? { draft } : {}),
          run_id: id,
        };
        const said = await deps.runs.thread?.(id);
        const fresh = input.messages.slice(stored.messages.length);
        earlier = {
          flowers: flowersOf(stored.events),
          ...(said ? { thread: [...said, ...fresh] } : {}),
        };
        runId = await deps.runs.create(input);
        storedBefore = runId === id ? stored.events.length : 0;
      } else {
        runId = await deps.runs.create(input);
      }
      const run = start(runId, input, storedBefore, earlier);
      if (run.task) keepAlive(c, run.task);
      const follow = run.follow();
      return sse(c, follow, () => void follow.return());
    },
  );

  app.get('/api/v1/agent/runs/:id', async (c) => {
    const id = c.req.param('id');
    if (!RUN_ID.test(id)) return fail(c, 'bad_input', 'that is not a run id');
    const run = await deps.runs.get(id);
    if (!run) return fail(c, 'not_found', `no run ${id}`);
    if (!wantsSse(c)) return c.json({ ...run, tools_version: TOOLS_VERSION });

    const here = live.get(id);
    if (here?.running) {
      // earlier chats of this run from the store, this one from memory, then live
      const follow = here.follow();
      async function* replay() {
        yield* run?.events.slice(0, here?.storedBefore) ?? [];
        yield* follow;
      }
      return sse(c, replay(), () => void follow.return());
    }
    if (run.status !== 'running') return sse(c, run.events);

    // running in another process (or one that stopped): follow the store until it ends
    const store = deps.runs;
    const stale = (deps.budget.wallSeconds + 60) * 1000;
    async function* poll() {
      let sent = 0;
      let cur = run;
      while (cur) {
        yield* cur.events.slice(sent);
        sent = cur.events.length;
        if (cur.status !== 'running') return;
        if (clock() - Date.parse(cur.updated_at) > stale) return;
        await new Promise((r) => setTimeout(r, 1000));
        cur = await store.get(id);
      }
    }
    return sse(c, poll());
  });

  app.get('/api/v1/attestations/:sha256', (c) => {
    const sha = c.req.param('sha256').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sha)) return fail(c, 'bad_input', 'that is not a SHA-256');
    const bytes = reports.get(sha) ?? recordedReports.get(sha);
    if (!bytes) return fail(c, 'not_found', `no attestation report ${sha}`);
    if (sha256Hex(bytes) !== sha) {
      return fail(c, 'internal', 'the stored report does not match its hash');
    }
    return c.body(bytes, 200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
  });

  return app;
}
