// Jobs (C, Elco, 9 Nov: "the agent in the conversation can work in collaboration with conversations in
// the apps to outsource mapping and other processes"): Petals' agent hands a job to the person's own
// agent, which does it on their machine and reports back into the same conversation. The run's `job`
// event says it was handed; GET /api/v1/explorations/:ref/jobs says where each stands. Pure. The words
// are proposals, waiting for Elco's.

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
}

export const jobWords = {
  open: (title: string) => `Sent to your own agent: ${title}`,
  taken: (title: string) => `Your own agent is on it: ${title}`,
  done: (title: string) => `Your own agent finished: ${title}`,
  failed: (title: string) => `Your own agent couldn't finish: ${title}`,
} as const;

/** The job's line, from the newest word on it: the list if it's been read, the event otherwise. */
export function jobLine(handed: Job, known: Job | undefined): { text: string; summary?: string } {
  const j = known ?? handed;
  const summary = j.status === 'failed' ? j.failed : j.summary;
  return { text: jobWords[j.status](j.title), ...(summary ? { summary } : {}) };
}
