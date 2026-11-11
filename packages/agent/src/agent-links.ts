// A person's agents, across all their projects (Elco, 9 Nov; coordinator/agent-house-test.md). The person
// copies one prompt into whichever agents they want; it carries an agent link, which can only wait for jobs.
//   POST /api/v1/agents/link          signed in: a new link {id, token, created_at}, its token shown once.
//                                     An older one keeps working until it's revoked.
//   GET  /api/v1/agents/link          {links: [{id, created_at}]}
//   POST /api/v1/agents/link/revoke   {id} for one, {} for all
//   POST /api/v1/agents/disconnect    signed in: {name}, one agent, out of the list and refused from now on;
//                                     the prompt copied into it again connects it again (Elco, 10 Nov)
//   POST /api/v1/agents/wait          Authorization: Bearer <token>, {as, worker?, wait_s?}: waits for a job
//                                     sent to `as`, or to anyone, in any of the person's projects, takes it,
//                                     and answers it with a continue link for its project; {job: null} if
//                                     none comes. The agent's own command runs it again. `worker` is the
//                                     window or sub-agent asking, so several of one name each hold a job.
//   POST /api/v1/jobs/:job/stop       signed in: one of their jobs, stopped; its worker is told on its next call
//   POST /api/v1/jobs/:job/retry      signed in: a taken, failed or stopped one, open again for whoever takes it
//   POST /api/v1/jobs/:job/hand-over  signed in, {to}: the same, for that agent; its old worker is told
//   GET  /api/v1/agents               signed in: who's connected, one entry per worker (n: 1, 2, …),
//                                     whether each is waiting now, and the job each holds
// Presence is a wait that's open right now: nothing runs once the agent's session stops asking (Elco: no
// background service). The work itself goes through the project's continue link, as a pasted line does.
import { randomBytes } from 'node:crypto';
import { TOOLS_VERSION } from '@petal/core';
import type { JobRow, Store } from '@petal/store';
import {
  AGENT_NAME_MAX,
  agentKeyHash,
  agentKeyOf,
  DISCONNECTED,
  disconnectedFor,
  makeLink,
  type ToolContext,
  touched,
  viewOfPerson,
  workerPlace,
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

/** A worker's id: petal.mjs makes it when a window or a sub-agent joins (swarm.md step 1). */
const WORKER = /^[A-Za-z0-9_-]{1,32}$/;

/** Who's waiting right now, per person: name (lower case) and worker -> open waits. In this process only. */
class Presence {
  #open = new Map<string, Map<string, number>>();
  #key = (name: string, worker: string | null) => `${name.toLowerCase()}\u0000${worker ?? ''}`;
  enter(owner: string, name: string, worker: string | null) {
    const m = this.#open.get(owner) ?? new Map<string, number>();
    const k = this.#key(name, worker);
    m.set(k, (m.get(k) ?? 0) + 1);
    this.#open.set(owner, m);
  }
  leave(owner: string, name: string, worker: string | null) {
    const m = this.#open.get(owner);
    const k = this.#key(name, worker);
    const n = m?.get(k);
    if (!m || n === undefined) return;
    if (n <= 1) m.delete(k);
    else m.set(k, n - 1);
  }
  waiting(owner: string, name: string, worker: string | null) {
    return (this.#open.get(owner)?.get(this.#key(name, worker)) ?? 0) > 0;
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

  app.post('/api/v1/agents/disconnect', small, async (c) => {
    const foreign = gate.refuseForeign(c);
    if (foreign) return foreign;
    const owner = await personOr(c);
    if (!owner) return fail(c, 'unauthorised', 'Sign in with your wallet first.');
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const at = now();
    if (!name || !(await store.agent.setDisconnected(owner, name, at))) {
      return fail(c, 'not_found', 'You have no agent by that name.');
    }
    // a wait it holds open wakes, and ends
    bell.ring(owner);
    return ok(c, { disconnected: { name, at } });
  });

  app.post('/api/v1/agents/wait', small, async (c) => {
    const token = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const link = await agentKeyOf(store, token);
    if (!link) {
      return fail(
        c,
        'unauthorised',
        "That agent link isn't valid. Ask the person for a new one from Petals.",
      );
    }
    const body = (await c.req.json().catch(() => null)) as {
      as?: unknown;
      worker?: unknown;
      wait_s?: unknown;
      can?: unknown;
    } | null;
    const name = typeof body?.as === 'string' ? body.as.trim() : '';
    if (!name || name.length > AGENT_NAME_MAX) {
      return fail(
        c,
        'bad_input',
        `as must name this agent, 1 to ${AGENT_NAME_MAX} characters (e.g. claude-code)`,
      );
    }
    const worker = body?.worker === undefined ? null : body.worker;
    if (worker !== null && (typeof worker !== 'string' || !WORKER.test(worker))) {
      return fail(
        c,
        'bad_input',
        'worker must be 1 to 32 letters, digits, - or _, as petal.mjs makes it when the agent joins',
      );
    }
    const owner = link.owner;
    if (await disconnectedFor(store, link, name, { reconnect: true })) {
      return fail(c, 'unauthorised', DISCONNECTED);
    }
    const asked =
      typeof body?.wait_s === 'number' && body.wait_s >= 0 ? body.wait_s : WAIT_DEFAULT_S;
    const waitMs = Math.min(asked, WAIT_MAX_S) * 1000;
    const signal = c.req.raw.signal;
    // what this worker says it can do, in its own words, each wait (swarm lean 2): the latest wins, null if unsaid
    const can = typeof body?.can === 'string' && body.can.trim() ? body.can.trim() : null;
    await store.agent.seen({ owner, name, worker, last_seen: now(), can });
    presence.enter(owner, name, worker);
    try {
      const deadline = clock() + waitMs;
      for (;;) {
        // only while someone is still asking: a job taken for a closed request would sit with nobody on it
        if (signal.aborted) return c.body(null, 204);
        const job = await store.job.takeFor(owner, name, now(), worker);
        if (job) return ok(c, await delivered(job, owner, name, worker));
        const left = deadline - clock();
        if (left <= 0) return ok(c, { job: null });
        await bell.wait(owner, left, signal);
        if (await disconnectedFor(store, link, name)) return fail(c, 'unauthorised', DISCONNECTED);
      }
    } finally {
      presence.leave(owner, name, worker);
      await store.agent.seen({ owner, name, worker, last_seen: now() });
    }
  });

  // -- supervision, without timers (swarm.md step 3): the person stops a job, or sends it again

  /** One of the signed-in person's jobs, from any of their projects; null for anyone else's. */
  async function ownJob(c: Context): Promise<{ owner: string; job: JobRow } | null> {
    const owner = await personOr(c);
    const job = owner ? await store.job.get(c.req.param('job') ?? '') : null;
    const exploration = job ? await store.exploration.get(job.exploration) : null;
    return owner && job && exploration?.owner === owner ? { owner, job } : null;
  }
  const jobOut = (j: JobRow) => ({
    id: j.id,
    status: j.status,
    to: j.to,
    taken_by: j.taken_by,
    conversation: j.conversation,
    updated_at: j.updated_at,
  });
  /** Pages following the job's project and its own conversation read it again. */
  const changed = (j: JobRow) => {
    d.tools.live?.changed(j.exploration);
    if (j.conversation) d.tools.live?.changed(j.conversation);
  };
  const NO_JOB = 'You have no job by that id.';

  app.post('/api/v1/jobs/:job/stop', small, async (c) => {
    const foreign = gate.refuseForeign(c);
    if (foreign) return foreign;
    const own = await ownJob(c);
    if (!own) return fail(c, 'not_found', NO_JOB);
    const stopped = await store.job.stop(own.job.id, now());
    if (!stopped)
      return fail(
        c,
        'bad_input',
        `Only an open or taken job can be stopped; this one is ${own.job.status}.`,
      );
    changed(stopped);
    return ok(c, { job: jobOut(stopped) });
  });

  /** Open again, for anyone or for `to`, and the waiting agents wake. */
  async function again(c: Context, to?: string) {
    const own = await ownJob(c);
    if (!own) return fail(c, 'not_found', NO_JOB);
    const open = await store.job.reopen(own.job.id, now(), to);
    if (!open)
      return fail(
        c,
        'bad_input',
        `Only a taken, failed or stopped job can go again; this one is ${own.job.status}.`,
      );
    changed(open);
    bell.ring(own.owner);
    return ok(c, { job: jobOut(open) });
  }

  app.post('/api/v1/jobs/:job/retry', small, async (c) => {
    const foreign = gate.refuseForeign(c);
    if (foreign) return foreign;
    return again(c);
  });

  app.post('/api/v1/jobs/:job/hand-over', small, async (c) => {
    const foreign = gate.refuseForeign(c);
    if (foreign) return foreign;
    const owner = await personOr(c);
    if (!owner) return fail(c, 'not_found', NO_JOB);
    const body = (await c.req.json().catch(() => ({}))) as { to?: unknown };
    const asked = typeof body.to === 'string' ? body.to.trim().toLowerCase() : '';
    const agent = (await store.agent.list(owner)).find((a) => a.name.toLowerCase() === asked);
    if (!agent) return fail(c, 'not_found', 'to must be one of your connected agents, by name.');
    return again(c, agent.name);
  });

  /**
   * A job as the agent gets it, with a continue link for where its work goes: its own conversation (swarm.md
   * step 2), which now says who's on it, or the project it was handed out in, for an older job.
   */
  async function delivered(job: JobRow, owner: string, name: string, worker: string | null) {
    const caller = { ...d.tools, caller: { subject: owner, door: 'agent' } };
    const workIn = job.conversation ?? job.exploration;
    const made = await makeLink(caller, workIn, 'continue');
    // its worker's link, from now: each call through it marks the job alive (swarm.md step 3)
    if (job.conversation) await store.job.handOut(job.id, made.id, now());
    const n = workerPlace(await store.agent.workers(owner), name, worker);
    touched(caller, workIn, 'take_job', name, n);
    const exploration = await store.exploration.get(workIn);
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
      // the person's glasses (one-source.md): every flower their agent draws for them goes through these
      view: await viewOfPerson(d.tools, owner),
    };
  }

  app.get('/api/v1/agents', async (c) => {
    const owner = await personOr(c);
    if (!owner) return fail(c, 'unauthorised', 'Sign in with your wallet first.');
    const held = await store.job.held(owner);
    const workers = await store.agent.workers(owner);
    const agents = (await store.agent.list(owner)).flatMap((a) =>
      workersOf(a, workers).map((w, i) => {
        // the first entry also answers for a wait that names no worker, as petal.mjs did before workers
        const mine = (worker: string | null) => worker === w.worker || (i === 0 && worker === null);
        const job = held.find(
          (j) => j.taken_by?.toLowerCase() === a.name.toLowerCase() && mine(j.taken_worker),
        );
        return {
          name: a.name,
          n: w.n,
          worker: w.worker,
          waiting:
            presence.waiting(owner, a.name, w.worker) ||
            (i === 0 && presence.waiting(owner, a.name, null)),
          last_seen: w.last_seen,
          // what it says it can do, in its own words (swarm lean 2), or null
          can: w.can,
          job: job ? { id: job.id, title: job.title, exploration: job.exploration } : null,
        };
      }),
    );
    return ok(c, { agents });
  });

  return app;
}

/**
 * An agent's workers in the order they first came, each with its place: 1, 2, … The page reads them as
 * "Codex", "Codex 2" (apps/web/lib/agents.ts names agents). One that never waited as a worker is itself
 * its only entry, as before workers.
 */
export function workersOf(
  a: { name: string; last_seen: string; can?: string | null },
  workers: readonly { key: string; worker: string; last_seen: string; can?: string | null }[],
): { n: number; worker: string | null; last_seen: string; can: string | null }[] {
  const own = workers.filter((w) => w.key === a.name.toLowerCase());
  if (!own.length) return [{ n: 1, worker: null, last_seen: a.last_seen, can: a.can ?? null }];
  return own.map((w, i) => ({
    n: i + 1,
    worker: w.worker,
    last_seen: w.last_seen,
    can: w.can ?? a.can ?? null,
  }));
}
