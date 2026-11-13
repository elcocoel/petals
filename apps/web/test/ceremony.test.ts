// Mapping something new is a ceremony: the card for a held read, and the composer's state.
import { describe, expect, test } from 'vitest';
import { ceremonyView, ceremonyWords, creating, making, turnShow } from '../lib/ceremony.ts';
import { fold, type Item } from '../lib/thread.ts';
import { composerView, threadView } from '../lib/thread-view.ts';

const held = {
  tool: 'propose_spec',
  network: 'moloch-v3',
  params: { chain: 'gnosis', dao: '0xf02fd4286917270cb94fbc13a0f4e1ed76f7e986' },
  target_key: 'moloch-v3:{}',
};
const VIEW = { id: 'default/v1' } as never;
const done = { turns: 1, model: 'm', fallback_used: false, tokens: { in: 1, out: 1 }, cost_usd: 0 };

function turn(after: Item[] = []): Item[] {
  let items: Item[] = [{ kind: 'user', text: 'map raidguild' }];
  items = fold(items, { event: 'approval_required', data: held });
  items = fold(items, { event: 'message', data: { text: 'Shall I read it? Yes or no.' } });
  items = fold(items, { event: 'done', data: done as never });
  return [...items, ...after];
}

describe('the card', () => {
  test('says what will be read: the kind of map, its chain, and what it is of', () => {
    expect(ceremonyView(held).what).toBe('Moloch v3 on Gnosis · 0xf0…e986');
  });

  test('goes after the agent’s words and before its note, in the last turn', () => {
    const rows = threadView({
      items: turn(),
      busy: false,
      runId: 'r',
      turn: null,
      lostAgain: false,
      recorded: false,
      view: VIEW,
    } as never);
    const kinds = rows.map((r) => r.kind);
    expect(kinds.indexOf('ceremony')).toBe(kinds.indexOf('done') - 1);
    expect(kinds.indexOf('message')).toBeLessThan(kinds.indexOf('ceremony'));
  });

  test('is gone once the person has answered, and while a turn runs', () => {
    const answered = turn([{ kind: 'user', text: 'Yes' }]);
    const base = {
      busy: false,
      runId: 'r',
      turn: null,
      lostAgain: false,
      recorded: false,
      view: VIEW,
    };
    expect(
      threadView({ ...base, items: answered } as never).some((r) => r.kind === 'ceremony'),
    ).toBe(false);
    expect(
      threadView({ ...base, items: turn(), busy: true } as never).some(
        (r) => r.kind === 'ceremony',
      ),
    ).toBe(false);
  });
});

describe("the composer's state", () => {
  test('creating while the read the person said yes to runs; exploring otherwise', () => {
    const yes = turn([{ kind: 'user', text: 'Yes' }]);
    expect(creating(yes, true)).toBe(true);
    expect(creating(yes, false)).toBe(false);
    expect(creating(turn(), true)).toBe(false);
    const base = { question: '', runId: 'r', busy: true, recorded: false };
    expect(composerView({ ...base, creating: true }).state).toBe(ceremonyWords.creating);
    expect(composerView({ ...base, creating: false }).state).toBeUndefined();
    // the two states, switchable, the one the person is in pressed
    expect(composerView({ ...base, mode: 'mapping' }).modes).toMatchObject({
      now: 'mapping',
      exploring: 'Exploring',
      mapping: 'Mapping',
    });
  });
});

describe('a new map being made, and what an answer is about', () => {
  test('making: after the yes, the held read with what it does, then its flower; nothing once it ended with none', () => {
    const yes = turn([
      { kind: 'user', text: 'Yes' },
      { kind: 'stage', stage: 'reading', message: 'Reading the DAO' },
    ]);
    expect(making(yes, true)).toMatchObject({ held, doing: 'Reading the DAO', flower: null });
    expect(making(yes, false)).toBeNull();
    expect(making(turn(), true)).toBeNull();
  });

  test('the card says it adds to a map that is there, its words and its cost, and skips a 0 s estimate', () => {
    const v = ceremonyView({
      ...held,
      existing_map: 'eip155:100:0xf02f',
      name: 'RaidGuild',
      what: 'Moloch v3 (Baal) members on Gnosis',
      cost: { usd: 0.02, seconds: 0, calls: 3 },
    });
    expect(v.heading).toBe('Add to RaidGuild');
    expect(v.what).toBe('Moloch v3 (Baal) members on Gnosis');
    expect(v.cost).toBe('About $0.02');
  });

  test('the last turn says what it is about on the map; an earlier turn says nothing now', () => {
    const shown: Item[] = [
      { kind: 'user', text: 'raidguild' },
      { kind: 'show', show: { map: 'eip155:100:0xf02f' } },
    ];
    expect(turnShow(shown)).toEqual({ map: 'eip155:100:0xf02f' });
    expect(turnShow([...shown, { kind: 'user', text: 'and now?' }])).toBeNull();
  });
});
