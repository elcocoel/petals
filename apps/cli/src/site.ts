// The site door, for petal as one file (T405). Elco, 8 Nov: "We're building a tool set, a skill,
// something that their computer and their AI uses, not ours." So every read, search, count and
// drawing runs here, on the person's machine, and the site only receives and shows: the
// conversation and what it drew.
//
// Only these reach the site, agreed with SYSTEMS: start_exploration, get_exploration,
// list_explorations, save_step and add_note (the exploration routes), GET of a snapshot, and PUT of
// a snapshot under the exploration. Nothing else here makes a request to it.
//
// One process is one conversation (stdio MCP starts one per session), so the exploration it
// started is the default for save_step, add_note and get_exploration. The CLI is one process per
// command, so the last one started is also kept in a file. Passing `exploration` always wins.
// A job's project comes with the person's view (Elco's glasses rule, 10 Nov), kept with it, so every
// flower drawn for that job goes through it. `jobs wait` runs as a command of its own while an MCP
// session may run on, so a file newer than what this process remembers wins.
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { canonicalJson, TOOLS_VERSION } from '@petal/core';
import type { Snapshot, Spec } from '@petal/core/types';
import { isToolError, specBody, type Tool, type ToolContext } from '@petal/tools';

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
}
const isView = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

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
  'brain_route',
  'brain_file',
  'brain_index',
  // layers kept on the site, privately, and a dataset's versions (005)
  'keep_layer',
  'list_layers',
  'fork_dataset',
  // annotations: what the agent finds about accounts, kept privately in the project (annotation-layer.md)
  'add_annotation',
  'list_annotations',
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
      const j = JSON.parse(readFileSync(opts.currentFile, 'utf8')) as Json;
      return typeof j.link === 'string'
        ? {
            link: j.link,
            ...(isView(j.view) ? { view: j.view } : {}),
            ...(typeof j.as === 'string' ? { as: j.as } : {}),
          }
        : null;
    } catch {
      return null;
    }
  };
  const recalledAll = (): Current | null => fromFile() ?? current;
  const recalled = (): string | null => recalledAll()?.link ?? null;
  /** the person's view, when the conversation is a job's project */
  const recalledView = (): Json | null => recalledAll()?.view ?? null;

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
      if (out && typeof out === 'object' && !Array.isArray(out)) return out as Json;
    } catch {
      // below
    }
    return fault('source_failed', `Petals' site answered ${res.status} with no JSON.`);
  }

  const post = (path: string, input: unknown) =>
    call('POST', path, JSON.stringify(input), { 'content-type': 'application/json' });

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
    const exploration = typeof input.exploration === 'string' ? input.exploration : recalled();
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
    ].includes(tool.name);
    const input = optional ? withoutRequired(tool.input, 'exploration') : tool.input;
    const run = async (raw: unknown, ctx: ToolContext): Promise<Json> => {
      const i = (raw ?? {}) as Json;
      const exploration =
        typeof i.exploration === 'string' && i.exploration.trim() ? i.exploration : recalled();
      switch (tool.name) {
        case 'start_exploration': {
          const out = await post('/api/v1/explorations', i);
          const link = (out.link as { url?: unknown } | undefined)?.url;
          if (!isToolError(out) && typeof link === 'string') remember(link);
          return out;
        }
        case 'get_exploration': {
          if (!exploration) return noExploration();
          return call('GET', `/api/v1/explorations/${encodeURIComponent(refOf(exploration))}`);
        }
        case 'list_explorations':
          return call('GET', '/api/v1/explorations');
        case 'save_step':
          return saveStep({ ...i, ...(exploration ? { exploration } : {}) }, ctx);
        case 'add_note': {
          if (!exploration) return noExploration();
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
          if (!exploration) return noExploration();
          const taken = await post(
            `/api/v1/explorations/${encodeURIComponent(refOf(exploration))}/jobs/take`,
            {},
          );
          if (!isToolError(taken) && taken.job) remember(exploration, taken.view);
          return taken;
        }
        case 'list_jobs': {
          if (!exploration) return noExploration();
          return call('GET', `/api/v1/explorations/${encodeURIComponent(refOf(exploration))}/jobs`);
        }
        case 'report_job': {
          if (!exploration) return noExploration();
          const { exploration: _, job, ...rest } = i;
          if (typeof job !== 'string' || !job.trim())
            return fault('bad_input', 'Pass job: the id take_job gave you.');
          return post(
            `/api/v1/explorations/${encodeURIComponent(refOf(exploration))}/jobs/${encodeURIComponent(job)}/report`,
            rest,
          );
        }
        case 'keep_layer': {
          if (!exploration) return noExploration();
          const { exploration: _, ...rest } = i;
          return post(
            `/api/v1/explorations/${encodeURIComponent(refOf(exploration))}/layers`,
            rest,
          );
        }
        case 'list_layers': {
          if (!exploration) return noExploration();
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
          if (!exploration) return noExploration();
          const { exploration: _, ...rest } = i;
          return post(
            `/api/v1/explorations/${encodeURIComponent(refOf(exploration))}/datasets/fork`,
            rest,
          );
        }
        case 'add_annotation': {
          if (!exploration) return noExploration();
          const { exploration: _, ...rest } = i;
          // a job's worker answers for what it adds by the name it joined with, unless it says another
          const as = rest.as ?? recalledAll()?.as;
          return post(
            `/api/v1/explorations/${encodeURIComponent(refOf(exploration))}/annotations`,
            {
              ...rest,
              ...(as ? { as } : {}),
            },
          );
        }
        case 'list_annotations': {
          if (!exploration) return noExploration();
          const about = typeof i.about === 'string' ? `?about=${encodeURIComponent(i.about)}` : '';
          return call(
            'GET',
            `/api/v1/explorations/${encodeURIComponent(refOf(exploration))}/annotations${about}`,
          );
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
      const given = (raw ?? {}) as Json;
      const view = given.view === undefined ? recalledView() : null;
      const out = (await tool.run((view ? { ...given, view } : raw) as never, ctx)) as Json;
      if (isToolError(out)) return out;
      const { view_url: _v, short_url: _s, ...rest } = out;
      const exploration = recalled();
      if (!exploration) {
        return {
          ...rest,
          next: 'Call start_exploration first, then render again: the link to this flower comes from the site, once it holds the step.',
        };
      }
      // the spec as drawn; the site hashes it the same way
      const spec = (raw as { spec?: unknown } | null)?.spec;
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
    return { ...tool, run } as AnyTool;
  }

  /**
   * add_layer as it is, here, and then the layer is kept on the site too, in the open project, so the
   * person's dataset there has it (005). Before a project is open there's nowhere to keep it, and `next`
   * says so.
   */
  function addLayer(tool: AnyTool, keep: AnyTool): AnyTool {
    const run = async (raw: unknown, ctx: ToolContext): Promise<Json> => {
      const out = (await tool.run(raw as never, ctx)) as Json;
      if (isToolError(out)) return out;
      const exploration = recalled();
      if (!exploration) {
        return {
          ...out,
          next: 'Kept on this machine. Call start_exploration and add it again to keep it in the project on the site too.',
        };
      }
      const layer = (raw as { layer?: unknown } | null)?.layer;
      const kept = (await keep.run({ exploration, layer }, ctx)) as Json;
      if (isToolError(kept)) {
        return {
          ...out,
          next: `Kept on this machine, but the site didn't take it: ${(kept as { error: { message: string } }).error.message} Say so in a line.`,
        };
      }
      return { ...out, kept_on_site: { version: kept.version } };
    };
    return { ...tool, run } as AnyTool;
  }

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
      );
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

function withoutRequired<T>(schema: T, field: string): T {
  const s = schema as { required?: unknown };
  if (!Array.isArray(s.required)) return schema;
  return { ...schema, required: s.required.filter((r) => r !== field) };
}
