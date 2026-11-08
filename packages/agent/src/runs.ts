// Run stores (T058, T189; research R19): every chat is a run, so a maker can leave and come back.
// A store folds events into the run as they arrive: messages from `message`, the flower and a draft
// entry from `flower` and `signature`, the status from `done`, or from the `error` of a restart. A
// ChatInput with run_id continues that run: same id, the full message list, status running.
//
// sqliteRunStore is what the app uses: run, run_event and run_thread in the private store.
// fileRunStore, .petal/runs/<run_id>.json, is the older form. importRunFiles brings its files over
// once and leaves them in place.
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TOOLS_VERSION } from '@petal/core';
import type { AgentEvent, ChatInput, ChatMessage, Draft, Entry, Run } from '@petal/core/types';
import type { RunRow, Store } from '@petal/store';
import type { Settings } from './catalogue.ts';
import { inviteOfAccount } from './invites.ts';
import type { LlmMessage } from './llm.ts';

/** A stored event and its place in the run's log: 0, 1, 2…, the same as its index in Run.events. */
export interface RunEventAt {
  seq: number;
  event: AgentEvent;
}

/** A run in a list. No owner: whoever lists by owner already knows it. */
export type RunSummary = Pick<Run, 'run_id' | 'status' | 'created_at' | 'updated_at'>;

/** What a chat can ask of its run, besides its words. */
export interface RunCreate {
  /** a person id or an anonymous handle. It stays out of Run: readers see a Run */
  owner?: string;
  /** what the person picked; a follow-up's replaces what the run had */
  settings?: Settings;
  /** a new run that picks up an exploration from another door, so its flowers are steps there */
  exploration?: string;
}

export interface RunStore {
  create(input: ChatInput, o?: RunCreate): Promise<string>;
  append(runId: string, e: AgentEvent): Promise<void>;
  get(runId: string): Promise<Run | null>;
  /**
   * What the model has read in this run, tool calls and results included (thread.ts). Kept beside
   * the run, not in it: it is the model's context, and GET /api/v1/agent/runs/:id does not show it.
   * Optional: a store without it continues runs from their prose alone.
   */
  saveThread?(runId: string, thread: LlmMessage[]): Promise<void>;
  thread?(runId: string): Promise<LlmMessage[] | null>;
  /** The log from sequence number `from` on, oldest first: how a viewer reconnects by cursor. */
  eventsFrom(runId: string, from?: number): Promise<RunEventAt[]>;
  ownerOf?(runId: string): Promise<string | null>;
  /** Compare and swap: false unless the current owner is `from` (default none). */
  setOwner?(runId: string, owner: string, from?: string): Promise<boolean>;
  /** Newest first. */
  listByOwner?(owner: string, limit?: number): Promise<RunSummary[]>;
  /** What this run has picked; null when it hasn't. */
  settingsOf?(runId: string): Promise<string | null>;
}

/** Run ids are file names: letters, digits, _ and - only. */
export const RUN_ID = /^[A-Za-z0-9_-]{6,64}$/;

/** 24 hex characters: URL-safe, unguessable enough for a resume link. */
export function newRunId(): string {
  return randomBytes(12).toString('hex');
}

const TITLE_MAX = 200;

/** A conversation's first name: what the person first asked. */
export function firstQuestion(messages: readonly ChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user')?.content ?? '';
  return first.trim().slice(0, TITLE_MAX);
}

/** A draft entry from a drawn flower, for prepare_publish: no id, no provenance.maker yet. */
function draftEntry(
  f: Extract<AgentEvent, { event: 'flower' }>['data'],
  at: string,
): Partial<Entry> {
  return {
    petal: 'flower/v2',
    spec: f.spec,
    spec_sha256: f.spec_sha256,
    interpretation: f.interpretation,
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
    case 'error':
      // no `done` follows this one: nothing is left that could say what the chat cost
      if (e.data.code === 'interrupted') run.status = 'interrupted';
      break;
    case 'done': {
      // this chat's events: from its own `run` event on
      let from = run.events.length - 1;
      while (from > 0 && run.events[from]?.event !== 'run') from--;
      const chat = run.events.slice(from);
      const drew = chat.some((x) => x.event === 'flower');
      const failed = chat.some((x) => x.event === 'error');
      const stopped = chat.some((x) => x.event === 'error' && x.data.code === 'stopped');
      run.status = stopped ? 'stopped' : failed && !drew ? 'failed' : 'done';
      const agent = run.draft?.entry?.provenance?.agent;
      if (drew && agent && !agent.model) agent.model = e.data.model;
      break;
    }
  }
}

