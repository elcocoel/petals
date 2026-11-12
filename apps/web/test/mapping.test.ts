// /make's two states (Elco, 12 Nov): what mapping says the person would add to the map in front.
import { describe, expect, test } from 'vitest';
import { mappingView, modeWords } from '../lib/mapping.ts';

const data = {
  about: 'eip155:100:0xf02f',
  name: 'RaidGuild',
  ready: 35,
  private: [],
  published: 0,
  adds: [
    { layer: 'Insights', kind: 'claims', verb: 'named', label: 'Names', count: 35, goes: true },
    {
      layer: 'Readings',
      kind: 'readings',
      label: 'Readings',
      count: 2,
      goes: false,
      why: 'A reading you drew is on the map already, uncredited; publishing it in your name comes later.',
    },
  ],
};

describe('the mapping state', () => {
  test('names the map, and says each layer it would add to, what goes and what can’t yet, with why', () => {
    const v = mappingView('eip155:100:0xf02f', 'RaidGuild', data);
    expect(v.heading).toBe('Mapping RaidGuild');
    expect(v.adds).toEqual([
      { key: 'Insights:claims:named', line: 'Insights · Names · 35', goes: true, why: null },
      {
        key: 'Readings:readings:Readings',
        line: 'Readings · 2',
        goes: false,
        why: data.adds[1]?.why,
      },
    ]);
    expect(v.empty).toBeNull();
  });

  test('with no map in front, or nothing kept, it says what to do', () => {
    expect(mappingView(null, null, null).empty).toBe(modeWords.noMap);
    expect(mappingView('m', 'X', { ...data, ready: 0, adds: [], private: [] }).empty).toBe(
      modeWords.nothing,
    );
  });
});
