// Jobs in a project (Elco, 9 Nov, B with C): "the agent in the conversation can work in
// collaboration with conversations in the apps to outsource mapping and other processes". Petals'
// agent on the page hands a job out in a project (an exploration); the person's own agent takes it
// with the project's link, does it on their machine, and reports back. Jobs are mapping, for now.
//   take_job    the oldest open job, now taken; or none. With the person's agent key instead of a project
//               link (10 Nov, for an app at /mcp, which can't hold a wait open): their next job from any
//               of their projects, sent to this agent or to anyone, with that project's continue link
//   report_job  a taken job, done with its result or failed with why
//   list_jobs   every job in the project, oldest first, for the page
// Taking and reporting need what writing a note needs (the owner or a continue link); reading the
// list needs any link. A taken job that's never reported stays taken.
import type { JobRow } from '@petal/store';
import { AGENT_NAME_MAX, agentKeyOf, DISCONNECTED, disconnectedFor } from '../agent-key.ts';
import { defineTool } from '../define.ts';
import { ToolFailure } from '../errors.ts';
import type { ToolContext } from '../types.ts';
import { viewOfPerson } from '../views.ts';
import {
  lastingStore,
  makeLink,
  open,
  READS,
  REF,
  touched,
  WRITES,
  writable,
} from './explorations.ts';
import { DATETIME, obj } from './shared.ts';

const SUMMARY_MAX = 2000;
const NOTES_MAX = 8000;
const FAILED_MAX = 2000;

const JOB = obj(['id', 'kind', 'title', 'brief', 'inputs'], {
  id: { type: 'string' },
  kind: { type: 'string', enum: ['map'] },
  title: { type: 'string' },
  brief: { type: 'string', description: 'what to do, in plain words' },
  inputs: { type: 'object' },
});
const RESULT = obj(
  ['summary'],
  {
    summary: { type: 'string', minLength: 1, maxLength: SUMMARY_MAX },
    steps: {
      type: 'array',
      items: { type: 'integer', minimum: 0 },
      description: 'the seq of each step this job saved in the project',
    },
    notes: { type: 'string', maxLength: NOTES_MAX },
    annotations: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 100 },
      description: 'the ids add_annotation gave for what this job found',
    },
  },
  { additionalProperties: false },
);
const STATUS = { type: 'string', enum: ['open', 'taken', 'done', 'failed'] };

const jobOut = (j: JobRow) => ({
  id: j.id,
  kind: j.kind,
  title: j.title,
  brief: j.brief,
  inputs: j.inputs,
});

/** The person's next job for this agent, from any of their projects, with that project's continue link. */

const THEN_REPORT =
  'Save who or what you find behind addresses with add_annotation as you go, never only in a file. Then report_job with link as exploration, this job id and result: { summary, steps, annotations: the ids add_annotation gave }, or failed and why. Then take_job again, until job is null.';

async function takeWithKey(ctx: ToolContext, key: string, as: string | undefined) {
  const store = lastingStore(ctx);
  const link = await agentKeyOf(store, key);
  if (!link) {
    throw new ToolFailure(
      'unauthorised',
      "That agent key isn't valid. Ask the person for a new one from Petals.",
    );
  }
  const owner = link.owner;
  const name = (as ?? '').trim();
  if (!name || name.length > AGENT_NAME_MAX) {
    throw new ToolFailure(
      'bad_input',
      `as must name this agent, 1 to ${AGENT_NAME_MAX} characters, as join names it (e.g. claude-app, chatgpt).`,
    );
  }
  if (await disconnectedFor(store, link, name, { reconnect: true })) {
    throw new ToolFailure('unauthorised', DISCONNECTED);
  }
  const at = ctx.now().toISOString();
  await store.agent.seen({ owner, name, last_seen: at });
  const job = await store.job.takeFor(owner, name, at);
  if (!job) return { job: null, next: 'No job is open for you in any of their projects.' };
  const made = await makeLink(
    { ...ctx, caller: { ...ctx.caller, subject: owner, door: ctx.caller?.door ?? 'agent' } },
    job.exploration,
    'continue',
  );
  touched(ctx, job.exploration, 'take_job');
  return {
    exploration: job.exploration,
    link: made.url,
    job: jobOut(job),
    // the person's glasses (one-source.md): every flower drawn for them is drawn through these
    view: await viewOfPerson(ctx, owner),
    next: `Do what brief says, with the six steps, passing link as exploration to save_step, add_note and keep_layer, and view to render_flower. ${THEN_REPORT}`,
  };
}

export const takeJob = defineTool<
  { exploration?: string; agent_key?: string; as?: string },
  object
