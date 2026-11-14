// A turn's steps in plain words, as they start, and open while the turn runs (lib/tool-words.ts, thread-view.ts).
import type { AgentEvent } from '@petal/core/types';
import { registry } from '@petal/tools';
import { describe, expect, test } from 'vitest';
import { DEFAULT_PERSON_VIEW } from '../lib/person-view.ts';
import { chatReducer, initialChat } from '../lib/thread.ts';
import { threadView } from '../lib/thread-view.ts';
import { hasWords, toolDoing } from '../lib/tool-words.ts';

describe('a step in plain words', () => {
  test('says what it looks for, quoted', () => {
    expect(toolDoing('search_petals', { q: 'DAO with the largest treasury value' })).toBe(
      'Searching the map for “DAO with the largest treasury value”',
    );
    expect(toolDoing('look_up', { query: 'Marinade' })).toBe('Looking up “Marinade”');
    expect(toolDoing('show', { map: 'x' })).toBe('Moving the map');
  });

  test('ranking says what it ranks by', () => {
    expect(toolDoing('rank_maps', { by: 'treasury' })).toBe('Ranking the maps by treasury');
    expect(toolDoing('rank_maps', { by: 'market_cap' })).toBe('Ranking the maps by market value');
  });

  test('every tool the agent can call has its own words, so none shows its name', () => {
    // the registry, and the agent's own: show, handing a job, a note on a petal
    const names = [...registry.map((t) => t.name), 'show', 'hand_job', 'annotate'];
    expect(names.filter((n) => !hasWords(n))).toEqual([]);
  });
});

describe('a running turn shows its steps open', () => {
  const ev = (e: AgentEvent) => e;
  const events: AgentEvent[] = [
    ev({ event: 'run', data: { run_id: 'r1', resume_url: '/make?run=r1' } }),
    ev({ event: 'stage', data: { stage: 'thinking', message: 'Reading the question' } }),
    ev({ event: 'tool_call', data: { id: 't1', name: 'brain_context', args: {} } }),
    ev({
      event: 'tool_result',
      data: { id: 't1', name: 'brain_context', ok: true, summary: 'ok', ms: 3 },
    }),
    ev({
      event: 'tool_call',
      data: { id: 't2', name: 'search_petals', args: { q: 'largest treasury' } },
    }),
  ] as AgentEvent[];
  let state = chatReducer(initialChat({}), {
    type: 'sent',
    text: 'take me to the richest map',
    startOver: false,
  });
  for (const event of events) state = chatReducer(state, { type: 'event', event });
  const rows = threadView({ ...state, recorded: false, view: DEFAULT_PERSON_VIEW.view });

  test('each step as it started, the one running now not done', () => {
    const turn = rows.find((r) => r.kind === 'turn');
    expect(turn?.kind === 'turn' && turn.doing).toEqual([
      { text: 'Reading Petals’ notes on how to answer', done: true, failed: false },
      { text: 'Searching the map for “largest treasury”', done: false, failed: false },
    ]);
  });

  test('with every step done, the model is thinking again, and that runs now', () => {
    const done = chatReducer(state, {
      type: 'event',
      event: {
        event: 'tool_result',
        data: { id: 't2', name: 'search_petals', ok: true, summary: 'ok', ms: 900 },
      } as AgentEvent,
    });
    const turn = threadView({ ...done, recorded: false, view: DEFAULT_PERSON_VIEW.view }).find(
      (r) => r.kind === 'turn',
    );
    expect(turn?.kind === 'turn' && turn.doing?.at(-1)).toEqual({
      text: 'Thinking it over',
      done: false,
      failed: false,
    });
  });

  test('not folded a second time above it', () => {
    expect(rows.some((r) => r.kind === 'steps')).toBe(false);
  });
});
