// agentRoutes (T058; http-api.md): POST /api/v1/agent/chat (SSE), GET /api/v1/agent/runs/:id
// (JSON, or SSE replay), POST /api/v1/agent/runs/:id/stop, GET /api/v1/attestations/:sha256 (the
// stored report, byte for byte). A chat is a run: a job in this process (jobs.ts), stored event by
// event, so it keeps going when the browser disconnects, and the SSE stream only observes it.

import { join } from 'node:path';
import type { Price } from '@petal/core';
import { sha256Hex, TOOLS_VERSION } from '@petal/core';
import type { ChatInput, ChatMessage, Draft, ToolError, ToolErrorCode } from '@petal/core/types';
import type { JobRow } from '@petal/store';
import {
  bodyCap,
  type Config,
  clientAddress,
  DATA_FULL,
  isLocalSite,
  overDataBudget,
  privateStore,
  remember,
  specBody,
  type ToolContext,
} from '@petal/tools';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import type { ChatAdmission, RouteAuth } from './auth-routes.ts';
import { defaultSettings, resolveSettings, settingsOf } from './catalogue.ts';
import type { Bell } from './hand-job.ts';
import { type Earlier, type Observed, runJobs } from './jobs.ts';
import type { Budget, LlmClient } from './llm.ts';
import { RECORDED_ATTESTATIONS } from './recorded.ts';
import { RUN_ID, type RunStore } from './runs.ts';
import { attestationStore } from './signature.ts';
import { flowersOf } from './thread.ts';
import type { AnyTool } from './tool-defs.ts';

/**
 * The one route that may take more than the rest's 256 KiB: the site can send a whole conversation
 * back, 100 messages of up to 20,000 characters, with its draft.
 */
export const CHAT_BODY_MAX_BYTES = 512 * 1024;

/** HTTP status per error code (http-api.md, Rules). */
export const STATUS: Record<ToolErrorCode, number> = {
  bad_input: 400,
  unauthorised: 401,
  invite_required: 403,
  not_found: 404,
  cannot_read: 422,
  invalid_spec: 422,
  rate_limited: 429,
  budget_exhausted: 429,
  payment_required: 402,
  not_on_this_site: 403,
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
  /** what Petals charges at (price/v1); default price.json, every switch off */
  price?: Price;
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
  /** sessions, run owners and who pays; none: every run is public and unowned, as before T193 */
  auth?: RouteAuth;
  /** rung when a job is handed out, so a person's waiting agent wakes (agent-links.ts) */
  bell?: Bell;
  /** filled in here: what a report does, taking it up at once in its run (app.ts wires it to report_job) */
  takeUp?: { current?: (job: JobRow) => Promise<void> };
}

export function stateDirOf(config: Config): string {
  return config.stateDir ?? join(config.root, '.petal');
}

type ErrorBody = ToolError['error'];

export function fail(
  c: Context,
  code: ToolErrorCode,
  message: string,
  hint?: string,
  retry?: number,
) {
  const error: ErrorBody = { code, message };
  if (hint) error.hint = hint;
  if (retry !== undefined) error.retry_after_s = retry;
  return c.json({ error, tools_version: TOOLS_VERSION }, STATUS[code] as 400);
}

