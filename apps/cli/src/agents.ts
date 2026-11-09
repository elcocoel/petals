// One prompt, several agents (Elco, 9 Nov, agent-house-test.md). A person's agent joins their Petals
// with an agent key, then waits for the jobs Petals' agent hands out, in any of their projects:
//   node petal.mjs join <agent key> --as <name>   keeps the key and the name in PETALS_HOME
//   node petal.mjs jobs wait [--for <seconds>]    asks the site again and again, and comes back with
//                                                 the next job, or with none just before --for ends
// The waiting lives only in the command the agent's own session runs: nothing stays behind it. It
// comes back before the agent app's own limit on one command (Claude Code and Hermes: 10 minutes),
// so the agent runs it again; the site holds each ask for at most 90 seconds.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const AGAIN = 'node ~/.petals/petal.mjs jobs wait';

type Json = Record<string, unknown>;
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const homeOf = (env: NodeJS.ProcessEnv) => env.PETALS_HOME?.trim() || join(homedir(), '.petals');
export const agentFile = (env: NodeJS.ProcessEnv) => join(homeOf(env), 'agent.json');

/** Keeps the key and the name, for `jobs wait`. The key stays on this machine. */
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
  const file = agentFile(env);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ key: key.trim(), as: name })}\n`, { mode: 0o600 });
  return {
    joined: true,
    as: name,
    next: `Now wait for jobs: ${AGAIN}. Each time it comes back, do the job it gives, if any, and run it again.`,
  };
}

function joined(env: NodeJS.ProcessEnv): { key: string; as: string } | null {
  try {
    const j = JSON.parse(readFileSync(agentFile(env), 'utf8')) as { key?: unknown; as?: unknown };
    return typeof j.key === 'string' && typeof j.as === 'string' ? { key: j.key, as: j.as } : null;
  } catch {
    return null;
  }
}

export interface WaitOptions {
  env: NodeJS.ProcessEnv;
  site: string;
  /** how long this command may wait, in seconds */
  forS?: number;
  fetch?: Fetch;
  now?: () => number;
  /** where the file keeps the current project, so each flower drawn for the job is saved there */
  currentFile?: string;
}

/** Asks the site until a job comes or the time is up. Each ask the site holds for up to ASK_S. */
export async function waitForJob(o: WaitOptions): Promise<Json> {
  const me = joined(o.env);
  if (!me) {
    return {
      error: {
        code: 'bad_input',
        message:
          'Join first, with the agent key the person gave you: node ~/.petals/petal.mjs join <agent key> --as <name>.',
      },
    };
  }
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
        body: JSON.stringify({ as: me.as, wait_s }),
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
      writeFileSync(o.currentFile, `${JSON.stringify({ link: project.exploration })}\n`, {
        mode: 0o600,
      });
    }
    return {
      job,
      project,
      next: `Do this job now, in its project: pass project.exploration as exploration to the tools, and each flower you draw is saved there. When it's done, report_job with that exploration, the job's id and result: { summary, steps }, or failed and why. Then run ${AGAIN} again.`,
    };
  }
}
