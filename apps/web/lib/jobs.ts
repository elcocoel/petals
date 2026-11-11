// Jobs (C, Elco, 9 Nov: "the agent in the conversation can work in collaboration with conversations in
// the apps to outsource mapping and other processes"): Petals' agent hands a job to the person's own
// agent, which does it on their machine and reports back into the same conversation. The run's `job`
// event says it was handed; GET /api/v1/explorations/:ref/jobs says where each stands. Pure. The words
// are drafts, shipped on Elco's word (9 Nov: "Ship the drafts, I'll change them later").

import { readableAgent } from './agents.ts';

export type JobStatus = 'open' | 'taken' | 'done' | 'failed';

/** A job as GET /api/v1/explorations/:ref/jobs lists it (SYSTEMS). */
export interface Job {
  id: string;
  exploration?: string;
  kind: string;
  title: string;
  brief?: string;
  status: JobStatus;
  summary?: string;
  failed?: string;
  /** The agent it was sent to, by the name it called itself, or null: any of them. */
  to?: string | null;
  /** Who took it, or null. */
  taken_by?: string | null;
  /** The taker's place among that agent's workers: 2 is "Codex 2" (swarm.md, step 1). */
  n?: number | null;
  /** The job's own conversation, where its work goes (swarm.md, step 2). */
  conversation?: string | null;
}

/** A worker as the side panel names it: the agent's name made readable, and its place when it's not the first. */
export const workerName = (name: string, n?: number | null) =>
  `${readableAgent(name)}${n && n > 1 ? ` ${n}` : ''}`;

/** Who, as a person reads it: the worker's name, or your own agent when none is named yet. */
const whoOf = (name: string | null | undefined, n?: number | null) =>
  name ? workerName(name, n) : 'Your own agent';

export const jobWords = {
  open: (title: string, to?: string | null) =>
    to ? `Sent to ${readableAgent(to)}: ${title}` : `Sent to your own agent: ${title}`,
  taken: (title: string, by?: string | null, n?: number | null) =>
    `${whoOf(by, n)} is on it: ${title}`,
  done: (title: string, by?: string | null, n?: number | null) =>
    `${whoOf(by, n)} finished: ${title}`,
  failed: (title: string, by?: string | null, n?: number | null) =>
    `${whoOf(by, n)} couldn't finish: ${title}`,
  conversation: 'Open its conversation',
} as const;

/** Where the job's own conversation opens on /make, once it has one. */
export const jobConversationHref = (j: Pick<Job, 'conversation'>) =>
  j.conversation ? `/make?elsewhere=${encodeURIComponent(j.conversation)}` : undefined;

/** The job's line, from the newest word on it: the list if it's been read, the event otherwise. */
export function jobLine(
  handed: Job,
  known: Job | undefined,
): { text: string; summary?: string; conversation?: string } {
  const j = known ?? handed;
  const summary = j.status === 'failed' ? j.failed : j.summary;
  const text =
    j.status === 'open'
      ? jobWords.open(j.title, j.to)
      : jobWords[j.status](j.title, j.taken_by, j.n);
  const conversation = jobConversationHref({ conversation: j.conversation ?? handed.conversation });
  return { text, ...(summary ? { summary } : {}), ...(conversation ? { conversation } : {}) };
}
