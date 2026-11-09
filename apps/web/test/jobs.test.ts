// C: a job Petals' agent hands to the person's own agent shows in the chat, says where it stands, and
// while it's open, offers the line that hands it over.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { JobRow } from '../components/chat/JobRow.tsx';
import { type Job, jobLine, jobWords } from '../lib/jobs.ts';
import { fold } from '../lib/thread.ts';
import { threadView } from '../lib/thread-view.ts';

const handed = {
  id: 'job_1',
  exploration: 'exp_1',
  kind: 'map' as const,
  title: "Map RaidGuild's proposals",
  brief: 'Who wrote each one',
  status: 'open' as const,
};

describe('jobs in the chat', () => {
  test('the run’s job event becomes a job row', () => {
    const items = fold([], { event: 'job', data: handed });
    const rows = threadView({
      items,
      busy: false,
      runId: null,
      turn: 'idle',
      lostAgain: false,
      recorded: false,
    });
    expect(rows).toMatchObject([{ kind: 'job', job: { id: 'job_1' } }]);
  });

  test('its line follows the newest word on it, and a report carries its summary', () => {
    expect(jobLine(handed, undefined).text).toBe(jobWords.open(handed.title));
    const done: Job = { ...handed, status: 'done', summary: '246 proposals, by author' };
    expect(jobLine(handed, done)).toEqual({
      text: jobWords.done(handed.title),
      summary: '246 proposals, by author',
    });
    const failed: Job = { ...handed, status: 'failed', failed: 'no RPC' };
    expect(jobLine(handed, failed).summary).toBe('no RPC');
  });

  test('the hand-over is one line with the conversation’s continue link', () => {
    expect(jobWords.handover('https://x/s/t')).toBe(
      'Take the open jobs in my Petals project: https://x/s/t',
    );
  });

  test('an open job offers the copy; a taken one doesn’t', () => {
    const at = (open: boolean) =>
      renderToStaticMarkup(createElement(JobRow, { text: 'x', open, onCopy: () => {} }));
    expect(at(true)).toContain(jobWords.copy);
    expect(at(false)).not.toContain(jobWords.copy);
  });
});
