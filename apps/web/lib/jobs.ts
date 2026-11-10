// Jobs (C, Elco, 9 Nov: "the agent in the conversation can work in collaboration with conversations in
// the apps to outsource mapping and other processes"): Petals' agent hands a job to the person's own
// agent, which does it on their machine and reports back into the same conversation. The run's `job`
// event says it was handed; GET /api/v1/explorations/:ref/jobs says where each stands. Pure. The words
// are drafts, shipped on Elco's word (9 Nov: "Ship the drafts, I'll change them later").

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
}

/** Who, as a person reads it: the agent's own name, or your own agent when none is named yet. */
const whoOf = (name: string | null | undefined) => name || 'Your own agent';

export const jobWords = {
  open: (title: string, to?: string | null) =>
    to ? `Sent to ${to}: ${title}` : `Sent to your own agent: ${title}`,
  taken: (title: string, by?: string | null) => `${whoOf(by)} is on it: ${title}`,
  done: (title: string, by?: string | null) => `${whoOf(by)} finished: ${title}`,
  failed: (title: string, by?: string | null) => `${whoOf(by)} couldn't finish: ${title}`,
} as const;

/** The job's line, from the newest word on it: the list if it's been read, the event otherwise. */
export function jobLine(handed: Job, known: Job | undefined): { text: string; summary?: string } {
  const j = known ?? handed;
  const summary = j.status === 'failed' ? j.failed : j.summary;
  const text =
    j.status === 'open' ? jobWords.open(j.title, j.to) : jobWords[j.status](j.title, j.taken_by);
  return { text, ...(summary ? { summary } : {}) };
}
