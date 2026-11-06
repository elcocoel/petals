// The list of conversations: what a row says and where it goes.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { ConversationList } from '../components/chat/ConversationList.tsx';
import { conversationRows, type ListedConversation } from '../lib/conversation-list.ts';

const NONE = { runId: null };

const listed = (o: Partial<ListedConversation> = {}): ListedConversation => ({
  id: 'run_1',
  run_id: 'run_1',
  title: 'Who holds Moloch DAO?',
  status: 'done',
  updated_at: '2026-11-06T16:02:09.000Z',
  ...o,
});

describe('a row', () => {
  test('says its question and its date, and links to its run', () => {
    expect(conversationRows([listed()], NONE)).toEqual([
      {
        key: 'run_1',
        title: 'Who holds Moloch DAO?',
        sub: '6 Nov 2026',
        href: '/make?run=run_1',
        current: false,
      },
    ]);
  });

  test('one still going says so', () => {
    expect(conversationRows([listed({ status: 'running' })], NONE)[0]?.sub).toBe('Working…');
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
    expect(conversationRows([door], { runId: null, elsewhere: 'exp_1' })[0]).toEqual({
      key: 'exp_1',
      title: 'Who holds Moloch DAO?',
      sub: 'Your own agent  ·  6 Nov 2026',
      href: '/make?elsewhere=exp_1',
      current: true,
    });
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
