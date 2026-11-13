// An empty conversation offers where to start: the readiest maps of the one shared map, the page's own words.
import { describe, expect, test } from 'vitest';
import type { MapCard } from '../lib/maps.ts';
import { newConversationStarts, newConversationWords } from '../lib/opening.ts';
import { threadFromRun } from '../lib/thread.ts';

/** A map, one per address, as GET /api/v1/maps gives it; `counts` are its readings', newest first. */
const card = (
  id: string,
  title: string,
  counts: number[],
  name: string | null = null,
): MapCard => ({
  id,
  name,
  title,
  about: 'validators on NEAR',
  chain: 'near:mainnet',
  address: null,
  picture: `/api/v1/map/${id}/svg`,
  view_url: `https://petals.test/d/${id}`,
  keys: [],
  readings: counts.map((count, i) => ({
    snapshot: `${id}-${i}`,
    as_of: '2026-11-03T19:42:00Z',
    network: 'near-validators',
    about: 'validators on NEAR',
    title,
    count,
    made_by: null,
    drawings: [],
  })),
});
const map = card('near:validators', 'NEAR validators', [8487]);

describe('where a new conversation starts', () => {
  test('two maps that read the same name are offered once, the larger', () => {
    const starts = newConversationStarts([
      card('sol:mnde-a', 'Marinade MNDE deposits and lock schedules', [40]),
      card('sol:mnde-b', 'Marinade MNDE deposits and lock schedules', [90]),
      card('near:validators', 'NEAR validators', [60]),
    ]);
    expect(starts.filter((s) => s.label === 'Marinade MNDE deposits and lock schedules')).toEqual([
      { label: 'Marinade MNDE deposits and lock schedules', href: '/m/sol%3Amnde-b' },
    ]);
  });

  test('the largest three first, by a map’s largest reading, then the whole Power Map', () => {
    const starts = newConversationStarts([
      card('s', 'Small', [3]),
      map,
      // holders and delegates of one address: one map, sized by its larger reading
      card('u', 'UNI delegates', [500, 21919], 'UNI'),
      card('e', 'ENS delegates', [8561], 'ENS (token-only map)'),
    ]);
    expect(starts).toEqual([
      { label: 'UNI', href: '/m/u' },
      { label: 'ENS', href: '/m/e' },
      { label: 'NEAR validators', href: '/m/near%3Avalidators' },
      { label: newConversationWords.powerMap, href: '/map' },
    ]);
  });

  test('with no maps to read, only the whole Power Map', () => {
    expect(newConversationStarts([])).toEqual([
      { label: newConversationWords.powerMap, href: '/map' },
    ]);
  });
});

describe('a stored conversation', () => {
  test('a conversation from before keeps the opening it was stored with', () => {
    const opening = 'Hi. What are you curious about?';
    const items = threadFromRun({
      messages: [
        { role: 'assistant', content: opening },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'Hi.' },
      ],
      events: [
        { event: 'run', data: { run_id: 'r', resume_url: '/make?run=r' } },
        { event: 'message', data: { text: 'Hi.' } },
      ],
    });
    expect(items[0]).toEqual({ kind: 'message', text: opening });
    expect(items[1]).toEqual({ kind: 'user', text: 'hello' });
  });
});
