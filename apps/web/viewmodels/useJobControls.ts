// The person's say over the jobs Petals' agent handed out (swarm.md, step 3): stop one, send it again, or
// hand it to another of their agents, as the server allows for where it stands, and when its worker was
// last heard from. A move's answer is the job's new state, shown at once; the live stream reads the list
// again after. The agents to hand to are read when the person chooses to hand one over. lib/jobs.ts holds
// which moves each state allows, and the words.
import { useCallback, useState } from 'react';
import { moveJob, readAgents } from '../lib/agent-client.ts';
import { readableAgent } from '../lib/agents.ts';
import { heardLine, type Job, type JobControlsView, jobMoves, jobWords } from '../lib/jobs.ts';

export function useJobControls() {
  // what a move answered, over what the list last said
  const [moved, setMoved] = useState<Record<string, Partial<Job>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ id: string; text: string } | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [to, setTo] = useState('');
  const [agents, setAgents] = useState<string[] | null>(null);

  const move = useCallback(
    async (id: string, how: 'stop' | 'retry' | 'hand-over', name?: string) => {
      setBusy(id);
      setFailed(null);
      try {
        const { job } = await moveJob(id, how, name);
        setMoved((m) => ({ ...m, [id]: { ...m[id], ...job } }));
        setPicking(null);
      } catch {
        setFailed({ id, text: jobWords.moveFailed });
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const pick = useCallback((id: string) => {
    setPicking(id);
    setTo('');
    void readAgents().then((list) => setAgents([...new Set(list.map((a) => a.name))]));
  }, []);

  /** The job as it stands now: the list's word, then any move made since. */
  const now = (j: Job): Job => ({ ...j, ...moved[j.id] }) as Job;

  const controlsFor = (j: Job): JobControlsView => {
    const job = now(j);
    return {
      heard: heardLine(job),
      moves: jobMoves(job.status),
      picking:
        picking === job.id
          ? {
              choices: agents ? agents.map((a) => ({ value: a, label: readableAgent(a) })) : null,
              to,
            }
          : null,
      busy: busy === job.id,
      failed: failed?.id === job.id ? failed.text : null,
      actions: {
        stop: () => void move(job.id, 'stop'),
        retry: () => void move(job.id, 'retry'),
        pick: () => pick(job.id),
        setTo,
        handOver: () => {
          if (to) void move(job.id, 'hand-over', to);
        },
      },
    };
  };

  return { now, controlsFor };
}
