// C: a job Petals' agent hands to the person's own agent shows in the chat, says where it stands, and
// while it's open, offers the line that hands it over.

import { DEFAULT_VIEW } from '@petal/core/view';
import { describe, expect, test } from 'vitest';
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
      view: DEFAULT_VIEW,
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

  test('a job names the agent it went to, and who took it', () => {
    expect(jobLine({ ...handed, to: 'Claude Code' }, undefined).text).toBe(
      "Sent to Claude Code: Map RaidGuild's proposals",
    );
    const taken: Job = { ...handed, status: 'taken', taken_by: 'Hermes' };
    expect(jobLine(handed, taken).text).toBe("Hermes is on it: Map RaidGuild's proposals");
  });
});

describe('your agents in the menu', () => {
  test('each says what it’s doing: on a job, waiting, or not connected now', async () => {
    const { agentRows, agentWords } = await import('../lib/agents.ts');
    const rows = agentRows([
      { name: 'Claude Code', waiting: false, job: { id: 'j', title: 'Map X' } },
      { name: 'Hermes', waiting: true, job: null },
      { name: 'Codex', waiting: false, job: null },
    ]);
    expect(rows.map((r) => [r.label, r.status, r.here])).toEqual([
      ['Claude Code', agentWords.on('Map X'), true],
      ['Hermes', agentWords.waiting, true],
      ['Codex', agentWords.away, false],
    ]);
  });

  test('one row per worker: the agent, then its place after the first; disconnecting ends the agent', async () => {
    const { agentRows } = await import('../lib/agents.ts');
    const rows = agentRows([
      { name: 'codex', n: 1, worker: 'a', waiting: true, job: null },
      { name: 'codex', n: 2, worker: 'b', waiting: false, job: { id: 'j', title: 'Map X' } },
      { name: 'claude-code', waiting: true, job: null },
    ]);
    expect(rows.map((r) => [r.label, r.agent, r.name])).toEqual([
      ['Codex', 'Codex', 'codex'],
      ['Codex 2', 'Codex', 'codex'],
      ['Claude Code', 'Claude Code', 'claude-code'],
    ]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(3);
  });

  test('the one prompt carries the site and a fresh agent key', async () => {
    const { agentWords } = await import('../lib/agents.ts');
    const line = agentWords.prompt('https://p', 'petal_agent_k');
    expect(line).toContain('https://p/skill.md');
    expect(line.endsWith('My agent key: petal_agent_k')).toBe(true);
  });
});

describe('a turn Petals starts on a report', () => {
  test('its opening line shows as a note, not as the person’s words', async () => {
    const { chatReducer, initialChat } = await import('../lib/thread.ts');
    const s0 = initialChat({
      initialRun: 'run_1',
      recorded: false,
      opening: '',
      initialQuestion: null,
    } as never);
    const run = {
      run_id: 'run_1',
      status: 'done',
      messages: [
        { role: 'user', content: 'Map RaidGuild' },
        { role: 'assistant', content: 'Sent it to Hermes.' },
        { role: 'user', content: '(Petals) The job "Map RaidGuild" came back from Hermes.' },
        { role: 'assistant', content: 'Hermes found 246 proposals.' },
      ],
      events: [
        { event: 'run', data: { run_id: 'run_1', resume_url: '' } },
        { event: 'message', data: { text: 'Sent it to Hermes.' } },
        { event: 'run', data: { run_id: 'run_1', resume_url: '' } },
        { event: 'message', data: { text: 'Hermes found 246 proposals.' } },
      ],
    };
    const s = chatReducer(s0, { type: 'opened', run } as never);
    const kinds = s.items.map((i: { kind: string }) => i.kind);
    expect(kinds).toContain('note');
    expect(s.items.filter((i: { kind: string }) => i.kind === 'user')).toHaveLength(1);
  });
});

describe('minimally good, in the workspace', () => {
  test('agents read as people know them', async () => {
    const { readableAgent } = await import('../lib/agents.ts');
    expect(readableAgent('claude-code')).toBe('Claude Code');
    expect(readableAgent('codex')).toBe('Codex');
    expect(readableAgent('my-helper')).toBe('My Helper');
    expect(readableAgent('Claude Code')).toBe('Claude Code');
  });

  test('a job names its agent readably', () => {
    expect(jobLine({ ...handed, to: 'claude-code' }, undefined).text).toBe(
      "Sent to Claude Code: Map RaidGuild's proposals",
    );
  });
});
