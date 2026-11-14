// The site door, for petal as one file (T405). Petals is a tool set and a skill that the person's own
// computer and AI use, not ours. So every read, search, count and drawing runs here, on the person's
// machine, and the site only receives and shows: the conversation and what it drew.
//
// Only these reach the site (and search_petals): start_exploration, get_exploration,
// list_explorations, save_step and add_note (the exploration routes), GET of a snapshot, and PUT of
// a snapshot under the exploration. Nothing else here makes a request to it.
//
// One process is one conversation (stdio MCP starts one per session), so the exploration it
// started is the default for save_step, add_note and get_exploration. The CLI is one process per
// command, so the last one started is also kept in a file. Passing `exploration` always wins.
// A job's project comes with the person's view, kept with it, so every
// flower drawn for that job goes through it. `jobs wait` runs as a command of its own while an MCP
// session may run on, so a file newer than what this process remembers wins.
//
// Several workers on one computer each keep the job they hold in a file of their own,
// beside that one (current/<worker>.json), so separate jobs never cross: a call that names its project
// goes there with that worker's view, name and id. A call that names none goes where it went before,
// unless two or more workers here hold jobs: then it can't tell whose, and says to name the project.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { canonicalJson, sha256Hex, TOOLS_VERSION, validateSnapshot } from '@petal/core';
import type { Snapshot, Spec } from '@petal/core/types';
import { isToolError, specBody, type Tool, type ToolContext } from '@petal/tools';
import { validateDataTool } from './formats.ts';

// biome-ignore lint/suspicious/noExplicitAny: a heterogeneous registry (packages.md)
type AnyTool = Tool<any, any>;
type Json = Record<string, unknown>;
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
/** The conversation this process works in, and the person's view when it's a job's project. */
interface Current {
  link: string;
  view?: Json;
  /** the name the agent joined with, when the conversation is a job's project: who answers for what it adds */
  as?: string;
  /** and the worker that took the job, to wait again with when it ends */
  worker?: string;
}
/** Where one worker on this computer keeps the job it holds, beside the current file (step 5). */
export const workerCurrentFile = (currentFile: string, worker: string) =>
  join(dirname(currentFile), 'current', `${worker}.json`);

/** A job ended from the page: stopped, or handed to another worker. */
const ENDED = new Set(['stopped', 'handed_over']);
const isView = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
/** A call that can't tell whose job it's for: two or more workers here hold one (step 5). */
const SEVERAL = Symbol('several');
/** A current file's contents, as the site door keeps them. */
const asCurrent = (j: Json): Current | null =>
  typeof j.link === 'string'
    ? {
        link: j.link,
        ...(isView(j.view) ? { view: j.view } : {}),
        ...(typeof j.as === 'string' ? { as: j.as } : {}),
        ...(typeof j.worker === 'string' ? { worker: j.worker } : {}),
      }
    : null;

export interface SiteOptions {
  /** the site's origin, e.g. https://petals.example */
  site: string;
  /** where the last exploration started from the CLI is kept; none: memory only */
  currentFile?: string;
  /** a conversation's link to work in from the start (PETALS_EXPLORATION) */
  initial?: string;
  fetch?: Fetch;
}

/** The tools whose work lives on the site. */
export const SITE_TOOLS = [
  'start_exploration',
  'get_exploration',
  'list_explorations',
  'save_step',
  'add_note',
  // jobs the page's agent hands out in a project, done on this machine and reported back (C)
  'take_job',
  'report_job',
  'list_jobs',
  // the brain (005): the site holds the latest from the repo, with its commit
  'brain_context',
  'brain_route',
  'brain_file',
  'brain_index',
  // layers kept on the site, privately, and a dataset's versions (005)
  'keep_layer',
  'list_layers',
  'fork_dataset',
  // annotations: what the agent finds about accounts, kept privately in the project
  'add_annotation',
  'list_annotations',
  // the map's search: this computer has neither the model nor the map, so the site searches
  'search_petals',
  // the open-calls feed: the site keeps it, read from its sources
  'list_calls',
  // proposals, marks, values and readings an agent found, kept privately in the project
  'keep_data',
  'list_data',
  // what the person kept about a map and could publish with one press there: the
  // site holds their claims; the press and the wallet's signature stay theirs, on the page
  'list_publishable',
  // the Power Map lives on the site, and this computer holds none of it: a map, its voting blocs and its
  // payouts are read there, through the site's own /mcp door, which answers in the tools' own shapes
  'get_map',
  'find_voting_blocs',
  'list_payouts',
] as const;

