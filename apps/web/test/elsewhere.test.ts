// A conversation happening in another agent: what the page shows of it, and where it goes on.
import type { Spec } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { type ElsewherePacket, elsewhereFlower, elsewhereRows, WHERE } from '../lib/elsewhere.ts';
import { composerView } from '../lib/thread-view.ts';
import { openFromParams, workspaceUrl } from '../lib/workspace-url.ts';

const packet = (o: Partial<ElsewherePacket> = {}): ElsewherePacket => ({
  question: 'Who holds Moloch DAO?',
  current: { spec_sha256: 'abc', spec: { network: { id: 'moloch' } } as Spec, short_url: '/d/abc' },
  steps: [{ note: 'First pass.', at: '2026-11-06T10:00:00.000Z' }],
  notes: [{ text: 'Worth a closer look.', at: '2026-11-06T11:00:00.000Z' }],
  ...o,
});

describe('what the thread shows', () => {
  test('nothing until it has been read', () => {
    expect(elsewhereRows(null)).toEqual([]);
  });

  test('the question, then what the agent wrote, oldest first, named once', () => {
    const rows = elsewhereRows({
      packet: packet({
        steps: [{ note: 'Later.', at: '2026-11-06T12:00:00.000Z' }],
        notes: [{ text: 'Earlier.', at: '2026-11-06T09:00:00.000Z' }],
      }),
    });
    expect(rows.map((r) => r.kind)).toEqual(['user', 'message', 'message', 'note']);
    expect(rows[0]).toMatchObject({ text: 'Who holds Moloch DAO?', label: 'Original question' });
    expect(rows[1]).toMatchObject({ speaker: 'Your own agent' });
    expect(JSON.stringify(rows[1])).toContain('Earlier.');
    expect(rows[2]).not.toHaveProperty('speaker');
    expect(JSON.stringify(rows[2])).toContain('Later.');
    // it ends by saying where it goes on, since nothing here can send to it
    expect(rows[3]).toMatchObject({
      key: 'goes-on',
      text: "This conversation is with your own agent, so it goes on there, not here. To talk to Petals' agent, start a new conversation.",
    });
  });

  test('names the app when it said who it is', () => {
    const rows = elsewhereRows({
      packet: packet({ presence: { client: 'Claude Code', last_at: '', last_tool: null } }),
    });
    expect(rows.at(-1)).toMatchObject({ kind: 'note' });
    expect(JSON.stringify(rows.at(-1))).toContain('with Claude Code, so it goes on there');
  });

  test('a step with no words adds no row', () => {
    const rows = elsewhereRows({
      packet: packet({ steps: [{ note: null, at: '2026-11-06T10:00:00.000Z' }], notes: [] }),
    });
    expect(rows.map((r) => r.kind)).toEqual(['user', 'note']);
  });

  test('one that can’t be read says why', () => {
    expect(elsewhereRows({ failed: 'no exploration' })).toEqual([
      { kind: 'error', key: 'failed', text: 'no exploration' },
    ]);
  });
});

describe('the flower', () => {
  test('is its newest, with no reading of its own', () => {
    expect(elsewhereFlower(packet())).toMatchObject({
      key: 'abc',
      viewUrl: '/d/abc',
      interpretation: null,
      signature: null,
    });
  });

  test('none yet, or nothing read yet, is none', () => {
    expect(elsewhereFlower(packet({ current: null }))).toBeNull();
    expect(elsewhereFlower(null)).toBeNull();
  });
});

describe('the composer', () => {
  const view = composerView({
    question: 'words left in the box',
    runId: null,
    busy: false,
    recorded: false,
    elsewhere: WHERE,
  });

  test('says where it’s happening, and nothing can be sent', () => {
    expect(view.placeholder).toBe('This conversation is happening in your own agent.');
    expect(view).toMatchObject({ away: true, disabled: true, readOnly: true, value: '' });
  });
});

describe('a conversation that can’t be read', () => {
  test('says so, not where it’s happening', () => {
    const view = composerView({
      question: '',
      runId: null,
      busy: false,
      recorded: false,
      elsewhere: WHERE,
      unavailable: true,
    });
    expect(view.placeholder).toBe('This conversation isn’t available here.');
    expect(view.disabled).toBe(true);
  });
});

describe('the address', () => {
  test('holds it, with a petal or without', () => {
    const none = { runId: null, open: openFromParams({}).open, petal: null };
    expect(workspaceUrl({ ...none, elsewhere: 'exp_1' })).toBe('/make?elsewhere=exp_1');
    expect(workspaceUrl({ ...none, elsewhere: 'exp_1', petal: 'a.near' })).toBe(
      '/make?elsewhere=exp_1&petal=a.near',
    );
  });
});
