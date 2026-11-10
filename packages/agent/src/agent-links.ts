// A person's agents, across all their projects (Elco, 9 Nov; coordinator/agent-house-test.md). The person
// copies one prompt into whichever agents they want; it carries an agent link, which can only wait for jobs.
//   POST /api/v1/agents/link          signed in: a new link {id, token, created_at}, its token shown once.
//                                     An older one keeps working until it's revoked.
//   GET  /api/v1/agents/link          {links: [{id, created_at}]}
//   POST /api/v1/agents/link/revoke   {id} for one, {} for all
//   POST /api/v1/agents/wait          Authorization: Bearer <token>, {as, wait_s?}: waits for a job sent to
//                                     `as`, or to anyone, in any of the person's projects, takes it, and
//                                     answers it with a continue link for its project; {job: null} if none
//                                     comes. The agent's own command runs it again.
//   GET  /api/v1/agents               signed in: who's connected, whether each is waiting now, and the job
//                                     each holds
// Presence is a wait that's open right now: nothing runs once the agent's session stops asking (Elco: no
// background service). The work itself goes through the project's continue link, as a pasted line does.
import { randomBytes } from 'node:crypto';
import { TOOLS_VERSION } from '@petal/core';
import type { JobRow, Store } from '@petal/store';
import {
  AGENT_NAME_MAX,
  agentKeyHash,
  makeLink,
  ownerOfAgentKey,
  type ToolContext,
} from '@petal/tools';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { RouteAuth } from './auth-routes.ts';
import { fail } from './routes.ts';

/**
 * The Cloudflare tunnel in front of the site closes a request that gets no answer for 100 s, so a wait is
 * answered by 90 s at the most, whatever it asks; petal.mjs asks again by itself.
 */
export const WAIT_MAX_S = 90;
const WAIT_DEFAULT_S = 50;