/**
 * Left out of the file for now: publishing goes through the person's own wallet on the site, and
 * that path isn't built for a flower drawn on their machine. A sign_url made here would open
 * nothing there, and a quote is only ever about paying.
 */
export const LEFT_OUT = ['prepare_publish', 'publish_flower', 'quote_payment'] as const;

/** The last part of a continue link (32 random bytes, base64url). */
const LINK_TOKEN = /(?:^|\/)([A-Za-z0-9_-]{43})\/?(?:[?#].*)?$/;
const SHA = /^[0-9a-f]{64}$/;

const fault = (code: string, message: string, hint?: string) => ({
  error: { code, message, ...(hint ? { hint } : {}) },
  tools_version: TOOLS_VERSION,
});

const several = () =>
  fault(
    'bad_input',
    'Several workers hold jobs on this computer, so this needs to know whose.',
    "Pass your job's project, project.exploration from the jobs wait that gave you the job, as exploration (--exploration on a command).",
  );

const noExploration = () =>
  fault(
    'bad_input',
    'No exploration yet, so this has nowhere to go.',
    'Call start_exploration first, with the question and client. Then pass link.url as exploration.',
  );

/** A ref the site's routes take: a link's token, or an exp_ id as it is. */
function refOf(exploration: string): string {
  const raw = exploration.trim();
  return LINK_TOKEN.exec(raw)?.[1] ?? raw;
}

export function siteDoor(opts: SiteOptions) {
  const site = opts.site.replace(/\/+$/, '');
  const f: Fetch = opts.fetch ?? ((url, init) => fetch(url, init));
  /** snapshots the site is known to hold, this process */
  const held = new Set<string>();
  const first = opts.initial?.trim();
  let current: Current | null = first ? { link: first } : null;
  /** when this process last chose its conversation, against the file's own time */
  let chosenAt = first ? Date.now() : 0;

  const remember = (link: string, view?: unknown, as?: unknown) => {
    current = {
      link,
      ...(isView(view) ? { view } : {}),
      ...(typeof as === 'string' && as.trim() ? { as: as.trim() } : {}),
    };
    chosenAt = Date.now();
    if (!opts.currentFile) return;
    try {
      mkdirSync(dirname(opts.currentFile), { recursive: true });
      writeFileSync(opts.currentFile, `${JSON.stringify(current)}\n`, { mode: 0o600 });
    } catch {
      // memory still has it; a CLI user passes exploration
    }
  };
  const fromFile = (): Current | null => {
    if (!opts.currentFile) return null;
    try {
      if (current && statSync(opts.currentFile).mtimeMs <= chosenAt) return null;
      return asCurrent(JSON.parse(readFileSync(opts.currentFile, 'utf8')) as Json);
    } catch {
      return null;
    }
  };
  const recalledAll = (): Current | null => fromFile() ?? current;
  /** When this process or the current file last chose a conversation. */
  const chosenTime = (): number => {
    let at = current ? chosenAt : 0;
    try {
      if (opts.currentFile) at = Math.max(at, statSync(opts.currentFile).mtimeMs);
    } catch {
      // no file yet
    }
    return at;
  };
  const jobsDir = opts.currentFile ? join(dirname(opts.currentFile), 'current') : null;
  /**
   * The jobs this computer's workers hold, one file per worker (step 5). A job stopped or handed over is
   * still there, marked ended, so the worker's sub-agents that call after the first one hear the same
   * worker named; it no longer counts as held.
   */
  const jobsKept = (): { file: string; at: number; current: Current; ended: boolean }[] => {
    if (!jobsDir) return [];
    let names: string[];
    try {
      names = readdirSync(jobsDir).filter((n) => n.endsWith('.json'));
    } catch {
      return [];
    }
    return names.flatMap((n) => {
      const file = join(jobsDir, n);
      try {
        const j = JSON.parse(readFileSync(file, 'utf8')) as Json;
        const c = asCurrent(j);
        return c ? [{ file, at: statSync(file).mtimeMs, current: c, ended: Boolean(j.ended) }] : [];
      } catch {
        return [];
      }
    });
  };
  const jobsHere = () => jobsKept().filter((h) => !h.ended);
  /** A worker's job is over here: reported. */
  const release = (file: string) => {
    try {
      rmSync(file, { force: true });
    } catch {
      // gone already
    }
  };
  /** Stopped or handed over: kept, marked, until the worker's next job takes its place. */
  const endedHere = (file: string, c: Current, why: string) => {
    try {
      writeFileSync(file, `${JSON.stringify({ ...c, ended: why })}\n`, { mode: 0o600 });
    } catch {
      release(file);
    }
  };
  const mineFor = (link: string) => jobsKept().find((h) => refOf(h.current.link) === refOf(link));
  /**
   * Where a call goes, with the view, name and worker that come with it. A project the call names is
   * that worker's, when a worker here holds it. None named: the one job a worker here took since this
   * conversation was chosen, else the conversation; with two or more held, there's no telling whose.
   */
  const pick = (named?: string): Current | null | typeof SEVERAL => {
    if (named) return mineFor(named)?.current ?? { ...(recalledAll() ?? {}), link: named };
    const jobs = jobsHere();
    if (jobs.length > 1) return SEVERAL;
    const only = jobs[0];
    return only && only.at > chosenTime() ? only.current : recalledAll();
  };
  /** The job's project is no longer this worker's: nothing more goes there. */
  const forget = () => {
    current = null;
    chosenAt = Date.now();
    if (!opts.currentFile) return;
    try {
      writeFileSync(opts.currentFile, '{}\n', { mode: 0o600 });
    } catch {
      // memory has forgotten it
    }
  };
  /**
   * A refusal because the job behind this project was stopped or handed over: forget the project if it's
   * the one this worker is in, and say what to run next, with the worker's own id.
   */
  const ended = (path: string, out: Json): Json => {
    const now = recalledAll();
    const ref = /^\/api\/v1\/explorations\/([^/?]+)/.exec(path)?.[1];
    const mine = ref
      ? jobsKept().find((h) => encodeURIComponent(refOf(h.current.link)) === ref)
      : undefined;
    const worker = mine?.current.worker ?? now?.worker;
    const why = (out.error as { ended?: unknown }).ended;
    if (mine && !mine.ended) endedHere(mine.file, mine.current, String(why));
    if (now && ref && encodeURIComponent(refOf(now.link)) === ref) forget();
    const message = (out.error as { message?: unknown }).message;
    const wait = `node ~/.petals/petal.mjs jobs wait${worker ? ` --worker ${worker}` : ''}`;
    return { ...out, next: `${typeof message === 'string' ? `${message} ` : ''}Run ${wait} now.` };
  };
  const recalled = (): string | null => recalledAll()?.link ?? null;

  /** One request to the site; its JSON answer as it is, or a ToolError when there is none. */
  async function call(
    method: string,
    path: string,
    body?: string | Uint8Array<ArrayBuffer>,
    headers: Record<string, string> = {},
  ): Promise<Json> {
    let res: Response;
    try {
      res = await f(`${site}${path}`, {
        method,
        headers: { accept: 'application/json', ...headers },
        ...(body !== undefined ? { body } : {}),
      });
    } catch (e) {
      return fault(
        'source_failed',
        `Petals' site (${site}) didn't answer: ${(e as Error).message}`,
        'Say so in a line and carry on with your answer; the reads and drawings still work here.',
      );
    }
    const text = await res.text();
    try {
      const out = JSON.parse(text) as unknown;
      if (out && typeof out === 'object' && !Array.isArray(out)) {
        const why = (out as { error?: { ended?: unknown } }).error?.ended;
        return typeof why === 'string' && ENDED.has(why) ? ended(path, out as Json) : (out as Json);
      }
    } catch {
      // below
    }
    return fault('source_failed', `Petals' site answered ${res.status} with no JSON.`);
  }

  const post = (path: string, input: unknown) =>
    call('POST', path, JSON.stringify(input), { 'content-type': 'application/json' });

  /** A tool run on the site, through its /mcp door: the tool's own answer, or its error. */
  async function onSite(name: string, args: Json): Promise<Json> {
    let res: Response;
    try {
      res = await f(`${site}/mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      });
    } catch (e) {
      return fault(
        'source_failed',
        `Petals' site (${site}) didn't answer: ${(e as Error).message}`,
        'Say so in a line and carry on with your answer; the reads and drawings still work here.',
      );
    }
    const text = await res.text();
    // a stream of one event, or plain JSON
    const body = text.includes('data:')
      ? text
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .join('')
      : text;
    try {
      const out = JSON.parse(body) as {
        result?: { structuredContent?: Json };
        error?: { message?: unknown };
      };
      if (out.result?.structuredContent) return out.result.structuredContent;
      if (out.error)
        return fault('source_failed', `Petals' site refused ${name}: ${String(out.error.message)}`);
    } catch {
      // below
    }
    return fault('source_failed', `Petals' site answered ${res.status} to ${name} with no result.`);
  }

  /** The site holds this snapshot, or now does: posted from here, read on this machine. */
  async function ensureSnapshot(ref: string, sha: string, ctx: ToolContext): Promise<Json | null> {
    if (held.has(sha)) return null;
    const at = `${site}/api/v1/snapshots/${sha}`;
    try {
      const head = await f(at, { method: 'HEAD' });
      if (head.ok) {
        held.add(sha);
        return null;
      }
      if (head.status !== 404) {
        // a site that won't say: let save_step decide
        return null;
      }
    } catch {
      return null; // save_step will say the site is down
    }
    const gz = await gzipOf(ctx, sha);
    if (!gz) return null; // not on this machine either; save_step says what's missing
    const out = await call(
      'PUT',
      `/api/v1/explorations/${encodeURIComponent(ref)}/snapshots/${sha}`,
      gz as Uint8Array<ArrayBuffer>,
      { 'content-type': 'application/json', 'content-encoding': 'gzip' },
    );
    if (isToolError(out)) return out;
    held.add(sha);
    return null;
  }

  async function saveStep(input: Json, ctx: ToolContext): Promise<Json> {
    // every caller has picked where it goes
    const exploration = typeof input.exploration === 'string' ? input.exploration : null;
    if (!exploration) return noExploration();
    const sha = typeof input.spec_sha256 === 'string' ? input.spec_sha256 : undefined;
    const spec =
      (input.spec as Spec | undefined) ?? (sha ? await specBody(ctx.config, sha) : null) ?? null;
    const ref = refOf(exploration);
    const steps = `/api/v1/explorations/${encodeURIComponent(ref)}/steps`;
    const note = typeof input.note === 'string' ? { note: input.note } : {};
    if (!spec) {
      if (!sha) return fault('bad_input', 'Pass spec or spec_sha256.');
      // Not drawn here, such as a published flower: the site may hold it, and says if it doesn't.
      return post(steps, { spec_sha256: sha, ...note });
    }
    const snap = (spec as { snapshot?: { sha256?: unknown } }).snapshot?.sha256;
    if (typeof snap === 'string' && SHA.test(snap)) {
      const failed = await ensureSnapshot(ref, snap, ctx);
      if (failed) return failed;
    }
    return post(steps, { spec, ...note });
  }

  /** The site's own tool, by name; input and output are the registry's. */
  function remote(tool: AnyTool): AnyTool {
    const optional = [
      'save_step',
      'add_note',
      'get_exploration',
      'take_job',
      'report_job',
      'list_jobs',
      'keep_layer',
      'list_layers',
      'fork_dataset',
      'add_annotation',
      'list_annotations',
      'keep_data',
      'list_data',
    ].includes(tool.name);
    const input = optional ? withoutRequired(tool.input, 'exploration') : tool.input;
    const run = async (raw: unknown, ctx: ToolContext): Promise<Json> => {
      const i = (raw ?? {}) as Json;
      const chosen = pick(
        typeof i.exploration === 'string' && i.exploration.trim() ? i.exploration : undefined,
      );
      const exploration = chosen === SEVERAL ? null : (chosen?.link ?? null);
      const nowhere = () => (chosen === SEVERAL ? several() : noExploration());
      switch (tool.name) {
        case 'start_exploration': {
          const out = await post('/api/v1/explorations', i);
          const link = (out.link as { url?: unknown } | undefined)?.url;
          if (!isToolError(out) && typeof link === 'string') remember(link);
          return out;
        }
        case 'get_exploration': {
          if (!exploration) return nowhere();
          return call('GET', `/api/v1/explorations/${encodeURIComponent(refOf(exploration))}`);
        }
        case 'list_explorations':
          return call('GET', '/api/v1/explorations');
        case 'save_step':
          if (!exploration) return nowhere();
          return saveStep({ ...i, exploration }, ctx);
        case 'add_note': {
          if (!exploration) return nowhere();
          const { exploration: _, ...rest } = i;
          return post(`/api/v1/explorations/${encodeURIComponent(refOf(exploration))}/notes`, rest);
        }
        case 'take_job': {
          // with the person's agent key: their next job from any project, taken now (no wait)
          if (typeof i.agent_key === 'string') {
            const out = await call(
              'POST',
              '/api/v1/agents/wait',
              JSON.stringify({ as: i.as, wait_s: 0 }),
              { 'content-type': 'application/json', authorization: `Bearer ${i.agent_key.trim()}` },
            );
            if (isToolError(out) || !out.job) return isToolError(out) ? out : { job: null };
            const link = (out.project as { exploration?: unknown } | undefined)?.exploration;
            if (typeof link === 'string') remember(link, out.view, i.as);
            return { link, job: out.job, ...(isView(out.view) ? { view: out.view } : {}) };
          }
          if (!exploration) return nowhere();
          const taken = await post(
            `/api/v1/explorations/${encodeURIComponent(refOf(exploration))}/jobs/take`,
            {},
          );
          if (!isToolError(taken) && taken.job) remember(exploration, taken.view);
          return taken;
        }
        case 'list_jobs': {
          if (!exploration) return nowhere();
          return call('GET', `/api/v1/explorations/${encodeURIComponent(refOf(exploration))}/jobs`);
        }
        case 'report_job': {
          if (!exploration) return nowhere();
          const { exploration: _, job, ...rest } = i;
          if (typeof job !== 'string' || !job.trim())
            return fault('bad_input', 'Pass job: the id take_job gave you.');
          const out = await post(
            `/api/v1/explorations/${encodeURIComponent(refOf(exploration))}/jobs/${encodeURIComponent(job)}/report`,
            rest,
          );
          // reported: the worker holds no job here until its next one
          const mine = isToolError(out) ? undefined : mineFor(exploration);
          if (mine) release(mine.file);
          return out;
        }
        case 'keep_layer': {
          if (!exploration) return nowhere();
          const { exploration: _, ...rest } = i;
          return post(
            `/api/v1/explorations/${encodeURIComponent(refOf(exploration))}/layers`,
            rest,
          );
        }
        case 'list_layers': {
          if (!exploration) return nowhere();
          const q = new URLSearchParams();
          if (typeof i.about === 'string') q.set('about', i.about);
          if (typeof i.hash === 'string') q.set('hash', i.hash);
          const query = q.size ? `?${q}` : '';
          return call(
            'GET',
            `/api/v1/explorations/${encodeURIComponent(refOf(exploration))}/layers${query}`,
          );
        }
        case 'fork_dataset': {
          if (!exploration) return nowhere();
          const { exploration: _, ...rest } = i;
          return post(
            `/api/v1/explorations/${encodeURIComponent(refOf(exploration))}/datasets/fork`,
            rest,
          );
        }
        case 'add_annotation': {
          if (!exploration) return nowhere();
          const { exploration: _, ...rest } = i;
          // a job's worker answers for what it adds by the name it joined with, unless it says another
          const as = rest.as ?? (chosen === SEVERAL ? undefined : chosen?.as);
          return post(
            `/api/v1/explorations/${encodeURIComponent(refOf(exploration))}/annotations`,
            {
              ...rest,
              ...(as ? { as } : {}),
            },
          );
        }
        case 'list_annotations': {
          if (!exploration) return nowhere();
          const about = typeof i.about === 'string' ? `?about=${encodeURIComponent(i.about)}` : '';
          return call(
            'GET',
            `/api/v1/explorations/${encodeURIComponent(refOf(exploration))}/annotations${about}`,
          );
        }
        case 'keep_data': {
          if (!exploration) return nowhere();
          const { exploration: _, ...rest } = i;
          return post(`/api/v1/explorations/${encodeURIComponent(refOf(exploration))}/data`, rest);
        }
        case 'list_data': {
          if (!exploration) return nowhere();
          const petal = typeof i.petal === 'string' ? `?petal=${encodeURIComponent(i.petal)}` : '';
          return call(
            'GET',
            `/api/v1/explorations/${encodeURIComponent(refOf(exploration))}/data${petal}`,
          );
        }
        case 'list_publishable': {
          if (!exploration) return nowhere();
          const map = typeof i.map === 'string' ? i.map : '';
          return call(
            'GET',
            `/api/v1/explorations/${encodeURIComponent(refOf(exploration))}/publishable?map=${encodeURIComponent(map)}`,
          );
        }
        case 'search_petals': {
          const q = new URLSearchParams();
          if (typeof i.q === 'string') q.set('q', i.q);
          if (Array.isArray(i.kinds) && i.kinds.length) q.set('kinds', i.kinds.join(','));
          if (typeof i.limit === 'number') q.set('limit', String(i.limit));
          return call('GET', `/api/v1/search?${q}`);
        }
        case 'list_calls': {
          const q = new URLSearchParams();
          for (const k of ['kind', 'q', 'closes_before'] as const)
            if (typeof i[k] === 'string') q.set(k, i[k] as string);
          return call('GET', `/api/v1/calls?${q}`);
        }
        case 'brain_context': {
          const q = new URLSearchParams();
          if (typeof i.question === 'string') q.set('q', i.question);
          if (Array.isArray(i.answers)) q.set('answers', i.answers.join(','));
          return call('GET', `/api/v1/brain/context?${q}`);
        }
        case 'brain_route': {
          const q = new URLSearchParams();
          if (typeof i.question === 'string') q.set('q', i.question);
          if (Array.isArray(i.answers)) q.set('answers', i.answers.join(','));
          return call('GET', `/api/v1/brain/route?${q}`);
        }
        case 'brain_file':
          if (typeof i.id !== 'string' || !i.id.trim())
            return fault('bad_input', 'Pass id: a chapter or recipe, or doctrine.');
          return call('GET', `/api/v1/brain/files/${encodeURIComponent(i.id)}`);
        case 'brain_index':
          return call('GET', '/api/v1/brain');
        case 'get_map':
        case 'find_voting_blocs':
        case 'list_payouts': {
          const { exploration: _, ...args } = i;
          return onSite(tool.name, args);
        }
        default:
          return fault('internal', `${tool.name} has no route on the site.`);
      }
    };
    return { ...tool, input, run } as AnyTool;
  }

  /**
   * render_flower as it is, here, and then the flower goes to the page: once an exploration is
   * open, the step is saved and the links are the site's, which open anywhere. Before that, a link
   * from here would open nothing, so there is none, and `next` says why.
   */
  function render(tool: AnyTool): AnyTool {
    const run = async (raw: unknown, ctx: ToolContext): Promise<Json> => {
      // a job's flowers go through the person's view, unless the call names one
      const { exploration: named, ...given } = (raw ?? {}) as Json;
      const chosen = pick(typeof named === 'string' && named.trim() ? named : undefined);
      if (chosen === SEVERAL) return several();
      const view = given.view === undefined ? (chosen?.view ?? null) : null;
      const out = (await tool.run((view ? { ...given, view } : given) as never, ctx)) as Json;
      if (isToolError(out)) return out;
      const { view_url: _v, short_url: _s, ...rest } = out;
      const exploration = chosen?.link ?? null;
      if (!exploration) {
        return {
          ...rest,
          next: 'Call start_exploration first, then render again: the link to this flower comes from the site, once it holds the step.',
        };
      }
      // the spec as drawn; the site hashes it the same way
      const spec = given.spec;
      const saved = await saveStep(
        { exploration, ...(spec ? { spec } : { spec_sha256: out.spec_sha256 }) },
        ctx,
      );
      if (isToolError(saved)) {
        return {
          ...rest,
          next: `The flower was drawn here, but the site didn't take it: ${(saved as { error: { message: string } }).error.message} Say so in a line.`,
        };
      }
      const link = saved.short_url as string | undefined;
      return {
        ...rest,
        ...(link ? { view_url: link, short_url: link } : {}),
        saved_step: (saved.step as { seq?: unknown } | undefined)?.seq ?? null,
      };
    };
    return { ...tool, input: withExploration(tool.input), run } as AnyTool;
  }

  /**
   * add_layer as it is, here, and then the layer is kept on the site too, in the open project, so the
   * person's dataset there has it (005). Before a project is open there's nowhere to keep it, and `next`
   * says so.
   */
  function addLayer(tool: AnyTool, keep: AnyTool): AnyTool {
    const run = async (raw: unknown, ctx: ToolContext): Promise<Json> => {
      const { exploration: named, ...given } = (raw ?? {}) as Json;
      const chosen = pick(typeof named === 'string' && named.trim() ? named : undefined);
      if (chosen === SEVERAL) return several();
      const out = (await tool.run(given as never, ctx)) as Json;
      if (isToolError(out)) return out;
      const exploration = chosen?.link ?? null;
      if (!exploration) {
        return {
          ...out,
          next: 'Kept on this machine. Call start_exploration and add it again to keep it in the project on the site too.',
        };
      }
      const layer = given.layer;
      const kept = (await keep.run({ exploration, layer }, ctx)) as Json;
      if (isToolError(kept)) {
        return {
          ...out,
          next: `Kept on this machine, but the site didn't take it: ${(kept as { error: { message: string } }).error.message} Say so in a line.`,
        };
      }
      return { ...out, kept_on_site: { version: kept.version } };
    };
    return { ...tool, input: withExploration(tool.input), run } as AnyTool;
  }

  /**
   * A snapshot an agent made itself, kept on this computer, so render_flower can draw it, and in the
   * job's or this conversation's project on the site, by the route that takes a reading made here.
   */
  const keepSnapshot = {
    name: 'keep_snapshot',
    title: 'Keep a snapshot you made',
    description:
      "Keep a reading you made yourself as a snapshot (snapshot/v1, its schema at the site's /schema/snapshot/v1.json): it's checked, named by the SHA-256 of its canonical JSON, kept on this computer and in the project. Then draw it as any other: propose_spec with its network.id as network and this sha256, then validate_spec and render_flower. Check it first with validate_data if you like.",
    input: {
      type: 'object',
      required: ['snapshot'],
      additionalProperties: false,
      properties: {
        snapshot: { type: 'object', description: 'the snapshot, petal snapshot/v1' },
        exploration: {
          type: 'string',
          description:
            "an exploration id (exp_…) or a link (/s/…): the job's project to keep it in; default this conversation",
        },
      },
    },
    output: {
      type: 'object',
      required: ['sha256'],
      properties: {
        sha256: { type: 'string' },
        exploration: { type: 'string' },
        next: { type: 'string' },
      },
    },
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    run: async (raw: unknown, ctx: ToolContext): Promise<Json> => {
      const { snapshot, exploration: named } = (raw ?? {}) as Json;
      const checked = validateSnapshot(snapshot);
      if (!checked.ok) {
        const first = checked.errors
          .slice(0, 5)
          .map((e) => `${e.path || '/'}: ${e.message}`)
          .join('; ');
        return fault(
          'bad_input',
          `That isn't a valid snapshot/v1: ${first}.`,
          'validate_data says what else is off.',
        );
      }
      const sha256 = sha256Hex(new TextEncoder().encode(canonicalJson(checked.value)));
      await ctx.store.put(checked.value);
      const chosen = pick(typeof named === 'string' && named.trim() ? named : undefined);
      if (chosen === SEVERAL) return several();
      if (!chosen) {
        return {
          sha256,
          next: "Kept on this computer. Call start_exploration, or pass the job's project as exploration, to keep it there too.",
        };
      }
      const failed = await ensureSnapshot(refOf(chosen.link), sha256, ctx);
      if (failed) return failed;
      return {
        sha256,
        exploration: chosen.link,
        next: 'Kept here and in the project. Draw it: propose_spec with its network.id as network and this sha256, then validate_spec and render_flower.',
      };
    },
  };

  /** The registry as the file serves it: the site's tools go there, the rest stays here. */
  function tools(registry: readonly AnyTool[]): AnyTool[] {
    const keepTool = registry.find((t) => t.name === 'keep_layer');
    return registry
      .filter((t) => !(LEFT_OUT as readonly string[]).includes(t.name))
      .map((t) =>
        (SITE_TOOLS as readonly string[]).includes(t.name)
          ? remote(t)
          : t.name === 'render_flower'
            ? render(t)
            : t.name === 'add_layer' && keepTool
              ? addLayer(t, remote(keepTool))
              : t,
      )
      .concat([keepSnapshot as AnyTool, validateDataTool as AnyTool]);
  }

  return { site, tools, current: recalled };
}

/** The snapshot as the site checks it: canonical JSON, gzipped. The stored .gz when there is one. */
async function gzipOf(ctx: ToolContext, sha: string): Promise<Uint8Array | null> {
  const stored = await ctx.store.gz?.(sha).catch(() => null);
  if (stored) return stored;
  const s: Snapshot | null = await ctx.store.get(sha).catch(() => null);
  return s ? new Uint8Array(gzipSync(canonicalJson(s))) : null;
}

/**
 * render_flower and add_layer as the file serves them take the project too, so a worker names its own
 * job's (step 5); left out, it's this conversation, as before.
 */
function withExploration<T>(schema: T): T {
  const s = schema as { properties?: Record<string, unknown> };
  return {
    ...schema,
    properties: {
      ...s.properties,
      exploration: {
        type: 'string',
        description:
          "an exploration id (exp_…) or a link (/s/…): the job's project to save it in; default this conversation",
      },
    },
  };
}

function withoutRequired<T>(schema: T, field: string): T {
  const s = schema as { required?: unknown };
  if (!Array.isArray(s.required)) return schema;
  return { ...schema, required: s.required.filter((r) => r !== field) };
}
