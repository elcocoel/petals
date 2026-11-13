// Where the jobs stand: read when the page has a conversation with jobs in it, and again each time
// its live stream says something changed (an agent waiting, a job taken or reported). No timer.
import { useEffect, useState } from 'react';
import { listenElsewhere, readJobs } from '../lib/agent-client.ts';
import type { Job } from '../lib/jobs.ts';

export function useJobs(exploration: string | null): Record<string, Job> {
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  useEffect(() => {
    if (!exploration) return;
    let gone = false;
    const look = () =>
      void readJobs(exploration).then(
        (list) => {
          if (!gone) setJobs(Object.fromEntries(list.map((j) => [j.id, j])));
        },
        () => {},
      );
    // the stream's first signal comes on connecting, so it reads once from the start
    const stop = listenElsewhere(exploration, look);
    return () => {
      gone = true;
      stop();
    };
  }, [exploration]);
  return jobs;
}
