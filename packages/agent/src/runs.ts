// fileRunStore (T058; research R19): every chat is a run in .petal/runs/<run_id>.json, so a maker
// can leave and come back. The store folds events into the run as they arrive: messages from
// `message`, the flower and a draft entry from `flower` and `signature`, the status from `done`.
// A ChatInput with run_id continues that run: same id, the full message list, status running.
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TOOLS_VERSION } from '@petal/core';
import type { AgentEvent, ChatInput, Draft, Entry, Run } from '@petal/core/types';

export interface RunStore {
  create(input: ChatInput): Promise<string>;
  append(runId: string, e: AgentEvent): Promise<void>;
  get(runId: string): Promise<Run | null>;
}

/** Run ids are file names: letters, digits, _ and - only. */
export const RUN_ID = /^[A-Za-z0-9_-]{6,64}$/;

/** 24 hex characters: URL-safe, unguessable enough for a resume link. */
export function newRunId(): string {
  return randomBytes(12).toString('hex');
}

/** A draft entry from a drawn flower, for prepare_publish: no id, no provenance.maker yet. */
function draftEntry(
  f: Extract<AgentEvent, { event: 'flower' }>['data'],
  at: string,
): Partial<Entry> {
  return {
    petal: 'flower/v1',
    spec: f.spec,
    spec_sha256: f.spec_sha256,
    interpretation: f.interpretation,
    render_sha256: f.render_sha256,
    // provenance.maker is added by publish_flower once the maker has signed
    provenance: {
      agent: { kind: 'petal-agent' },
      tools_version: TOOLS_VERSION,
      created_at: at,
    } as Entry['provenance'],
  };
}

/** Fold one event into the run. Heartbeats are not kept. */
export function applyEvent(run: Run, e: AgentEvent, at: string): void {
  if (e.event === 'heartbeat') return;
  run.events.push(e);
  run.updated_at = at;
  switch (e.event) {
    case 'run':
      run.status = 'running';
      break;
    case 'message':
      run.messages.push({ role: 'assistant', content: e.data.text });
      break;
    case 'flower':
      run.flower = e.data;
      run.draft = { spec: e.data.spec, entry: draftEntry(e.data, at) };
      break;
    case 'signature': {
      const agent = run.draft?.entry?.provenance?.agent;
      if (agent) {
        agent.signature = e.data;
        agent.model = e.data.model;
      }
      break;
    }
    case 'done': {
      // this chat's events: from its own `run` event on
      let from = run.events.length - 1;
      while (from > 0 && run.events[from]?.event !== 'run') from--;
      const chat = run.events.slice(from);
      const drew = chat.some((x) => x.event === 'flower');
      const failed = chat.some((x) => x.event === 'error');
      run.status = failed && !drew ? 'failed' : 'done';
      const agent = run.draft?.entry?.provenance?.agent;
      if (drew && agent && !agent.model) agent.model = e.data.model;
      break;
    }
  }
}

export function fileRunStore(dir: string): RunStore {
  const file = (id: string) => join(dir, `${id}.json`);
  const cache = new Map<string, Run>();
  const chains = new Map<string, Promise<unknown>>();

  /** One write at a time per run, in order. */
  function serial<T>(id: string, f: () => Promise<T>): Promise<T> {
    const next = (chains.get(id) ?? Promise.resolve()).then(f);
    const tail = next.catch(() => {});
    chains.set(id, tail);
    tail.then(() => {
      if (chains.get(id) === tail) chains.delete(id);
    });
    return next;
  }

  async function load(id: string): Promise<Run | null> {
    if (!RUN_ID.test(id)) return null;
    const hit = cache.get(id);
    if (hit) return hit;
    try {
      return JSON.parse(await readFile(file(id), 'utf8')) as Run;
    } catch {
      return null;
    }
  }

  async function save(run: Run): Promise<void> {
    await mkdir(dir, { recursive: true });
    const tmp = join(dir, `.${run.run_id}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
    await writeFile(tmp, JSON.stringify(run));
    await rename(tmp, file(run.run_id));
  }

  return {
    async create(input) {
      const at = new Date().toISOString();
      const reopen = input.run_id && RUN_ID.test(input.run_id) ? input.run_id : undefined;
      if (reopen) {
        const kept = await serial(reopen, async () => {
          const run = await load(reopen);
          if (!run) return false;
          run.messages = [...input.messages];
          if (input.draft) run.draft = input.draft as Draft;
          run.status = 'running';
          run.updated_at = at;
          cache.set(reopen, run);
          await save(run);
          return true;
        });
        if (kept) return reopen;
      }
      const run: Run = {
        run_id: newRunId(),
        status: 'running',
        messages: [...input.messages],
        events: [],
        ...(input.draft ? { draft: input.draft } : {}),
        created_at: at,
        updated_at: at,
      };
      await serial(run.run_id, async () => {
        cache.set(run.run_id, run);
        await save(run);
      });
      return run.run_id;
    },

    append(runId, e) {
      return serial(runId, async () => {
        const run = await load(runId);
        if (!run) throw new Error(`fileRunStore: no run ${runId}`);
        applyEvent(run, e, new Date().toISOString());
        // a finished run leaves memory; the file keeps it
        if (run.status === 'running') cache.set(runId, run);
        else cache.delete(runId);
        await save(run);
      });
    },

    async get(runId) {
      if (!RUN_ID.test(runId)) return null;
      await chains.get(runId);
      const run = await load(runId);
      return run ? (JSON.parse(JSON.stringify(run)) as Run) : null;
    },
  };
}
