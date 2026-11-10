// One prompt, several agents (Elco, 9 Nov, agent-house-test.md). A person's agent joins their Petals
// with an agent key, then waits for the jobs Petals' agent hands out, in any of their projects:
//   node petal.mjs join <agent key> --as <name>   keeps the key and the name in PETALS_HOME, as a new
//                                                 worker, and answers with its id
//   node petal.mjs jobs wait --worker <id> [--for <seconds>]
//                                                 asks the site again and again, and comes back with
//                                                 the next job, or with none just before --for ends
// Several workers per agent (Elco's swarm, 10 Nov; coordinator/swarm.md step 1): each window and each
// sub-agent joins once and waits with its own worker id, so the page lists them apart and each holds
// its own job. Each worker is a file of its own, so two joining at once never overwrite each other.
// The waiting lives only in the command the agent's own session runs: nothing stays behind it. It
// comes back before the agent app's own limit on one command (Claude Code and Hermes: 10 minutes),
// so the agent runs it again; the site holds each ask for at most 90 seconds.
import { randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** An agent key, as the site makes it. */
export const AGENT_KEY = /^petal_agent_[A-Za-z0-9_-]{43}$/;
/** How Petals' agent aims a job at this one: lowercase, with hyphens, such as claude-code. */
export const AGENT_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** Just under Claude Code's and Hermes's ten minutes for one command. */
export const WAIT_FOR_S = 570;
/** Under the site's tunnel, which closes a request idle for 100 seconds. */
const ASK_S = 85;
const WAIT = 'node ~/.petals/petal.mjs jobs wait';
/** A worker's id, as join makes it. */
export const WORKER = /^[a-z0-9]{1,12}$/;
const again = (worker: string | null) => (worker ? `${WAIT} --worker ${worker}` : WAIT);

type Json = Record<string, unknown>;
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const homeOf = (env: NodeJS.ProcessEnv) => env.PETALS_HOME?.trim() || join(homedir(), '.petals');
/** Before workers: one agent per computer. Still read, so an agent joined then keeps waiting. */
export const agentFile = (env: NodeJS.ProcessEnv) => join(homeOf(env), 'agent.json');
const workersDir = (env: NodeJS.ProcessEnv) => join(homeOf(env), 'workers');
export const workerFile = (env: NodeJS.ProcessEnv, id: string) =>
  join(workersDir(env), `${id}.json`);

/** Keeps the key and the name as a new worker, for `jobs wait`. The key stays on this machine. */
export function joinAgent(env: NodeJS.ProcessEnv, key: string, as: string): Json {
  const name = as.trim().toLowerCase();
  if (!AGENT_KEY.test(key.trim())) {
    return {
      error: { code: 'bad_input', message: "That isn't an agent key: it starts petal_agent_." },
    };
  }
  if (!AGENT_NAME.test(name)) {
    return {
      error: {
        code: 'bad_input',
        message: '--as takes a short name in lowercase with hyphens, such as claude-code.',
      },
    };
  }
  const worker = randomBytes(4).readUInt32BE(0).toString(36).padStart(6, '0').slice(-6);
  const file = workerFile(env, worker);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ key: key.trim(), as: name })}\n`, { mode: 0o600 });
  return {
    joined: true,
    as: name,
    worker,
    next: `Now wait for jobs, always with your worker id: ${again(worker)}. Each time it comes back, do the job it gives, if any, and run it again.`,
  };
}

interface Joined {
  key: string;
  as: string;
  /** null for an agent joined before workers */
  worker: string | null;
}

const readJoined = (file: string, worker: string | null): Joined | null => {
  try {
    const j = JSON.parse(readFileSync(file, 'utf8')) as { key?: unknown; as?: unknown };
    return typeof j.key === 'string' && typeof j.as === 'string'
      ? { key: j.key, as: j.as, worker }
      : null;
  } catch {
    return null;
  }
};

/**
 * The worker named; with none named, the agent joined before workers (its prompt never names one, so
 * a newer join on the same computer must not take its place), else the only worker there is.
 */
function joined(env: NodeJS.ProcessEnv, worker?: string): Joined | 'which' | null {
  if (worker) return WORKER.test(worker) ? readJoined(workerFile(env, worker), worker) : null;
  const before = readJoined(agentFile(env), null);
  if (before) return before;
  let ids: string[] = [];
  try {
    ids = readdirSync(workersDir(env))
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5));
  } catch {
    // none yet
  }
  if (ids.length > 1) return 'which';
  const only = ids[0];
  return only ? readJoined(workerFile(env, only), only) : null;
}

export interface WaitOptions {
  env: NodeJS.ProcessEnv;
  site: string;
  /** the worker id join gave; none: the only worker there is */
  worker?: string;
  /** how long this command may wait, in seconds */
  forS?: number;
  fetch?: Fetch;
  now?: () => number;
  /** where the file keeps the current project, so each flower drawn for the job is saved there */
  currentFile?: string;
}

/** Asks the site until a job comes or the time is up. Each ask the site holds for up to ASK_S. */
export async function waitForJob(o: WaitOptions): Promise<Json> {
  const me = joined(o.env, o.worker);
  if (me === 'which') {
    return {
      error: {
        code: 'bad_input',
        message:
          'Several workers joined on this computer: pass yours, as join gave it: node ~/.petals/petal.mjs jobs wait --worker <id>.',
      },
    };
  }
  if (!me) {
    return {
      error: {
        code: 'bad_input',
        message: o.worker
          ? `No worker ${o.worker} joined on this computer. Join first, with the agent key the person gave you: node ~/.petals/petal.mjs join <agent key> --as <name>.`
          : 'Join first, with the agent key the person gave you: node ~/.petals/petal.mjs join <agent key> --as <name>.',
      },
    };
  }
  const AGAIN = again(me.worker);
  const f: Fetch = o.fetch ?? ((url, init) => fetch(url, init));
  const now = o.now ?? Date.now;
  const until = now() + (o.forS ?? WAIT_FOR_S) * 1000;
  for (;;) {
    const left = Math.floor((until - now()) / 1000);
    if (left < 5) {
      return { job: null, next: `No job yet. Run ${AGAIN} again now.` };
    }
    const wait_s = Math.min(ASK_S, left - 2);
    let res: Response;
    try {
      res = await f(`${o.site}/api/v1/agents/wait`, {
        method: 'POST',
        headers: { authorization: `Bearer ${me.key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ as: me.as, ...(me.worker ? { worker: me.worker } : {}), wait_s }),
        signal: AbortSignal.timeout((wait_s + 15) * 1000),
      });
    } catch (e) {
      return {
        error: {
          code: 'source_failed',
          message: `Petals' site didn't answer (${(e as Error).message}). Run ${AGAIN} again.`,
        },
      };
    }
    const body = (await res.json().catch(() => null)) as Json | null;
    if (!res.ok || !body) {
      if (res.status === 401 || res.status === 403) {
        return {
          error: {
            code: 'unauthorised',
            message:
              'Petals refused this agent key: it was revoked, or it was copied wrong. Ask the person for a new one, then join again.',
          },
        };
      }
      return body && 'error' in body
        ? body
        : { error: { code: 'source_failed', message: `Petals' site answered ${res.status}.` } };
    }
    const job = body.job as Json | null | undefined;
    if (!job) continue;
    const project = (body.project ?? {}) as { exploration?: unknown; question?: unknown };
    if (o.currentFile && typeof project.exploration === 'string') {
      mkdirSync(dirname(o.currentFile), { recursive: true });
      // the person's view comes with the job, so every flower drawn for it goes through it
      const view = body.view && typeof body.view === 'object' ? { view: body.view } : {};
      writeFileSync(o.currentFile, `${JSON.stringify({ link: project.exploration, ...view })}\n`, {
        mode: 0o600,
      });
    }
    return {
      job,
      project,
      next: `Do this job now, in its project: pass project.exploration as exploration to the tools, and each flower you draw is saved there, drawn as the person sees it. When it's done, report_job with that exploration, the job's id and result: { summary, steps }, or failed and why. Then run ${AGAIN} again.`,
    };
  }
}
