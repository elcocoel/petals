// Jobs in a project (Elco, 9 Nov, B with C): "the agent in the conversation can work in
// collaboration with conversations in the apps to outsource mapping and other processes". Petals'
// agent on the page hands a job out in a project (an exploration); the person's own agent takes it
// with the project's link, does it on their machine, and reports back. Jobs are mapping, for now.
//   take_job    the oldest open job, now taken; or none
//   report_job  a taken job, done with its result or failed with why
//   list_jobs   every job in the project, oldest first, for the page
// Taking and reporting need what writing a note needs (the owner or a continue link); reading the
// list needs any link. A taken job that's never reported stays taken.
import type { JobRow } from '@petal/store';
import { defineTool } from '../define.ts';
import { ToolFailure } from '../errors.ts';
import { lastingStore, open, READS, REF, touched, WRITES, writable } from './explorations.ts';
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

export const takeJob = defineTool<{ exploration: string }, object>({
  name: 'take_job',
  title: 'Take a job',
  description:
    "Take the next job Petals' agent handed out in this project, to do on this machine (mapping a network, for now). Claims the oldest open one; job is null when none is open. Do what its brief says, then report_job.",
  input: obj(['exploration'], { exploration: REF }, { additionalProperties: false }),
  output: obj(['exploration', 'job'], {
    exploration: { type: 'string' },
    job: { anyOf: [JOB, { type: 'null' }] },
    next: { type: 'string' },
  }),
  annotations: WRITES,
  async run({ exploration }, ctx) {
    const store = lastingStore(ctx);
    const o = await open(ctx, exploration);
    writable(o);
    const job = await store.job.take(o.row.id, ctx.now().toISOString());
    if (job) touched(ctx, o.row.id, 'take_job');
    return {
      exploration: o.row.id,
      job: job ? jobOut(job) : null,
      next: job
        ? 'Do what brief says, with the six steps. Then report_job with this job id and result: { summary, steps }, or failed and why.'
        : 'No job is open in this project.',
    };
  },
});

export const reportJob = defineTool<
  {
    exploration: string;
    job: string;
    result?: { summary: string; steps?: number[]; notes?: string };
    failed?: string;
  },
  object
>({
  name: 'report_job',
  title: 'Report a job',
  description:
    "Report a job you took with take_job: result, with a summary of two or three plain sentences and the steps it saved in the project, or failed, with why. Petals' agent on the page reads it.",
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