/** Rung when a job is handed out; a wait for that person wakes and looks. One per process. */
export class JobBell {
  #waiting = new Map<string, Set<() => void>>();
  ring(owner: string): void {
    for (const wake of this.#waiting.get(owner) ?? []) wake();
  }
  /** Resolves on a ring for `owner`, after `ms`, or when `signal` aborts; returns false on a timeout or abort. */
  wait(owner: string, ms: number, signal?: AbortSignal): Promise<boolean> {
    return new Promise((resolve) => {
      const set = this.#waiting.get(owner) ?? new Set();
      this.#waiting.set(owner, set);
      const done = (rang: boolean) => {
        clearTimeout(timer);
        set.delete(wake);
        signal?.removeEventListener('abort', aborted);
        resolve(rang);
      };
      const wake = () => done(true);
      const aborted = () => done(false);
      const timer = setTimeout(() => done(false), ms);
      set.add(wake);
      signal?.addEventListener('abort', aborted);
    });
  }
}

/** Who's waiting right now, per person: name (lower case) -> as given. In this process only. */
class Presence {
  #open = new Map<string, Map<string, { name: string; count: number }>>();
  enter(owner: string, name: string) {
    const m = this.#open.get(owner) ?? new Map();
    const k = name.toLowerCase();
    const e = m.get(k) ?? { name, count: 0 };
    e.count += 1;
    m.set(k, e);
    this.#open.set(owner, m);
  }
  leave(owner: string, name: string) {
    const m = this.#open.get(owner);
    const e = m?.get(name.toLowerCase());
    if (!e || !m) return;
    e.count -= 1;
    if (e.count <= 0) m.delete(name.toLowerCase());
  }
  waiting(owner: string, name: string) {
    return (this.#open.get(owner)?.get(name.toLowerCase())?.count ?? 0) > 0;
  }
}

export interface AgentLinkDeps {
  store: Store;
  gate: RouteAuth;
  tools: ToolContext;
  bell: JobBell;
  clock?: () => number;
}

export function agentLinkRoutes(d: AgentLinkDeps): Hono {
  const { store, gate, bell } = d;
  const clock = d.clock ?? Date.now;
  const now = () => new Date(clock()).toISOString();
  const presence = new Presence();
  const ok = (c: Context, body: Record<string, unknown>) =>
    c.json({ ...body, tools_version: TOOLS_VERSION });
  const small = bodyLimit({
    maxSize: 16 * 1024,
    onError: (c) => fail(c, 'bad_input', 'the body is larger than 16 KiB'),
  });
  const app = new Hono();
  app.use('/api/v1/agents/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });
  app.use('/api/v1/agents', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });

  /** The signed-in person, or a refusal. */
  const personOr = async (c: Context) => (await gate.personOf(c))?.person ?? null;

  app.post('/api/v1/agents/link', async (c) => {
    const foreign = gate.refuseForeign(c);
    if (foreign) return foreign;
    const owner = await personOr(c);
    if (!owner) return fail(c, 'unauthorised', 'Sign in with your wallet first.');
    const token = `petal_agent_${randomBytes(32).toString('base64url')}`;
    const id = `agl_${randomBytes(9).toString('hex')}`;
    const created_at = now();
    await store.agentLink.create({ id, owner, token_hash: agentKeyHash(token), created_at });
    return ok(c, { id, token, created_at });
  });

  app.get('/api/v1/agents/link', async (c) => {
    const owner = await personOr(c);
    if (!owner) return fail(c, 'unauthorised', 'Sign in with your wallet first.');
    const links = (await store.agentLink.list(owner)).map((l) => ({
      id: l.id,
      created_at: l.created_at,
    }));
    return ok(c, { links });
  });

  app.post('/api/v1/agents/link/revoke', small, async (c) => {
    const foreign = gate.refuseForeign(c);
    if (foreign) return foreign;
    const owner = await personOr(c);
    if (!owner) return fail(c, 'unauthorised', 'Sign in with your wallet first.');
    const body = (await c.req.json().catch(() => ({}))) as { id?: unknown };
    const id = typeof body.id === 'string' && body.id ? body.id : undefined;
    const revoked = await store.agentLink.revoke(owner, now(), id);
    return ok(c, { revoked });
  });

  app.post('/api/v1/agents/wait', small, async (c) => {
    const token = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const owner = await ownerOfAgentKey(store, token);
    if (!owner) {
      return fail(
        c,
        'unauthorised',
        "That agent link isn't valid. Ask the person for a new one from Petals.",
      );
    }
    const body = (await c.req.json().catch(() => null)) as {
      as?: unknown;
      wait_s?: unknown;
    } | null;
    const name = typeof body?.as === 'string' ? body.as.trim() : '';
    if (!name || name.length > AGENT_NAME_MAX) {
      return fail(
        c,
        'bad_input',
        `as must name this agent, 1 to ${AGENT_NAME_MAX} characters (e.g. claude-code)`,
      );
    }
    const asked =
      typeof body?.wait_s === 'number' && body.wait_s >= 0 ? body.wait_s : WAIT_DEFAULT_S;
    const waitMs = Math.min(asked, WAIT_MAX_S) * 1000;
    const signal = c.req.raw.signal;
    await store.agent.seen({ owner, name, last_seen: now() });
    presence.enter(owner, name);
    try {
      const deadline = clock() + waitMs;
      for (;;) {
        // only while someone is still asking: a job taken for a closed request would sit with nobody on it
        if (signal.aborted) return c.body(null, 204);
        const job = await store.job.takeFor(owner, name, now());
        if (job) return ok(c, await delivered(job, owner));
        const left = deadline - clock();
        if (left <= 0) return ok(c, { job: null });
        await bell.wait(owner, left, signal);
      }
    } finally {
      presence.leave(owner, name);
      await store.agent.seen({ owner, name, last_seen: now() });
    }
  });

  /** A job as the agent gets it, with a continue link for its project, made for this job. */
  async function delivered(job: JobRow, owner: string) {
    const caller = { ...d.tools, caller: { subject: owner, door: 'agent' } };
    const made = await makeLink(caller, job.exploration, 'continue');
    const exploration = await store.exploration.get(job.exploration);
    return {
      job: {
        id: job.id,
        kind: job.kind,
        title: job.title,
        brief: job.brief,
        inputs: job.inputs,
        to: job.to,
      },
      project: { exploration: made.url, question: exploration?.question ?? null },
    };
  }

  app.get('/api/v1/agents', async (c) => {
    const owner = await personOr(c);
    if (!owner) return fail(c, 'unauthorised', 'Sign in with your wallet first.');
    const held = await store.job.held(owner);
    const agents = (await store.agent.list(owner)).map((a) => {
      const job = held.find((j) => j.taken_by?.toLowerCase() === a.name.toLowerCase());
      return {
        name: a.name,
        waiting: presence.waiting(owner, a.name),
        last_seen: a.last_seen,
        job: job ? { id: job.id, title: job.title, exploration: job.exploration } : null,
      };
    });
    return ok(c, { agents });
  });

  return app;
}
