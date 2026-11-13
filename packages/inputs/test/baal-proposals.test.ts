// A Baal DAO's proposals: from its own events, each vote approved or not with its time, each
// proposal passed, failed, rejected, cancelled, expired or in progress. Events built as the chain encodes them.
import { validateProposals } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { GNOSIS } from '../src/evm/chains.ts';
import {
  BAAL_EVENTS,
  type BaalLog,
  baalProposals,
  baalTitle,
} from '../src/modules/baal-proposals.ts';

const DAO = '0xf02fd4286917270cb94fbc13a0f4e1ed76f7e986';
const word = (n: bigint | number) => BigInt(n).toString(16).padStart(64, '0');
const topic = (n: bigint | number) => `0x${word(n)}`;
const addr = (a: string) => `0x${a.slice(2).padStart(64, '0')}`;
const T0 = 1762200000n; // 2025-11-03T20:00:00Z

/** SubmitProposal's data: votingPeriod, proposalData, expiration, baalGas, selfSponsor, timestamp, details. */
function submitData(o: {
  period: bigint;
  expiration: bigint;
  self: boolean;
  at: bigint;
  details: string;
}) {
  const details = Buffer.from(o.details, 'utf8').toString('hex');
  const padded = details.padEnd(Math.ceil(details.length / 64) * 64, '0');
  const head = [
    word(o.period),
    word(7 * 32), // proposalData's offset
    word(o.expiration),
    word(0),
    word(o.self ? 1 : 0),
    word(o.at),
    word(8 * 32), // details' offset: after proposalData's empty length word
  ];
  return `0x${head.join('')}${word(0)}${word(details.length / 2)}${padded}`;
}
const log = (topics: string[], data: string, block: number, ts: bigint): BaalLog => ({
  topics,
  data,
  blockNumber: `0x${block.toString(16)}`,
  blockTimestamp: `0x${ts.toString(16)}`,
  transactionHash: `0x${word(block)}`,
});
const DAY = 86400n;
const LOGS: BaalLog[] = [
  log(
    [BAAL_EVENTS.submit, topic(1), topic(0)],
    submitData({
      period: 3n * DAY,
      expiration: 0n,
      self: true,
      at: T0,
      details: '{"title":"Fund the guild","description":"x"}',
    }),
    10,
    T0,
  ),
  log(
    [BAAL_EVENTS.vote, addr('0xaaaa000000000000000000000000000000000001'), topic(1), topic(1)],
    `0x${word(100)}`,
    11,
    T0 + 60n,
  ),
  log(
    [BAAL_EVENTS.vote, addr('0xaaaa000000000000000000000000000000000002'), topic(1), topic(0)],
    `0x${word(50)}`,
    12,
    T0 + 120n,
  ),
  log([BAAL_EVENTS.process, topic(1)], `0x${word(1)}${word(0)}`, 20, T0 + 4n * DAY),
  log(
    [BAAL_EVENTS.submit, topic(2), topic(0)],
    submitData({
      period: DAY,
      expiration: 0n,
      self: false,
      at: T0,
      details: 'Plain words, no JSON',
    }),
    13,
    T0,
  ),
  log(
    [
      BAAL_EVENTS.sponsor,
      addr('0xaaaa000000000000000000000000000000000001'),
      topic(2),
      topic(T0 + DAY),
    ],
    '0x',
    14,
    T0 + DAY,
  ),
  log([BAAL_EVENTS.process, topic(2)], `0x${word(1)}${word(1)}`, 21, T0 + 3n * DAY),
  log(
    [BAAL_EVENTS.submit, topic(3), topic(0)],
    submitData({ period: DAY, expiration: T0 + DAY, self: false, at: T0, details: '{}' }),
    15,
    T0,
  ),
  log(
    [BAAL_EVENTS.submit, topic(4), topic(0)],
    submitData({
      period: DAY,
      expiration: 0n,
      self: true,
      at: T0,
      details: '{"title":"Withdrawn"}',
    }),
    16,
    T0,
  ),
  log([BAAL_EVENTS.cancel, topic(4)], '0x', 17, T0 + 600n),
];

describe('a Baal DAO', () => {
  test("a proposal's title: its details' title, or their first words", () => {
    expect(baalTitle('{"title":"Fund the guild","description":"x"}')).toBe('Fund the guild');
    expect(baalTitle('Plain words, no JSON')).toBe('Plain words, no JSON');
  });

  test('its proposals from its events: votes with their times, outcomes, closes_at from when voting starts', () => {
    const now = Number((T0 + 10n * DAY) * 1000n);
    const p = baalProposals(
      `eip155:100:0xshares`,
      GNOSIS,
      DAO,
      LOGS,
      '2026-11-11T16:00:00.000Z',
      now,
      // the sender of proposal 1's SubmitProposal (block 10's transaction); proposal 2's wasn't answered
      new Map([[`0x${word(10)}`, '0xbbbb000000000000000000000000000000000001']]),
    );
    expect(validateProposals(p).ok).toBe(true);
    expect(p.petal).toBe('proposals/v3');
    // its page on DAOhaus is where it was made
    expect(p.proposals[0]?.link).toEqual({
      url: `https://admin.daohaus.club/#/molochv3/0x64/${DAO.toLowerCase()}/proposal/${p.proposals[0]?.id}`,
      kind: 'where it was made',
    });
    expect(p.source).toMatchObject({ kind: 'baal', contract: `eip155:100:${DAO}` });
    const by = Object.fromEntries(p.proposals.map((x) => [x.id, x]));
    expect(by['1']).toMatchObject({
      title: 'Fund the guild',
      outcome: 'passed',
      at: '2025-11-03T20:00:00.000Z',
      closes_at: '2025-11-06T20:00:00.000Z',
      decided_at: '2025-11-07T20:00:00.000Z',
      ref: `proposal:eip155:100:${DAO}:1`,
      proposer: '0xbbbb000000000000000000000000000000000001',
      // what a Baal proposal pays is in its encoded actions, not read: none named
      recipient: null,
    });
    expect(by['2']?.proposer).toBeNull();
    expect(by['1']?.votes).toEqual([
      {
        account: '0xaaaa000000000000000000000000000000000001',
        vote: 'for',
        as_said: 'approved',
        at: '2025-11-03T20:01:00.000Z',
      },
      {
        account: '0xaaaa000000000000000000000000000000000002',
        vote: 'against',
        as_said: 'not approved',
        at: '2025-11-03T20:02:00.000Z',
      },
    ]);
    // sponsored a day later: its vote closes a period after that; passed, but its action failed
    expect(by['2']).toMatchObject({
      outcome: 'failed',
      as_said: 'passed, action failed',
      closes_at: '2025-11-05T20:00:00.000Z',
    });
    // never sponsored and past its expiration: expired, no votes, never a guess
    expect(by['3']).toMatchObject({ outcome: 'expired', votes: [], closes_at: null });
    expect(by['4']).toMatchObject({ outcome: 'cancelled', decided_at: '2025-11-03T20:10:00.000Z' });
  });
});
