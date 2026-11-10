// Runs in this process (T190; SYS-010 to SYS-013). Starting a chat starts a job here, and whoever
// asked only observes it: a viewer coming or going never touches the work. Viewers read the store's
// log by cursor, so each sees every event once wherever it joins; a job only wakes them, so there is
// no timer per viewer. Stop aborts the job's signal and waits for the job to say how it ended.
// Each flower is also saved as a step of the run's exploration (SYS-041).
import type { AgentEvent, ChatInput } from '@petal/core/types';
import {
  registry as defaultRegistry,
  mapViews,
  privateStore,
  saveRunStep,
  viewOfPerson,
} from '@petal/tools';
import { Channel } from './channel.ts';
import { agentsOfRun, type Bell, handJobTool, jobsOfRun } from './hand-job.ts';
import type { Budget, LlmMessage } from './llm.ts';
import { nameConversationTool, nameOfRun } from './name-conversation.ts';
import { type RunDeps, type RunOptions, startRun } from './run.ts';
import type { RunStore } from './runs.ts';
import type { EarlierFlower } from './thread.ts';
import { keepUsage, reconcile } from './usage.ts';

/** What a follow-up carries over from earlier chats of its run. */
export type Earlier = { thread?: LlmMessage[]; flowers?: EarlierFlower[] };

/** `seq` is the event's place in the log; a heartbeat, or an event the store refused, has none. */
export interface Observed {
  seq?: number;
  event: AgentEvent;
}

type Wake = 'new' | 'beat';

class Job {
  readonly abort = new AbortController();
  /** events the store refused: a viewer still gets them, though a later one can't replay them */
  readonly unsaved: AgentEvent[] = [];
  task: Promise<void> = Promise.resolve();
  #viewers = new Set<Channel<Wake>>();

  watch(): Channel<Wake> {
    const ch = new Channel<Wake>();
    this.#viewers.add(ch);
    ch.onReturn = () => this.#viewers.delete(ch);
    return ch;
  }
  wake(w: Wake) {
    for (const v of this.#viewers) v.push(w);
  }
  end() {
    for (const v of this.#viewers) v.close();
    this.#viewers.clear();
  }
}

export function runJobs(
  deps: RunDeps & { runs: RunStore },
  o: Pick<RunOptions, 'registry' | 'heartbeatMs'> & { bell?: Bell } = {},
) {
  const { runs } = deps;
  const jobs = new Map<string, Job>();

  return {
    running: (runId: string) => jobs.has(runId),

    /** Starts the chat; the promise is the job, and it ends after `done`. */
    start(
      runId: string,
      input: ChatInput,
      earlier: Earlier = {},
      budget: Budget = deps.budget,
      pick?: RunOptions['pick'],
    ): Promise<void> {
      const job = new Job();
      jobs.set(runId, job);
      const keep = async (e: AgentEvent) => {
        if (e.event === 'heartbeat') return job.wake('beat');
        // a store that fails must not stop the chat
        await runs.append(runId, e).catch(() => {
          job.unsaved.push(e);
        });
        if (e.event === 'flower') {
          try {
            await saveRunStep(deps.tools, runId, e.data.spec);
          } catch (err) {
            // the flower is drawn and in the run's log: a step that can't be saved doesn't undo that
            console.warn(`petal: run ${runId} couldn't save a step: ${(err as Error).message}`);
          }
        }
        job.wake('new');
      };
      job.task = (async () => {
        try {
          // The jobs it handed out so far, as they stand: their reports are read on this chat.
          const jobsNow = await jobsOfRun(deps.tools, runId).catch(() => []);
          // and who's connected, so it can send a job to one by name
          const agentsNow = await agentsOfRun(deps.tools, runId).catch(() => []);
          // and its name so far, so it names it once and renames it when the subject changes
          const nameNow = await nameOfRun(deps.tools, runId).catch(() => null);
          // NEAR AI's bill for this account's earlier calls, so what they're charged is what it billed
          const account = budget.ledger?.account;
          if (account) {
            await reconcile(privateStore(deps.tools.config), deps.llm, account).catch((e) =>
              console.warn(`petal: couldn't reconcile ${account} with NEAR AI: ${String(e)}`),
            );
          }
          // and the person's view, the glasses every flower it draws for them is drawn through
          // (one-source.md, step 2), so what it says about a flower is what they see
          const owner = (await privateStore(deps.tools.config).run.get(runId))?.owner ?? null;
          const tools = { ...deps.tools, view: await viewOfPerson(deps.tools, owner) };
          // and what the shared map holds, which it draws without a yes: drawing it reads nothing new
          const map = await mapViews(deps.tools);
          const onMap = { specs: map.map((v) => v.sha), snapshots: map.map((v) => v.snapshot) };
          const events = startRun(
            {
              messages: input.messages,
              ...(input.draft ? { draft: input.draft } : {}),
              ...earlier,
              ...(jobsNow.length ? { jobs: jobsNow } : {}),
              ...(agentsNow.length ? { agents: agentsNow } : {}),
              ...(nameNow ? { name: nameNow } : {}),
              onMap,
            },
            { tools, llm: deps.llm, budget },
            {
              runId,
              // its own hand_job and name_conversation, which know this run (and so its exploration)
              registry: [
                ...(o.registry ?? defaultRegistry),
                handJobTool(deps.tools, runId, o.bell),
                nameConversationTool(deps.tools, runId),
              ],
              ...(o.heartbeatMs ? { heartbeatMs: o.heartbeatMs } : {}),
              signal: job.abort.signal,
              ...(pick ? { pick } : {}),
              onThread: (t) => runs.saveThread?.(runId, t),
              // every answer's usage record, by NEAR AI's id for the call (usage/v1)
              onUsage: (u) => keepUsage(privateStore(deps.tools.config), u),
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
          jobs.delete(runId);
          job.end();
        }
      })();
      return job.task;
    },

    /** Aborts the job and waits for it to end. False when no job holds this run. */
    async stop(runId: string): Promise<boolean> {
      const job = jobs.get(runId);
      if (!job) return false;
      job.abort.abort();
      await job.task;
      return true;
    },

    /** One viewer: the log from `from` on, then live until the job ends. */
    observe(runId: string, from: number) {
      const job = jobs.get(runId);
      // registered before the first read, so a change after that read still wakes this viewer
      const wakes = job?.watch();
      async function* events(): AsyncGenerator<Observed> {
        let next = from;
        let unsaved = 0;
        let ended = !wakes;
        try {
          for (;;) {
            for (const at of await runs.eventsFrom(runId, next)) {
              yield at;
              next = at.seq + 1;
            }
            while (job && unsaved < job.unsaved.length) {
              yield { event: job.unsaved[unsaved++] as AgentEvent };
            }
            if (ended || !wakes) return;
            const woke = await wakes.next();
            // the job's last events were stored before it ended: one more read takes them
            if (woke.done) ended = true;
            else if (woke.value === 'beat') yield { event: { event: 'heartbeat', data: {} } };
          }
        } finally {
          void wakes?.return();
        }
      }
      return { events: events(), leave: () => void wakes?.return() };
    },
  };
}
