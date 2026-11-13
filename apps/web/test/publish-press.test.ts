// Publishing what a person mapped, with one press (Elco, 12 Nov). Wave 8 (13 Nov): one signed version of their
// layers, from the wallet they choose, with who did the work recorded (composition.md §2).
import { describe, expect, test } from 'vitest';
import type { PublishableData } from '../lib/agent-client.ts';
import { publishPressView, publishWords, signersOf } from '../lib/publish-press.ts';

const data: PublishableData = {
  about: 'eip155:100:0xf02f',
  name: 'RaidGuild',
  ready: 63,
  private: [
    { id: 'a', subject: '0xced6', verb: 'named', why: 'No proposal declares it.' },
    { id: 'b', subject: '0xd26a', verb: 'named', why: 'No proposal declares it.' },
  ],
  published: 0,
  layers: [
    {
      sha256: 'c3',
      petal: 'claims/v1',
      title: 'Names and notes · 63',
      cases: { new_data: { whats: ['names'] } },
    },
  ],
};

const wallets = [
  {
    network: 'mainnet',
    account_id: 'alice.near',
    proved_at: '2026-11-11T09:00:00Z',
    author: 'near:mainnet:alice.near',
  },
  {
    network: 'eip155',
    account_id: '0xced608aa29bb92185d9b6340adcbfa263dae075b',
    proved_at: '2026-11-12T09:00:00Z',
    author: 'eip155:1:0xced608aa29bb92185d9b6340adcbfa263dae075b',
  },
];
const signers = signersOf(wallets);
const one = { signers: signers.slice(0, 1), chosen: 'mainnet:alice.near', via: null };

describe('the publish press', () => {
  test('signs as one of the person’s wallets, each named as their author', () => {
    expect(signers).toEqual([
      {
        key: 'mainnet:alice.near',
        author: 'near:mainnet:alice.near',
        label: 'NEAR · alice.near',
        shown: 'alice.near',
      },
      {
        key: 'eip155:0xced608aa29bb92185d9b6340adcbfa263dae075b',
        author: 'eip155:1:0xced608aa29bb92185d9b6340adcbfa263dae075b',
        label: 'Ethereum · 0xce…075b',
        shown: '0xce…075b',
      },
    ]);
    // a wallet with no author can't sign a publication
    expect(signersOf([{ ...wallets[0], author: undefined } as never])).toEqual([]);
  });

  test('with one wallet it just presses; with more, the person chooses which signs', () => {
    expect(publishPressView(data, 'ready', null, one)).toMatchObject({
      press: publishWords.press,
      sign: publishWords.sign,
      signers: null,
    });
    expect(
      publishPressView(data, 'ready', null, { signers, chosen: signers[1]?.key ?? null, via: null })
        ?.signers,
    ).toEqual({
      label: publishWords.signsAs,
      options: [
        { value: 'mainnet:alice.near', label: 'NEAR · alice.near' },
        {
          value: 'eip155:0xced608aa29bb92185d9b6340adcbfa263dae075b',
          label: 'Ethereum · 0xce…075b',
        },
      ],
      chosen: 'eip155:0xced608aa29bb92185d9b6340adcbfa263dae075b',
    });
  });

  test('says who did the work, as the publication records it', () => {
    expect(
      publishPressView(data, 'ready', null, {
        ...one,
        via: { kind: 'agent', name: publishWords.agent, model: 'Qwen3 30B' },
      })?.via,
    ).toBe('Mapped with Petals’ agent (Qwen3 30B)');
  });

  test('is not there with no layers to publish, or no wallet to sign', () => {
    expect(publishPressView({ ...data, layers: [] }, 'ready', null, one)).toBeNull();
    expect(publishPressView(data, 'ready', null, { ...one, signers: [] })).toBeNull();
    expect(publishPressView(null, 'ready', null, one)).toBeNull();
  });

  test('waits on the wallet, then says what joined the map, or why not', () => {
    expect(publishPressView(data, 'signing', null, one)).toMatchObject({
      press: publishWords.signing,
      busy: true,
    });
    expect(
      publishPressView(data, 'published', publishWords.published('1 new kind of data'), one),
    ).toMatchObject({
      press: null,
      said: 'On the shared map in your name: 1 new kind of data.',
    });
    expect(publishPressView(data, 'failed', publishWords.otherWallet, one)?.said).toBe(
      publishWords.otherWallet,
    );
  });

  test('with no names listed, the private ones fold under one line, each with why', () => {
    expect(publishPressView(data, 'ready', null, one)?.why?.lines).toEqual([
      '0xced6: No proposal declares it.',
      '0xd26a: No proposal declares it.',
    ]);
  });
});

describe('the names, read before the press (Elco: "Let me look first")', () => {
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
      one,
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
    // with the list, nothing is folded
    expect(v?.why).toBeNull();
  });
});
