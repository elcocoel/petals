// The agent speaks first: written text, from real maps of the one shared map, no model call.
import { describe, expect, test } from 'vitest';
import type { MapCard } from '../lib/maps.ts';
import { parseMarkdown } from '../lib/markdown.ts';
import { openingMessage } from '../lib/opening.ts';
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

describe('openingMessage', () => {
  test('two maps that read the same name are offered once, the larger (#78)', () => {
    const text = openingMessage([
      card('sol:mnde-a', 'Marinade MNDE deposits and lock schedules', [40]),
      card('sol:mnde-b', 'Marinade MNDE deposits and lock schedules', [90]),
      card('near:validators', 'NEAR validators', [60]),
    ]);
    expect(text.match(/Marinade MNDE deposits and lock schedules/g)).toHaveLength(1);
    expect(text).toContain('/m/sol%3Amnde-b');
    expect(text).toContain('[NEAR validators]');
  });

  test('offers maps, one per address, each by its page', () => {
    const text = openingMessage([map]);
    expect(text).toContain('[NEAR validators](/m/near%3Avalidators)');
    expect(text).toContain('[Power Map](/map)');
  });

  test("the largest three first, by a map's largest reading, and still talks with an empty or unreachable map", () => {
    const text = openingMessage([
      card('s', 'Small', [3]),
      map,
      // holders and delegates of one address: one map, sized by its larger reading
      card('u', 'UNI delegates', [500, 21919], 'UNI'),
      card('e', 'ENS delegates', [8561], 'ENS (token-only map)'),
    ]);
    expect(text).toContain(
      "Or start from what's already mapped: [UNI](/m/u), [ENS](/m/e), [NEAR validators](/m/near%3Avalidators), or the whole [Power Map](/map).",
    );
    expect(text).not.toContain('Small');
    const empty = openingMessage([]);
    expect(empty).toContain('What are you curious about?');
    expect(empty).not.toContain('Power Map');
  });

  test('a title cannot break its link', () => {
    expect(openingMessage([card('x', 'a [b] c', [1])])).toContain('[a b c](/m/x)');
  });

  test('renders as links on this site', () => {
    const blocks = JSON.stringify(parseMarkdown(openingMessage([map]), new Set()));
    expect(blocks).toContain('"href":"/m/near%3Avalidators"');
    expect(blocks).toContain('"href":"/map"');
  });

  test('a reopened conversation still starts with what the agent said', () => {
    const opening = openingMessage([map]);
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
