// Where the jobs stand (C): read when the page has a conversation with jobs in it, and again each time
// its live stream says something changed (a job taken or reported). No timer. And the hand-over: one
// continue link for the conversation, minted when the person first asks for it, inside a line their own
// agent takes the jobs from (CONNECTORS, 9 Nov).
import { useCallback, useEffect, useRef, useState } from 'react';
import { continueLinkFor, listenElsewhere, readJobs } from '../lib/agent-client.ts';
import { type Job, jobWords } from '../lib/jobs.ts';

export function useJobs(exploration: string | null) {
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [copied, setCopied] = useState(false);
  const link = useRef<{ for: string; url: string } | null>(null);
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

  const copy = useCallback(async () => {
    if (!exploration) return;
    const url =
      link.current?.for === exploration ? link.current.url : await continueLinkFor(exploration);
    if (!url) return;
    link.current = { for: exploration, url };
    await navigator.clipboard.writeText(jobWords.handover(url));
    setCopied(true);
  }, [exploration]);

  return { jobs, copied, copy: () => void copy().catch(() => {}) };
}
