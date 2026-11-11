// Jobs (C, Elco, 9 Nov: "the agent in the conversation can work in collaboration with conversations in
// the apps to outsource mapping and other processes"): Petals' agent hands a job to the person's own
// agent, which does it on their machine and reports back into the same conversation. The run's `job`
// event says it was handed; GET /api/v1/explorations/:ref/jobs says where each stands. Pure. The words
// are drafts, shipped on Elco's word (9 Nov: "Ship the drafts, I'll change them later").

import { readableAgent, workerName } from './agents.ts';

/** 'stopped' (swarm.md, step 3): the person or Petals' agent stopped it, and its worker reports nothing. */
export type JobStatus = 'open' | 'taken' | 'done' | 'failed' | 'stopped';

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
  /** Its worker's last call, while it's taken (swarm.md, step 3). */
  last_seen?: string | null;
}

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
  stopped: (title: string) => `Stopped: ${title}`,
  conversation: 'Open its conversation',
  heard: (time: string) => `Last heard from at ${time}`,
  stop: 'Stop',
  retry: 'Send it again',
  handTo: 'Hand it to…',
  pick: 'Hand it to',
  handOver: 'Hand over',
  moveFailed: "That didn't work. Try again.",
} as const;

/** What the person can do with a job, by where it stands, as the server allows (swarm.md, step 3). */
export function jobMoves(status: JobStatus): { stop: boolean; retry: boolean; handOver: boolean } {
  return {
    stop: status === 'open' || status === 'taken',
    retry: status === 'taken' || status === 'failed' || status === 'stopped',
    handOver: status === 'taken' || status === 'failed' || status === 'stopped',
  };
}

/** When its worker was last heard from, as a time of day: always true, with no clock to keep it so. */
export function heardLine(j: Pick<Job, 'status' | 'last_seen'>): string | null {
  if (j.status !== 'taken' || !j.last_seen) return null;
  const at = new Date(j.last_seen);
  if (Number.isNaN(at.getTime())) return null;
  return jobWords.heard(at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
}

/** A job's controls, as its row shows them. */
export interface JobControlsView {
  heard: string | null;
  moves: { stop: boolean; retry: boolean; handOver: boolean };
  /** The agents it can go to, while choosing; null until the list is read. */
  picking: { choices: { value: string; label: string }[] | null; to: string } | null;
  busy: boolean;
  failed: string | null;
  actions: {
    stop: () => void;
    retry: () => void;
    pick: () => void;
    setTo: (name: string) => void;
    handOver: () => void;
  };
}

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
