// T201: a question from the landing arrives at /make?q=, in the box, once, and nothing is sent. The flows
// and the reducer are the real ones, over a fake client; the page's first paint is the real surface.
import type { AgentEvent, Run } from '@petal/core/types';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { InteractionSurface } from '../flower/InteractionSurface.tsx';
import type { AgentClient, RunRead } from '../lib/agent-client.ts';
import { DEFAULT_PERSON_VIEW, viewChoices } from '../lib/person-view.ts';
import { type ChatAction, chatReducer, initialChat, type QuestionStore } from '../lib/thread.ts';
import { RECORDED_QUESTION } from '../lib/thread-view.ts';
import { openFromParams, questionFromParams, workspaceUrl } from '../lib/workspace-url.ts';
import {
  type ChatDeps,
  openRun,
  restoreQuestion,
  sendQuestion,
  typeQuestion,
} from '../viewmodels/useMakeChat.ts';
import { PersonViewContext } from '../viewmodels/usePersonView.ts';

const Q = 'Who "really" backs A&B #1, señor?';
const run = (id = 'r1'): AgentEvent => ({
  event: 'run',
  data: { run_id: id, resume_url: `/make?run=${id}` },
});

const memory = (seed: Record<string, string> = {}): QuestionStore => {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
};

const unused = () => {
  throw new Error('this test did not expect that call');
};

/** A page: the real reducer, starting from what the address held. */
function opened(
  o: { q?: string; run?: string; store?: QuestionStore; client?: Partial<AgentClient> } = {},
) {
  let state = initialChat({
    ...(o.q ? { question: o.q } : {}),
    ...(o.run ? { initialRun: o.run } : {}),
  });
  const deps: ChatDeps = {
    client: { chat: unused, readRun: unused, followRun: unused, ...o.client },
    store: o.store ?? memory(),
    onRun: () => {},
    dispatch: (a: ChatAction) => {
      state = chatReducer(state, a);
    },
  };
  return {
    deps,
    get state() {
      return state;
    },
    address: () =>
      workspaceUrl({
        runId: state.runId,
        open: state.open,
        petal: state.petal,
        asked: state.asked,
      }),
    send: () =>
      sendQuestion(deps, {
        text: state.question.trim(),
        recorded: false,
        runId: state.runId,
      }),
  };
}

async function* events(list: AgentEvent[], breaks?: string) {
  for (const e of list) yield e;
  if (breaks) throw new TypeError(breaks);
}

describe('what the address says', () => {
  test.each([
    [Q, Q],
    ['  a question  ', 'a question'],
    ['one\r\ntwo', 'one\ntwo'],
    ['', null],
    ['   \r\n ', null],
    [undefined, null],
    [['first', 'second'], 'first'],
  ])('?q=%j is %j', (q, words) => {
    expect(questionFromParams({ q })).toBe(words);
  });

  test('it means nothing else to the address', () => {
    expect(openFromParams({ q: 'x' })).toEqual({ open: { kind: 'latest' }, petal: null });
  });
});

describe('arriving', () => {
  test('the words are in the box, and nothing has been sent', () => {
    const page = opened({ q: Q, client: {} });
    expect(page.state).toMatchObject({
      question: Q,
      asked: Q,
      items: [],
      busy: false,
      turn: 'idle',
    });
  });

  test('alone it leaves the address as it came, whatever else that holds', () => {
    expect(opened({ q: Q }).address()).toBeNull();
    expect(opened().address()).toBeNull();
  });

  test('over a backup that was never accepted it wins, and arrives once', () => {
    const store = memory({ 'petal.unaccepted.new': 'an older question' });
    const page = opened({ q: Q, store });
    restoreQuestion(page.deps, null, Q);
    expect(page.state).toMatchObject({ question: Q, restored: false });
  });

  test('with no words in the address the backup still comes back', () => {
    const store = memory({ 'petal.unaccepted.new': 'an older question' });
    const page = opened({ store });
    restoreQuestion(page.deps, null, null);
    expect(page.state).toMatchObject({ question: 'an older question', restored: true });
  });

  test('a reload after its send was refused: once, with no run and with one', async () => {
    for (const r of [undefined, 'r1']) {
      const store = memory();
      const page = opened({
        q: Q,
        store,
        ...(r ? { run: r } : {}),
        client: { chat: () => events([], 'Failed to fetch') },
      });
      await page.send();
      const again = opened({ q: Q, store, ...(r ? { run: r } : {}) });
      restoreQuestion(again.deps, r ?? null, Q);
      expect(again.state.question).toBe(Q);
    }
  });

  test('in a run, words waiting for that run stay beside the new ones', () => {
    const store = memory({ 'petal.unaccepted.r1': 'a follow-up' });
    const page = opened({ q: Q, run: 'r1', store });
    restoreQuestion(page.deps, 'r1', Q);
    expect(page.state.question).toBe(`a follow-up\n${Q}`);
  });

  test('the words can be changed before they go', () => {
    const page = opened({ q: Q });
    typeQuestion(page.deps, page.state, `${Q} And why?`);
    expect(page.state).toMatchObject({ question: `${Q} And why?`, asked: Q });
  });
});

