// A Sputnik DAO (board #93): its members by the votes they cast, and its proposals with each account's vote.
// Raw data in the DAO's own shape (get_policy, get_proposals), as the Marketing DAO answered on 11 Nov.
import { titleOf, validateProposals, validateSnapshot } from '@petal/core';
import { describe, expect, test } from 'vitest';
import {
  type SputnikRead,
  sputnikProposals,
  sputnikSnapshot,
  sputnikTarget,
} from '../src/modules/sputnik-dao.ts';

const DAO = 'marketing.sputnik-dao.near';
const AT = { block_height: 224079989, as_of: '2026-11-11T15:00:00.000Z' };
const WEEK = '604800000000000';
const read: SputnikRead = {
  endpoint: 'https://rpc.mainnet.fastnear.com',
  policy: {
    proposal_period: WEEK,
    roles: [
      { name: 'Council', kind: { Group: ['so608.near', 'cryptocredit.near', 'johanga108.near'] } },
      { name: 'all', kind: 'Everyone' as const },
    ],
  },
  proposals: [
    {
      id: 1050,
      proposer: 'cryptocredit.near',
      description: 'Transfer NEAR balance held in MDAO treasury to marketing-dao.near',
      kind: { Transfer: {} },
      status: 'Approved',
      votes: { 'cryptocredit.near': 'Approve', 'so608.near': 'Approve' },
      submission_time: '1718375951803215557',
    },
    {
      id: 1051,
      proposer: 'tolmindev.near',
      description: '* Title: MDAO Design services <br>* Summary: June 2024',
      kind: { Transfer: {} },
      status: 'Rejected',
      votes: { 'so608.near': 'Reject', 'whendacha.near': 'Remove' },
      submission_time: '1718466558457948676',
    },
    {
      id: 1052,
      proposer: 'x.near',
      description: 'no votes yet',
      kind: 'Vote',
      status: 'InProgress',
      votes: {},
      submission_time: '1718466558457948676',
    },
  ],
};

describe('a Sputnik DAO', () => {
  test('its target: an account ending .sputnik-dao.near, and nothing else', () => {
    expect(sputnikTarget({ dao: DAO })).toEqual({ dao: DAO, population: `sputnik-dao-${DAO}` });
    expect(() => sputnikTarget({ dao: 'marketing.near' })).toThrow(/sputnik-dao needs a dao/);
  });

  test("a proposal's title: its Title line, or its first words", () => {
    expect(titleOf('* Title: MDAO Design services <br>* Summary: June 2024')).toBe(
      'MDAO Design services',
    );
    expect(titleOf('Transfer NEAR balance\nmore')).toBe('Transfer NEAR balance');
  });

  test('its proposals: each vote as for or against with its own word, an account that didn’t vote absent, closes_at by its policy', () => {
    const p = sputnikProposals(`near:mainnet:${DAO}`, DAO, read, AT, AT.as_of);
    expect(validateProposals(p).ok).toBe(true);
    expect(p.source).toMatchObject({
      kind: 'sputnik',
      contract: `near:mainnet:${DAO}`,
      at: AT.as_of,
    });
    const [a, b, c] = p.proposals;
    expect(a).toMatchObject({
      id: '1050',
      kind: 'Transfer',
      outcome: 'passed',
      as_said: 'Approved',
      decided_at: null,
      ref: `proposal:near:mainnet:${DAO}:1050`,
      at: '2024-06-14T14:39:11.803Z',
      closes_at: '2024-06-21T14:39:11.803Z',
    });
    expect(a?.votes).toEqual([
      { account: 'cryptocredit.near', vote: 'for', as_said: 'Approve', at: null },
      { account: 'so608.near', vote: 'for', as_said: 'Approve', at: null },
    ]);
    expect(b?.title).toBe('MDAO Design services');
    expect(b?.votes.map((v) => [v.account, v.vote, v.as_said])).toEqual([
      ['so608.near', 'against', 'Reject'],
      ['whendacha.near', 'against', 'Remove'],
    ]);
    // nobody voted: no votes, never a guess
    expect(c).toMatchObject({ kind: 'Vote', outcome: 'in progress', votes: [] });
    // johanga108.near voted on none of these: absent from every one
    expect(p.proposals.flatMap((x) => x.votes).some((v) => v.account === 'johanga108.near')).toBe(
      false,
    );
  });

  test('its members: every account in a role and every one that voted, by the votes it cast', () => {
    const s = sputnikSnapshot(DAO, read, AT);
    expect(validateSnapshot(s).ok).toBe(true);
    expect(s.participants.map((p) => p.id)).toEqual([
      'cryptocredit.near',
      'johanga108.near',
      'so608.near',
      'whendacha.near',
    ]);
    const cast = Object.fromEntries(
      s.holdings.filter((h) => h.measure === 'votes_cast').map((h) => [h.participant, h.amount]),
    );
    expect(cast).toEqual({
      'cryptocredit.near': '1',
      'johanga108.near': '0',
      'so608.near': '2',
      'whendacha.near': '1',
    });
    expect(s.network.params).toEqual({ dao: DAO });
    expect(s.coverage.note).toContain('Council');
  });
});
