// Publishing what a person kept about a map, with one press (Elco, 12 Nov).
import { describe, expect, test } from 'vitest';
import { publishPressView, publishWords } from '../lib/publish-press.ts';

const data = {
  about: 'eip155:100:0xf02f',
  name: 'RaidGuild',
  ready: 63,
  private: [
    { id: 'a', subject: '0xced6', verb: 'named', why: 'No proposal declares it.' },
    { id: 'b', subject: '0xd26a', verb: 'named', why: 'No proposal declares it.' },
  ],
  published: 0,
};

describe('the publish press', () => {
  test('says how many can go and how many stay, and why the rest stay, folded', () => {
    const v = publishPressView(data, 'ready', null);
    expect(v?.press).toBe(publishWords.press);
    expect(v?.counts).toBe('63 can go on the shared map in your name; 2 stay private.');
    expect(v?.why?.lines).toEqual([
      '0xced6: No proposal declares it.',
      '0xd26a: No proposal declares it.',
    ]);
  });

  test('is not there when nothing can go', () => {
    expect(publishPressView({ ...data, ready: 0 }, 'ready', null)).toBeNull();
    expect(publishPressView(null, 'ready', null)).toBeNull();
  });

  test('waits on the wallet, then says what went, or why not', () => {
    expect(publishPressView(data, 'signing', null)).toMatchObject({
      press: publishWords.signing,
      busy: true,
    });
    expect(publishPressView(data, 'published', publishWords.published(63))).toMatchObject({
      press: null,
      said: 'Published on the shared map: 63.',
    });
    expect(publishPressView(data, 'failed', publishWords.otherWallet)?.said).toBe(
      publishWords.otherWallet,
    );
  });
});

describe('the list, read before the press (Elco: "Let me look first")', () => {
  test('every name that goes, one per row: its address, its source and quote, its confidence; then the private ones with why', () => {
    const v = publishPressView(
      {
        ...data,
        claims: [
          {
            id: 'n1',
            subject: '0xced608aa29bb92185d9b6340adcbfa263dae075b',
            name: 'Dekan',
            source: {
              kind: 'proposal',
              ref: '#42',
              quote: 'Dekan, our treasurer',
              url: 'https://x/42',
            },
            confidence: 0.92,
          },
          {
            id: 'n2',
            subject: 'alice.near',
            name: 'Alice',
            source: { kind: 'transaction', ref: '9f3kTx' },
            confidence: null,
          },
        ],
      },
      'ready',
      null,
    );
    expect(v?.rows?.going).toEqual([
      {
        key: 'n1',
        name: 'Dekan',
        address: '0xce…075b',
        source: 'Proposal #42: “Dekan, our treasurer”',
        sourceUrl: 'https://x/42',
        confidence: 'Confidence 92%',
        why: null,
      },
      {
        key: 'n2',
        name: 'Alice',
        address: 'alice.near',
        source: 'Transaction 9f3kTx',
        sourceUrl: null,
        confidence: null,
        why: null,
      },
    ]);
    expect(v?.rows?.staying.map((r) => r.why)).toEqual([
      'No proposal declares it.',
      'No proposal declares it.',
    ]);
    // with the list, the private ones are in it, not folded apart
    expect(v?.why).toBeNull();
  });
});

describe('readings you drew go with them (wave 7)', () => {
  test('listed first, each in words with its accounts; the press and the result say so', () => {
    const v = publishPressView(
      {
        ...data,
        readings: [
          {
            layer: 'Readings',
            id: 'r1',
            title: 'RaidGuild',
            what: 'Moloch v3 (Baal) members on Gnosis, 11 Nov',
            as_of: '2026-11-11',
            accounts: 174,
          },
        ],
      },
      'ready',
      null,
    );
    expect(v?.press).toBe(publishWords.pressAll);
    expect(v?.counts).toContain('1 reading you drew goes with them.');
    expect(v?.rows?.readings?.rows[0]).toMatchObject({
      name: 'Moloch v3 (Baal) members on Gnosis, 11 Nov',
      address: '174 accounts',
    });
    expect(publishWords.publishedAll(62, 1)).toBe(
      'Published on the shared map: 62 names and notes, 1 reading.',
    );
  });

  test('readings alone, with no names to go, still offer the press', () => {
    const v = publishPressView(
      {
        ...data,
        ready: 0,
        private: [],
        readings: [
          { layer: 'Readings', id: 'r1', title: 'X', what: 'X', as_of: '2026-11-11', accounts: 3 },
        ],
      },
      'ready',
      null,
    );
    expect(v?.press).toBe(publishWords.pressAll);
  });
});