/** In memory, per process (Phase A). Returns null, or the seconds to wait. */
export function limiter(
  max: number,
  windowMs: number,
  clock: () => number,
  hits: Map<string, number[]> = new Map(),
) {
  return (key: string): number | null => {
    const now = clock();
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      remember(hits, key, list);
      return Math.max(1, Math.ceil(((list[0] ?? now) + windowMs - now) / 1000));
    }
    list.push(now);
    remember(hits, key, list);
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

function wantsSse(c: Context): boolean {
  return (c.req.header('accept') ?? '').includes('text/event-stream');
}

/** A caller who asks only for JSON gets the run id at once, and observes the run separately. */
function wantsJson(c: Context): boolean {
  const accept = c.req.header('accept') ?? '';
  return accept.includes('application/json') && !accept.includes('text/event-stream');
}

/** Where a viewer starts: past Last-Event-ID, else at ?from=, else the start. Null if unreadable. */
function cursorOf(c: Context): number | null {
  const last = c.req.header('last-event-id');
  const raw = last ?? c.req.query('from') ?? '0';
  if (!/^\d{1,15}$/.test(raw)) return null;
  return Number(raw) + (last === undefined ? 0 : 1);
}

/** Write events as SSE; `id` is the event's seq in the run's log. Leaving touches nothing but this. */
function sse(c: Context, events: AsyncIterable<Observed>, leave: () => void) {
  return streamSSE(c, async (stream) => {
    let open = true;
    stream.onAbort(() => {
      open = false;
      leave();
    });
    for await (const { seq, event: e } of events) {
      if (!open) break;
      await stream.writeSSE({
        event: e.event,
        data: JSON.stringify(e.data),
        ...(seq === undefined ? {} : { id: String(seq) }),
      });
    }
  });
}

/** The full routes; `agentRoutes` in index.ts is this with the contract's arguments only. */
export function createAgentRoutes(deps: AgentRouteDeps, o: AgentRouteOptions = {}): Hono {
  const clock = o.clock ?? Date.now;
  const jobs = runJobs(deps, {
    ...o,
    ...(o.auth?.accountOf
      ? { accountOf: (person: string) => o.auth?.accountOf?.(person) ?? Promise.resolve(null) }
      : {}),
  });
  // A report that comes back (report_job): Petals' agent takes it up at once, as a turn in the run that handed
  // the job out, paid from the person's own credit (Elco, 9 Nov), or else from the invite they chat on (10 Nov).
  // With neither, or the run already going, it waits in the job row for the person's next message, as before.
  if (o.takeUp) {
    o.takeUp.current = async (job) => {
      if (!job.run || jobs.running(job.run) || !o.auth?.admitOwner) return;
      // A job in parts (swarm.md step 4) comes back once every part has: the report that completes the group,
      // and only that one, starts the turn, so two parts reporting together make one.
      const parts = job.part_of
        ? (await privateStore(deps.tools.config).job.list(job.exploration)).filter(
            (j) => j.part_of === job.part_of,
          )
        : [];
      if (parts.some((j) => j.status === 'open' || j.status === 'taken')) return;
      const last = [...parts]
        .sort((a, b) =>
          a.updated_at === b.updated_at
            ? a.id < b.id
              ? -1
              : 1
            : a.updated_at < b.updated_at
              ? -1
              : 1,
        )
        .at(-1);
      if (last && last.id !== job.id) return;
      const owner = await deps.runs.ownerOf?.(job.run);
      const stored = await deps.runs.get(job.run);
      if (!owner || !stored) return;
      const admitted = await o.auth.admitOwner(owner, deps.llm, deps.budget);
      if (!admitted?.budget) return;
      const came: ChatMessage = {
        role: 'user',
        content: parts.length
          ? `(Petals) All ${parts.length} parts of the job came back. Their reports are under Jobs: put them together into one answer, in a few sentences.`
          : `(Petals) The job "${job.title}" came back from ${job.taken_by ?? "the person's own agent"}${job.status === 'failed' ? ', not done' : ''}. Its report is under Jobs: say what it found, in a sentence or two.`,
      };
      const input: ChatInput = {
        messages: [...stored.messages, came],
        ...(stored.draft ? { draft: stored.draft } : {}),
        run_id: job.run,
      };
      const said = await deps.runs.thread?.(job.run);
      const earlier: Earlier = {
        flowers: flowersOf(stored.events),
        ...(said ? { thread: [...said, came] } : {}),
      };
      const runId = await deps.runs.create(input, { owner });
      const settings = await deps.runs.settingsOf?.(runId);
      const pick = settings ? settingsOf(settings) : undefined;
      void jobs
        .start(
          runId,
          input,
          earlier,
          admitted.budget,
          pick && { model: pick.model, effort: pick.effort },
        )
        .then(() => admitted.onEnd?.())
        .catch((e) =>
          console.warn(`petal: taking up job ${job.id} failed: ${(e as Error).message}`),
        );
    };
  }
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

  /** A run with an owner is that owner's alone: to anyone else, it doesn't exist (SYS-014). */
  async function mayRead(c: Context, runId: string): Promise<boolean> {
    const owner = await deps.runs.ownerOf?.(runId);
    return !owner || owner === (await o.auth?.subjectOf(c));
  }

  const app = new Hono();
  app.use('/api/v1/agent/*', cors());
  app.use('/api/v1/attestations/*', cors());
  app.use('/api/v1/agent/runs/*', bodyCap);
  const local = isLocalSite(deps.tools.config.apiBase);

  app.post(
    '/api/v1/agent/chat',
    bodyLimit({
      maxSize: CHAT_BODY_MAX_BYTES,
      onError: (c) => fail(c, 'bad_input', 'the body is larger than 512 KiB'),
    }),
    async (c) => {
      // Before the rate limit: a refused chat costs nothing, and shouldn't use up the allowance.
      // Before the body too, so a stranger's is never parsed.
      const admitted: ChatAdmission = (await o.auth?.admitChat(c, deps.llm, deps.budget)) ?? {};
      if (admitted.refused) return admitted.refused;
      // A sponsored chat is the invite's to pay for. Nobody's stands behind one with no budget.
      if (!admitted.budget && (await overDataBudget(deps.tools.config, new Date(clock())))) {
        return fail(c, 'budget_exhausted', DATA_FULL);
      }
      let raw: unknown;
      try {
        raw = await c.req.json();
      } catch {
        raw = undefined;
      }
      const owner = admitted.subject ? { owner: admitted.subject } : undefined;
      // A follow-up is not a new chat: only the daily cap and this wider limit bound a conversation.
      const followUp = !!(raw as { run_id?: unknown } | undefined)?.run_id;
      const address = clientAddress(c, local);
      const wait = followUp
        ? followUpLimit(address)
        : admitted.ownCredit
          ? null
          : chatLimit(address);
      if (wait !== null) {
        const n = followUp ? `${followUpsPerHour} follow-ups` : `${perHour} chats`;
        return fail(c, 'rate_limited', `At most ${n} an hour from one address.`, undefined, wait);
      }
      if (raw === undefined) return fail(c, 'bad_input', 'the body is not JSON');
      const parsed = parseChat(raw);
      if (typeof parsed === 'string') return fail(c, 'bad_input', parsed);

      // Additive (T312): what the person picked, and an exploration from another door to pick up.
      const asked = raw as { settings?: unknown; exploration?: unknown };
      if (asked.exploration !== undefined && parsed.run_id) {
        return fail(c, 'bad_input', 'a chat continues a run or an exploration, not both');
      }
      let input: ChatInput = parsed;
      let storedBefore = 0;
      let earlier: Earlier = {};
      let runId: string;
      if (parsed.run_id) {
        const id = parsed.run_id;
        if (!(await mayRead(c, id))) return fail(c, 'not_found', `no run ${id}`);
        if (jobs.running(id)) {
          return fail(
            c,
            'bad_input',
            `run ${id} is still going`,
            `Follow it at GET /api/v1/agent/runs/${id}.`,
          );
        }
        const stored = await deps.runs.get(id);
        if (!stored) return fail(c, 'not_found', `no run ${id}`);
        const settings =
          asked.settings === undefined
            ? undefined
            : resolveSettings(asked.settings, settingsOf(await deps.runs.settingsOf?.(id)));
        if (typeof settings === 'string') return fail(c, 'bad_input', settings);
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
        runId = await deps.runs.create(input, { ...owner, ...(settings ? { settings } : {}) });
        storedBefore = runId === id ? stored.events.length : 0;
      } else {
        const settings =
          asked.settings === undefined
            ? undefined
            : resolveSettings(asked.settings, defaultSettings());
        if (typeof settings === 'string') return fail(c, 'bad_input', settings);
        let exploration: string | undefined;
        if (asked.exploration !== undefined) {
          // Only its owner can pick it up, and to anyone else it doesn't exist. Nothing is written on
          // it here: a run points at it, and its flowers become steps as they do for any run.
          const id = String(asked.exploration);
          const row = await privateStore(deps.tools.config).exploration.get(id);
          if (!admitted.subject || row?.owner !== admitted.subject) {
            return fail(c, 'not_found', `no exploration ${id}`);
          }
          exploration = row.id;
          const spec =
            !parsed.draft && row.head ? await specBody(deps.tools.config, row.head) : null;
          if (spec) input = { ...input, draft: { spec } };
        }
        runId = await deps.runs.create(input, {
          ...owner,
          ...(settings ? { settings } : {}),
          ...(exploration ? { exploration } : {}),
        });
      }
      // What this conversation has picked, however it was set: this chat's body, or an earlier one's,
      // or PATCH. None picked: the server's own model. Checked already, so a bad pick spent nothing.
      const stored = await deps.runs.settingsOf?.(runId);
      const pick = stored ? settingsOf(stored) : undefined;
      keepAlive(
        c,
        jobs
          .start(
            runId,
            input,
            earlier,
            admitted.budget,
            pick && { model: pick.model, effort: pick.effort },
          )
          // on the credit contract, what the chat cost is charged once it has ended
          .then(() => admitted.onEnd?.()),
      );
      if (wantsJson(c)) {
        return c.json({ run_id: runId, status: 'running', tools_version: TOOLS_VERSION }, 202);
      }
      const view = jobs.observe(runId, storedBefore);
      return sse(c, view.events, view.leave);
    },
  );

  app.get('/api/v1/agent/runs/:id', async (c) => {
    const id = c.req.param('id');
    if (!RUN_ID.test(id)) return fail(c, 'bad_input', 'that is not a run id');
    if (!(await mayRead(c, id))) return fail(c, 'not_found', `no run ${id}`);
    c.header('Cache-Control', 'no-store');
    const run = await deps.runs.get(id);
    if (!run) return fail(c, 'not_found', `no run ${id}`);
    if (!wantsSse(c)) return c.json({ ...run, tools_version: TOOLS_VERSION });

    const from = cursorOf(c);
    if (from === null) return fail(c, 'bad_input', 'the cursor must be a whole number');
    const view = jobs.observe(id, from);
    return sse(c, view.events, view.leave);
  });

  // Reports what it witnessed: the run stopped, or it had already finished. An owned run answers only
  // to its owner, and an unowned one to whoever holds its id (SYS-014).
  app.post('/api/v1/agent/runs/:id/stop', async (c) => {
    const foreign = o.auth?.refuseForeign(c);
    if (foreign) return foreign;
    const id = c.req.param('id');
    if (!RUN_ID.test(id)) return fail(c, 'bad_input', 'that is not a run id');
    if (!(await mayRead(c, id))) return fail(c, 'not_found', `no run ${id}`);
    if (!(await deps.runs.get(id))) return fail(c, 'not_found', `no run ${id}`);
    const hadJob = await jobs.stop(id);
    const status = (await deps.runs.get(id))?.status;
    const stopped = hadJob && status === 'stopped';
    return c.json({
      run_id: id,
      status,
      stopped,
      already_finished: !stopped && status !== 'running',
      tools_version: TOOLS_VERSION,
    });
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
