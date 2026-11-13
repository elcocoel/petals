// The list of conversations: what a row says and where it goes.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { ConversationList } from '../components/chat/ConversationList.tsx';
import { byProject, conversationRows, type ListedConversation } from '../lib/conversation-list.ts';

const NONE = { runId: null };
const NOW = new Date('2026-11-06T18:02:09.000Z');

const listed = (o: Partial<ListedConversation> = {}): ListedConversation => ({
  id: 'run_1',
  run_id: 'run_1',
  title: 'Who holds Moloch DAO?',
  status: 'done',
  updated_at: '2026-11-06T16:02:09.000Z',
  ...o,
});

describe('a row', () => {
  test('says its title, who it is with, when it last moved, and links to its run', () => {
    expect(conversationRows([listed()], NONE, NOW)).toEqual([
      {
        key: 'run_1',
        title: 'Who holds Moloch DAO?',
        by: 'petals',
        when: '2h',
        working: false,
        project: null,
        href: '/make?run=run_1',
        current: false,
      },
    ]);
  });

  test('one still going says so', () => {
    expect(conversationRows([listed({ status: 'running' })], NONE)[0]?.working).toBe(true);
  });

  test('says when in a few characters, then the date', () => {
    const at = (iso: string) => conversationRows([listed({ updated_at: iso })], NONE, NOW)[0]?.when;
    expect(at('2026-11-06T18:01:30.000Z')).toBe('now');
    expect(at('2026-11-06T17:40:09.000Z')).toBe('22m');
    expect(at('2026-11-04T18:02:09.000Z')).toBe('2d');
    expect(at('2026-10-20T10:00:00.000Z')).toBe('20 Oct');
    expect(at('2025-12-24T10:00:00.000Z')).toBe('24 Dec 2025');
  });

  test('the open one is marked, and only that one', () => {
    const rows = conversationRows([listed(), listed({ id: 'run_2', run_id: 'run_2' })], {
      runId: 'run_2',
    });
    expect(rows.map((r) => r.current)).toEqual([false, true]);
  });

  test('shows the person’s words, not what the question carried for the model', () => {
    const title = '[About flower abc, "Validators", near-validators, data as of 2026-11-03] Who?';
    expect(conversationRows([listed({ title })], NONE)[0]?.title).toBe('Who?');
  });

  test('keeps the server’s order', () => {
    const rows = conversationRows(
      [listed({ id: 'run_b', run_id: 'run_b' }), listed({ id: 'run_a', run_id: 'run_a' })],
      NONE,
    );
    expect(rows.map((r) => r.key)).toEqual(['run_b', 'run_a']);
  });

  test('work from another door opens as what it is, and says where', () => {
    const door = listed({ id: 'exp_1', run_id: null, status: 'elsewhere' });
    expect(conversationRows([door], { runId: null, elsewhere: 'exp_1' }, NOW)[0]).toEqual({
      key: 'exp_1',
      title: 'Who holds Moloch DAO?',
      by: 'own',
      when: '2h',
      working: false,
      project: null,
      href: '/make?elsewhere=exp_1',
      current: true,
    });
  });
});

describe('projects', () => {
  const projects = [
    { id: 'p2', name: 'Second', parent: null, position: 1 },
    { id: 'p1', name: 'First', parent: null, position: 0 },
    { id: 'p1a', name: 'Inside first', parent: 'p1', position: 0 },
  ];
  const rows = conversationRows(
    [
      listed({ id: 'a', run_id: 'a', folder: 'p2' }),
      listed({ id: 'b', run_id: 'b', folder: 'p1a' }),
      listed({ id: 'c', run_id: 'c', folder: null }),
      listed({ id: 'd', run_id: 'd', folder: 'gone' }),
    ],
    NONE,
    NOW,
  );

  test("in the person's order, each holding its own, a folder inside another counting as its top", () => {
    const { projects: shown } = byProject(rows, projects);
    expect(shown.map((p) => [p.name, p.rows.map((r) => r.key)])).toEqual([
      ['First', ['b']],
      ['Second', ['a']],
    ]);
  });

  test('a conversation in no project, or in one that is gone, is loose', () => {
    expect(byProject(rows, projects).loose.map((r) => r.key)).toEqual(['c', 'd']);
  });

  // swarm step 2: hand_job opens a conversation in the
  // handing one's project, titled by the job, listed as another door's work
  test("a job's own conversation sits in the project with the one that handed it out, named by the job", () => {
    const withJob = conversationRows(
      [
        listed({
          id: 'exp_job',
          run_id: null,
          title: 'Map the shares',
          status: 'elsewhere',
          folder: 'p2',
        }),
        listed({ id: 'a', run_id: 'a', folder: 'p2' }),
      ],
      NONE,
      NOW,
    );
    const second = byProject(withJob, projects).projects.find((p) => p.name === 'Second');
    expect(second?.rows.map((r) => [r.key, r.title, r.by, r.href])).toEqual([
      ['exp_job', 'Map the shares', 'own', '/make?elsewhere=exp_job'],
      ['a', 'Who holds Moloch DAO?', 'petals', '/make?run=a'],
    ]);
  });
});

describe('the view', () => {
  test('a row is a link, and the open one says so', () => {
    const html = renderToStaticMarkup(
      createElement(ConversationList, {
        rows: conversationRows([listed()], { runId: 'run_1' }),
      }),
    );
    expect(html).toContain('href="/make?run=run_1"');
    expect(html).toContain('aria-current="page"');
  });
});