export function fileRunStore(dir: string): RunStore {
  const file = (id: string) => join(dir, `${id}.json`);
  const threadFile = (id: string) => join(dir, `${id}.thread.json`);
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

  async function write(id: string, path: string, value: unknown): Promise<void> {
    await mkdir(dir, { recursive: true });
    const tmp = join(dir, `.${id}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
    await writeFile(tmp, JSON.stringify(value));
    await rename(tmp, path);
  }

  const save = (run: Run) => write(run.run_id, file(run.run_id), run);

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

    async eventsFrom(runId, from = 0) {
      if (!RUN_ID.test(runId)) return [];
      await chains.get(runId);
      const run = await load(runId);
      return (run?.events ?? []).map((event, seq) => ({ seq, event })).slice(from);
    },

    saveThread(runId, thread) {
      return serial(runId, () => write(runId, threadFile(runId), thread));
    },

    async thread(runId) {
      if (!RUN_ID.test(runId)) return null;
      await chains.get(runId);
      try {
        return JSON.parse(await readFile(threadFile(runId), 'utf8')) as LlmMessage[];
      } catch {
        return null;
      }
    },
  };
}

/** What a run's row keeps besides its columns. The events live in run_event. */
type RunBody = Pick<Run, 'messages' | 'draft' | 'flower'>;

const bodyOf = (run: Run) =>
  JSON.stringify({
    messages: run.messages,
    ...(run.draft ? { draft: run.draft } : {}),
    ...(run.flower ? { flower: run.flower } : {}),
  } satisfies RunBody);

function runOf(row: RunRow, events: AgentEvent[]): Run {
  const body = JSON.parse(row.body) as RunBody;
  return {
    run_id: row.id,
    status: row.status as Run['status'],
    messages: body.messages,
    events,
    ...(body.draft ? { draft: body.draft } : {}),
    ...(body.flower ? { flower: body.flower } : {}),
    ...(row.exploration ? { exploration: row.exploration } : {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const eventOf = (type: string, data: string) =>
  ({ event: type, data: JSON.parse(data) }) as AgentEvent;

/** One transaction, so a crash leaves a run as it was after its last whole event. */
async function appendEvent(store: Store, runId: string, e: AgentEvent): Promise<void> {
  if (e.event === 'heartbeat') return;
  await store.tx(async () => {
    const row = await store.run.get(runId);
    if (!row) throw new Error(`sqliteRunStore: no run ${runId}`);
    const at = new Date().toISOString();
    // only `done` looks back over the log, to judge this chat
    const events =
      e.event === 'done'
        ? (await store.runEvent.list(runId)).map((r) => eventOf(r.type, r.data))
        : [];
    const run = runOf(row, events);
    applyEvent(run, e, at);
    await store.runEvent.append(runId, e.event, JSON.stringify(e.data), at);
    await store.run.update(runId, {
      status: run.status,
      // what answered: a chat where no model did leaves it as it was
      model: e.event === 'done' && e.data.turns > 0 ? e.data.model : row.model,
      body: bodyOf(run),
      updated_at: at,
    });
  });
}

/** What the person reads on a run a restart cut short. */
export const INTERRUPTED =
  'The server restarted while this was running, so it stopped here. What it did so far is kept: send a message to carry on from there.';

/** The process that last started a chat on this store. */
const RUNS_PID = 'runs_pid';

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * The boot scan (T190, SYS-012). One process runs every run, so before it serves nothing is in
 * flight: a run still `running` lost its process, and any hold on the ledger lost its call. What such
 * a call really cost can't be known, but it may well have been billed, so its full hold counts as
 * spent, on the day and on the invite. Nothing is resumed: that would spend money with nobody
 * watching. A person's next message continues the run from its saved thread.
 *
 * Building the app isn't always a restart: scripts/check.sh builds it on build/.petal, with Elco's
 * server up on the same folder. So a process that started a chat here and is still alive keeps its
 * runs, and this scan leaves them for the next boot.
 */
export async function interruptRuns(
  store: Store,
  log: (line: string) => void = console.log,
): Promise<{ interrupted: number; spentUsd: number }> {
  const holder = Number(await store.meta.get(RUNS_PID));
  if (holder && holder !== process.pid && isAlive(holder)) {
    log(`petal: process ${holder} is running this store's runs, so they are left to it.`);
    return { interrupted: 0, spentUsd: 0 };
  }
  const ids = await store.run.idsWithStatus('running');
  for (const id of ids) {
    await appendEvent(store, id, {
      event: 'error',
      data: { code: 'interrupted', message: INTERRUPTED },
    });
  }
  // The day's ledger and the invites hold the same money twice over, so the day's figure is the total.
  const spentUsd = await store.tx(async () => {
    const at = new Date().toISOString();
    for (const { account_key, usd } of await store.credit.spendHolds(at)) {
      const invite = inviteOfAccount(account_key);
      if (invite) await store.invite.addSpent(invite, usd);
    }
    return store.ledger.spendHolds();
  });
  if (ids.length || spentUsd) {
    log(
      `petal: ${ids.length} runs interrupted by a restart, $${spentUsd} of holds counted as spent.`,
    );
  }
  return { interrupted: ids.length, spentUsd };
}

export function sqliteRunStore(store: Store): Required<RunStore> {
  const eventsOf = async (id: string) =>
    (await store.runEvent.list(id)).map((r) => eventOf(r.type, r.data));

  return {
    async create(input, o) {
      await store.meta.set(RUNS_PID, String(process.pid));
      const at = new Date().toISOString();
      const reopen = input.run_id && RUN_ID.test(input.run_id) ? input.run_id : undefined;
      if (reopen) {
        const kept = await store.tx(async () => {
          const row = await store.run.get(reopen);
          if (!row) return false;
          const run = runOf(row, []);
          run.messages = [...input.messages];
          if (input.draft) run.draft = input.draft as Draft;
          await store.run.update(reopen, {
            status: 'running',
            model: row.model,
            body: bodyOf(run),
            updated_at: at,
          });
          if (o?.settings) await store.run.setSettings(reopen, JSON.stringify(o.settings));
          return true;
        });
        if (kept) return reopen;
      }
      const id = newRunId();
      await store.run.insert({
        id,
        owner: o?.owner ?? null,
        exploration: o?.exploration ?? null,
        status: 'running',
        model: null,
        title: firstQuestion(input.messages) || null,
        settings: o?.settings ? JSON.stringify(o.settings) : null,
        body: bodyOf({
          run_id: id,
          status: 'running',
          messages: [...input.messages],
          events: [],
          ...(input.draft ? { draft: input.draft } : {}),
          created_at: at,
          updated_at: at,
        }),
        created_at: at,
        updated_at: at,
      });
      return id;
    },

    async append(runId, e) {
      await appendEvent(store, runId, e);
    },

    async get(runId) {
      if (!RUN_ID.test(runId)) return null;
      const row = await store.run.get(runId);
      return row ? runOf(row, await eventsOf(runId)) : null;
    },

    async saveThread(runId, thread) {
      await store.runThread.save(runId, JSON.stringify(thread), new Date().toISOString());
    },

    async thread(runId) {
      if (!RUN_ID.test(runId)) return null;
      const messages = await store.runThread.get(runId);
      return messages === null ? null : (JSON.parse(messages) as LlmMessage[]);
    },

    async eventsFrom(runId, from = 0) {
      return (await store.runEvent.list(runId, from)).map((r) => ({
        seq: r.seq,
        event: eventOf(r.type, r.data),
      }));
    },

    async ownerOf(runId) {
      return (await store.run.get(runId))?.owner ?? null;
    },

    async setOwner(runId, owner, from) {
      return store.run.setOwner(runId, owner, from ?? null);
    },

    async settingsOf(runId) {
      return (await store.run.get(runId))?.settings ?? null;
    },

    async listByOwner(owner, limit) {
      return (await store.run.listByOwner(owner, limit)).map((r) => ({
        run_id: r.id,
        status: r.status as Run['status'],
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));
    },
  };
}

const RUNS_IMPORTED = 'runs_imported_at';

/**
 * Copies fileRunStore's files into the store, once, and leaves the files where they are. A file that
 * can't be read as a run is skipped and counted: an old file must not stop the server starting.
 */
export async function importRunFiles(
  store: Store,
  dir: string,
  log: (line: string) => void = console.log,
): Promise<{ imported: number; skipped: number }> {
  const counts = { imported: 0, skipped: 0 };
  if (await store.meta.get(RUNS_IMPORTED)) return counts;
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    // no runs folder: nothing to bring over
  }
  const read = <T>(path: string): T | null => {
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as T;
    } catch {
      return null;
    }
  };
  await store.tx(async () => {
    for (const name of names) {
      const id = name.endsWith('.json') ? name.slice(0, -'.json'.length) : '';
      // threads and half-written temporary files don't match: their names have more dots
      if (!RUN_ID.test(id)) continue;
      const run = read<Run>(join(dir, name));
      if (
        !run ||
        run.run_id !== id ||
        typeof run.status !== 'string' ||
        typeof run.created_at !== 'string' ||
        typeof run.updated_at !== 'string' ||
        !Array.isArray(run.messages) ||
        !Array.isArray(run.events) ||
        !run.events.every((e) => typeof e?.event === 'string' && e.data !== undefined)
      ) {
        counts.skipped++;
        continue;
      }
      if (await store.run.get(id)) continue;
      await store.run.insert({
        id,
        owner: null,
        exploration: null,
        status: run.status,
        model: run.events.findLast((e) => e.event === 'done')?.data.model ?? null,
        body: bodyOf(run),
        created_at: run.created_at,
        updated_at: run.updated_at,
      });
      for (const e of run.events) {
        await store.runEvent.append(id, e.event, JSON.stringify(e.data), run.updated_at);
      }
      const thread = read<LlmMessage[]>(join(dir, `${id}.thread.json`));
      if (Array.isArray(thread)) {
        await store.runThread.save(id, JSON.stringify(thread), run.updated_at);
      }
      counts.imported++;
    }
    await store.meta.set(RUNS_IMPORTED, new Date().toISOString());
  });
  if (counts.imported || counts.skipped) {
    log(`petal: imported ${counts.imported} runs from ${dir}, skipped ${counts.skipped}.`);
  }
  return counts;
}