>({
  name: 'take_job',
  title: 'Take a job',
  description:
    "Take the next job Petals' agent handed out, to do here (mapping a network, for now). With a project's link as exploration: the oldest open job in that project. With the person's agent key and as, your name (lower case with hyphens, e.g. claude-app or chatgpt): their next job from any of their projects, sent to you or to anyone, with link, that project's link to work and report in. job is null when none is open. Do what its brief says, then report_job.",
  input: obj(
    [],
    {
      exploration: REF,
      agent_key: {
        type: 'string',
        minLength: 1,
        maxLength: 200,
        description: "the person's agent key (petal_agent_…), from Petals' page",
      },
      as: {
        type: 'string',
        minLength: 1,
        maxLength: AGENT_NAME_MAX,
        description: 'with agent_key: the name you go by, e.g. claude-app or chatgpt',
      },
    },
    { additionalProperties: false },
  ),
  output: obj(['job'], {
    exploration: { type: 'string' },
    link: {
      type: 'string',
      description: "with agent_key: the job's project, as exploration for the rest",
    },
    job: { anyOf: [JOB, { type: 'null' }] },
    view: {
      type: 'object',
      description:
        "the person's view (view/v1), with a job: pass it to render_flower, so every flower is drawn as they see it",
    },
    next: { type: 'string' },
  }),
  annotations: WRITES,
  async run({ exploration, agent_key, as }, ctx) {
    if (agent_key !== undefined) return takeWithKey(ctx, agent_key, as);
    if (!exploration) {
      throw new ToolFailure(
        'bad_input',
        "Pass exploration (the project's link), or agent_key and as.",
      );
    }
    const store = lastingStore(ctx);
    const o = await open(ctx, exploration);
    writable(o);
    const job = await store.job.take(o.row.id, ctx.now().toISOString());
    if (job) touched(ctx, o.row.id, 'take_job');
    return {
      exploration: o.row.id,
      job: job ? jobOut(job) : null,
      // the project's owner's glasses (one-source.md): their flowers are drawn through these
      ...(job ? { view: await viewOfPerson(ctx, o.row.owner) } : {}),
      next: job
        ? 'Do what brief says, with the six steps, passing view to render_flower, and add_annotation for who or what you find behind addresses, never only a file. Then report_job with this job id and result: { summary, steps, annotations: the ids add_annotation gave }, or failed and why.'
        : 'No job is open in this project.',
    };
  },
});

export const reportJob = defineTool<
  {
    exploration: string;
    job: string;
    result?: { summary: string; steps?: number[]; notes?: string; annotations?: string[] };
    failed?: string;
  },
  object
>({
  name: 'report_job',
  title: 'Report a job',
  description:
    "Report a job you took with take_job: result, with a summary of two or three plain sentences, the steps it saved in the project and the ids of the annotations it added, or failed, with why. Petals' agent on the page reads it.",
  input: obj(
    ['exploration', 'job'],
    {
      exploration: REF,
      job: { type: 'string', minLength: 1, maxLength: 100, description: 'the id take_job gave' },
      result: RESULT,
      failed: { type: 'string', minLength: 1, maxLength: FAILED_MAX },
    },
    { additionalProperties: false },
  ),
  output: obj(['exploration', 'job'], {
    exploration: { type: 'string' },
    job: obj(['id', 'status'], { id: { type: 'string' }, status: STATUS, updated_at: DATETIME }),
  }),
  annotations: WRITES,
  async run({ exploration, job, result, failed }, ctx) {
    if ((result === undefined) === (failed === undefined)) {
      throw new ToolFailure('bad_input', 'Pass either result or failed.');
    }
    const store = lastingStore(ctx);
    const o = await open(ctx, exploration);
    writable(o);
    const at = ctx.now().toISOString();
    const done = await store.job.report(
      o.row.id,
      job,
      failed !== undefined ? { failed } : { result: result as NonNullable<typeof result> },
      at,
    );
    if (!done) {
      throw new ToolFailure(
        'not_found',
        'No taken job with that id in this project.',
        'take_job gives the id; a job is reported once.',
      );
    }
    touched(ctx, o.row.id, 'report_job');
    ctx.onJobReported?.(done);
    return {
      exploration: o.row.id,
      job: { id: done.id, status: done.status, updated_at: done.updated_at },
    };
  },
});

export const listJobs = defineTool<{ exploration: string }, object>({
  name: 'list_jobs',
  title: 'List jobs',
  description:
    'Every job handed out in this project, oldest first, with its status and, once reported, its result. Any link to the project can read them.',
  input: obj(['exploration'], { exploration: REF }, { additionalProperties: false }),
  output: obj(['exploration', 'jobs'], {
    exploration: { type: 'string' },
    jobs: {
      type: 'array',
      items: obj(['id', 'kind', 'title', 'brief', 'inputs', 'status', 'created_at', 'updated_at'], {
        id: { type: 'string' },
        kind: { type: 'string' },
        title: { type: 'string' },
        brief: { type: 'string' },
        inputs: { type: 'object' },
        status: STATUS,
        result: { anyOf: [RESULT, { type: 'null' }] },
        failed: { type: ['string', 'null'] },
        created_at: DATETIME,
        updated_at: DATETIME,
      }),
    },
  }),
  annotations: READS,
  async run({ exploration }, ctx) {
    const o = await open(ctx, exploration);
    const jobs = await lastingStore(ctx).job.list(o.row.id);
    return {
      exploration: o.row.id,
      jobs: jobs.map(({ run: _run, exploration: _x, ...j }) => j),
    };
  },
});