describe('the address until the server accepts', () => {
  test('a send still on its way keeps it', async () => {
    let open: (() => void) | undefined;
    const page = opened({
      q: Q,
      client: {
        async *chat() {
          await new Promise<void>((go) => {
            open = go;
          });
          yield run();
        },
      },
    });
    const sent = page.send();
    expect(page.state).toMatchObject({ question: '', asked: Q, turn: 'sending' });
    expect(page.address()).toBeNull();
    await new Promise((go) => setTimeout(go));
    open?.();
    await sent;
    expect(page.address()).toBe('/make?run=r1');
  });

  test('accepted: ?run= only, and a reload from there has an empty box', async () => {
    const store = memory();
    const page = opened({ q: Q, store, client: { chat: () => events([run()]) } });
    await page.send();
    expect(page.state.asked).toBeNull();
    const url = page.address() as string;
    expect(url).toBe('/make?run=r1');
    const params = Object.fromEntries(new URL(url, 'http://x').searchParams);
    expect(questionFromParams(params)).toBeNull();
    const reloaded = opened({ run: 'r1', store });
    restoreQuestion(reloaded.deps, 'r1', null);
    expect(reloaded.state.question).toBe('');
  });

  test('refused: the words go back and the address keeps them', async () => {
    const page = opened({ q: Q, client: { chat: () => events([], 'Failed to fetch') } });
    await page.send();
    expect(page.state).toMatchObject({ question: Q, asked: Q, restored: true, busy: false });
    expect(page.address()).toBeNull();
    expect(page.state.items.at(-1)).toMatchObject({ kind: 'error' });
  });

  test('a stream that drops after acceptance spends it: the question landed', async () => {
    const page = opened({ q: Q, client: { chat: () => events([run()], 'network error') } });
    await page.send();
    expect(page.state).toMatchObject({ question: '', asked: null, turn: 'lost' });
  });
});

describe('?run=X&q=Y', () => {
  const stored = (status: Run['status'], list: AgentEvent[]): RunRead => ({
    ok: true,
    run: {
      run_id: 'X',
      status,
      messages: [{ role: 'user', content: 'the first question' }],
      events: list,
      created_at: '2026-11-05T00:00:00Z',
      updated_at: '2026-11-05T00:00:00Z',
    },
  });
  const say: AgentEvent = { event: 'message', data: { text: 'the first answer' } };

  test('the thread opens and the words wait, in the box and in the address', async () => {
    const page = opened({
      q: 'Y',
      run: 'X',
      client: { readRun: async () => stored('done', [run('X'), say]) },
    });
    await openRun(page.deps, 'X');
    expect(page.state).toMatchObject({ question: 'Y', asked: 'Y', busy: false, runId: 'X' });
    expect(page.state.items.map((i) => i.kind)).toContain('user');
    expect(page.address()).toBe('/make?run=X&q=Y');
  });

  test('following a run still going never spends them: only a send can', async () => {
    const page = opened({
      q: 'Y',
      run: 'X',
      client: {
        readRun: async () => stored('running', [run('X')]),
        followRun: () => events([run('X'), say]),
      },
    });
    await openRun(page.deps, 'X');
    expect(page.state).toMatchObject({ question: 'Y', asked: 'Y' });
    expect(page.address()).toBe('/make?run=X&q=Y');
  });

  test('once sent and accepted, the address is the run', async () => {
    const page = opened({
      q: 'Y',
      run: 'X',
      client: {
        readRun: async () => stored('done', [run('X'), say]),
        chat: () => events([run('X')]),
      },
    });
    await openRun(page.deps, 'X');
    await page.send();
    expect(page.state.items.filter((i) => i.kind === 'user').at(-1)).toMatchObject({ text: 'Y' });
    expect(page.address()).toBe('/make?run=X');
  });
});

describe('the first paint', () => {
  // The root layout holds the person's view for every page (app/PersonView.tsx): a visitor's is the default.
  const person = {
    ...DEFAULT_PERSON_VIEW,
    choices: viewChoices(),
    save: async () => {},
    reset: async () => {},
  };
  const paint = (o: { q?: string; run?: string; recorded?: boolean; stored?: string }) =>
    renderToStaticMarkup(
      createElement(
        PersonViewContext.Provider,
        { value: person },
        createElement(InteractionSurface, {
          scatter: false,
          probe: false,
          surface: 'ground',
          initialRun: o.run,
          initialQuestion: o.q ?? null,
          recorded: o.recorded ?? false,
          opening: 'Hi. I’m Petals.',
          shelf: [],
          initialOpen: o.stored ? { kind: 'stored', id: o.stored } : { kind: 'latest' },
          initialPetal: null,
        }),
      ),
    );
  const textarea = (html: string) => /<textarea[^>]*>([^<]*)<\/textarea>/.exec(html);

  test('the words are in the box before any script runs, escaped, with Ask on', () => {
    const html = paint({ q: Q });
    expect(textarea(html)?.[1]).toBe('Who &quot;really&quot; backs A&amp;B #1, señor?');
    expect(html).toMatch(/<button[^>]*type="submit"(?![^>]*disabled)[^>]*>/);
  });

  test('an empty box can’t ask', () => {
    expect(paint({})).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  });

  test('a recorded run ignores them: the saved question, read-only, as it always read', () => {
    const html = paint({ q: Q, recorded: true });
    expect(textarea(html)?.[0]).toContain('readOnly');
    expect(textarea(html)?.[1]).toBe(RECORDED_QUESTION.replace(/'/g, '&#x27;'));
    expect(html).not.toContain('señor');
    expect(html).toContain('Play the recorded run');
  });

  test.each([
    ['a run', { run: 'r1' }],
    ['a stored flower', { stored: 'abc' }],
  ])(
    '%s on its way back keeps the Power Map as the ground, never an empty canvas (Elco, 12 Nov)',
    (_name, o) => {
      expect(paint(o)).toContain('Opening the Power Map…');
    },
  );

  test('a new conversation, nothing to draw yet: the Power Map on its way, and the boxes are there (#78)', () => {
    const html = paint({});
    expect(html).toContain('Opening the Power Map…');
    expect(html).toContain('aria-label="Message Petals"');
  });
});
