// /make's two states: what mapping says the person would add to the map in front. Each layer says what it
// adds to that map, by the cases of the server's composition (composition.md §5).
import { describe, expect, test } from 'vitest';
import type { PublishableData } from '../lib/agent-client.ts';
import {
  casesLine,
  caseWords,
  countsOf,
  joinedOf,
  mappingView,
  modeWords,
  stateWords,
  toMapLines,
} from '../lib/mapping.ts';

const petals = { author: 'near:mainnet:mapping.petals.near', name: 'Petals’ mapping' };

const data: PublishableData = {
  about: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:6p6x',
  name: 'TRUMP',
  ready: 4,
  private: [],
  published: 0,
  layers: [
    {
      sha256: 'a1',
      petal: 'snapshot/v1',
      title: 'TRUMP holders on Solana',
      cases: {
        new_moment: {
          states: [{ state: { block: 465695924 }, newest: { block: 465600000 } }],
        },
        new_subjects: { count: 212 },
        match: { count: 60, authors: [petals] },
      },
    },
    {
      sha256: 'b2',
      petal: 'vesting/v1',
      title: 'TRUMP vesting',
      cases: { new_data: { whats: ['vesting/schedule'] } },
    },
  ],
  totals: {
    new_data: { whats: ['vesting/schedule'] },
    new_moment: { states: [{ state: { block: 465695924 }, newest: { block: 465600000 } }] },
    new_subjects: { count: 212 },
    match: { count: 60, authors: [petals] },
  },
  adds: [
    { layer: 'Insights', kind: 'claims', verb: 'named', label: 'Names', count: 4, goes: true },
    {
      layer: 'Proposals',
      kind: 'proposals',
      label: 'Proposals kept',
      count: 1,
      goes: false,
      why: 'proposals you kept publish later',
    },
  ],
};

describe('the mapping state', () => {
  test('names the map, and each layer the press would publish with what it adds to that map', () => {
    const v = mappingView(data.about, 'TRUMP', data);
    expect(v.heading).toBe('Mapping TRUMP');
    expect(v.layers.map((l) => [l.line, l.toMap.map((t) => `${t.tag}: ${t.words}`)])).toEqual([
      [
        'TRUMP holders on Solana',
        [
          'New moment: block 465,695,924; the map’s newest is block 465,600,000',
          'New subjects: 212 subjects the map had no facts for',
          'Match: 60 facts the same as Petals’ mapping’s, credited to both of you',
        ],
      ],
      ['TRUMP vesting', ['New data: The map has no vesting schedule yet']],
    ]);
    expect(v.empty).toBeNull();
  });

  test('what goes is in the layers; what can’t go yet stays listed, with why', () => {
    expect(mappingView(data.about, 'TRUMP', data).adds).toEqual([
      {
        key: 'Proposals:proposals:Proposals kept:stays',
        line: 'Proposals · Proposals kept · 1',
        goes: false,
        why: 'proposals you kept publish later',
      },
    ]);
  });

  test('with no map in front, or nothing kept, it says what to do', () => {
    expect(mappingView(null, null, null).empty).toBe(modeWords.noMap);
    expect(
      mappingView('m', 'X', { ...data, ready: 0, layers: [], adds: [], private: [] }).empty,
    ).toBe(modeWords.nothing);
  });
});

describe('the cases, in words', () => {
  test('a difference stands beside the other value, and a match credits everyone who stated it', () => {
    const lines = toMapLines({
      match: { count: 1, authors: [petals, { author: 'near:mainnet:bob.near', name: 'bob.near' }] },
      differs: { count: 3, authors: [petals] },
    });
    expect(lines.map((l) => `${l.tag}: ${l.words}`)).toEqual([
      'Match: 1 fact the same as Petals’ mapping and 1 other’s, credited to each of you',
      'Differs: 3 facts where Petals’ mapping read another value; both stand, for anyone to check',
    ]);
  });

  test('a moment is its block, or its day, and its window; a first moment has no newest beside it', () => {
    expect(stateWords({ block: 465695924 })).toBe('block 465,695,924');
    expect(stateWords({ at: '2026-11-11T09:00:00Z' })).toBe('11 Nov');
    expect(stateWords({ window: { from: '2026-11-01T00:00:00Z', to: '40500000' } })).toBe(
      '1 Nov to block 40,500,000',
    );
    expect(caseWords.line.new_moment({ states: [{ state: { block: 7 }, newest: null }] })).toBe(
      'block 7',
    );
  });

  test('a case with nothing in it isn’t said, and data reads by its own name', () => {
    expect(
      toMapLines({
        new_data: { whats: ['snapshot/token_balance TRUMP', 'proposals/outcome'] },
        new_moment: { states: [] },
        new_subjects: { count: 0 },
        match: { count: 0, authors: [] },
        differs: { count: 0, authors: [] },
      }).map((l) => `${l.tag}: ${l.words}`),
    ).toEqual(['New data: The map has no token balance TRUMP, proposals outcome yet']);
  });

  test('the summary counts kinds of data, moments, subjects and facts, and says nothing of what’s zero', () => {
    expect(casesLine({ new_subjects: 1, match: 1, differs: 0 })).toBe(
      '1 new subject · 1 fact matches',
    );
    expect(casesLine({})).toBeNull();
    expect(countsOf({ differs: { count: 2, authors: [] } })).toEqual({ differs: 2 });
  });
});

describe('when the press lands', () => {
  test('it hands the map and Information which publication joined which map, whose, and what it added', () => {
    expect(
      joinedOf(
        data.about,
        'alice.near',
        data.layers ?? [],
        {
          publication: 'f'.repeat(64),
          layers: [{ sha256: 'b2', petal: 'vesting/v1' }],
          totals: { new_data: { whats: ['vesting schedule'] } },
        },
        1700000000000,
      ),
    ).toEqual({
      map: data.about,
      publication: 'f'.repeat(64),
      author: 'alice.near',
      documents: [{ sha256: 'b2', petal: 'vesting/v1', what: 'TRUMP vesting' }],
      at: 1700000000000,
    });
  });
});
