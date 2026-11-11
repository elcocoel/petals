// Voting blocs over a period (#94): pairs that voted on enough of the same proposals and alike on enough of
// them, the blocs they link, and each pair as an inferred claim: agreement, never proof of coordination.
import { describe, expect, test } from 'vitest';
import { BLOCS_DEFAULTS, blocClaims, votingBlocs } from '../src/blocs.ts';
import { validateClaim } from '../src/claims/index.ts';
import type { Proposal, Proposals } from '../src/proposals.ts';

const DAO = 'near:mainnet:guild.sputnik-dao.near';
const proposal = (
  id: number,
  at: string,
  votes: [string, 'for' | 'against' | null][],
): Proposal => ({
  id: String(id),
  title: `Proposal ${id}`,
  kind: 'Transfer',
  proposer: null,
  at,
  closes_at: null,
  decided_at: null,
  outcome: 'passed',
  as_said: 'Approved',
  ref: `proposal:${DAO}:${id}`,
  recipient: null,
  votes: votes.map(([account, vote]) =>
    vote === null
      ? { account, vote, choices: [{ choice: '1', weight: '1' }], as_said: 'weighted', at: null }
      : { account, vote, as_said: vote === 'for' ? 'Approve' : 'Reject', at: null },
  ),
});
// ana and ben vote alike on six proposals of seven; cy votes with them on three; dee with ana on two
const P: Proposals = {
  petal: 'proposals/v2',
  about: DAO,
  source: { kind: 'sputnik', contract: DAO, ref: 'test', at: '2026-11-11T00:00:00.000Z' },
  proposals: [
    proposal(1, '2025-01-05T00:00:00.000Z', [
      ['ana.near', 'for'],
      ['ben.near', 'for'],
      ['cy.near', 'for'],
    ]),
    proposal(2, '2025-01-12T00:00:00.000Z', [
      ['ana.near', 'for'],
      ['ben.near', 'for'],
      ['dee.near', 'for'],
    ]),
    proposal(3, '2025-02-01T00:00:00.000Z', [
      ['ana.near', 'against'],
      ['ben.near', 'against'],
      ['cy.near', 'for'],
    ]),
    proposal(4, '2025-02-15T00:00:00.000Z', [
      ['ana.near', 'for'],
      ['ben.near', 'for'],
      ['dee.near', 'against'],
    ]),
    proposal(5, '2025-03-01T00:00:00.000Z', [
      ['ana.near', 'for'],
      ['ben.near', 'for'],
      ['cy.near', 'against'],
    ]),
    proposal(6, '2025-04-01T00:00:00.000Z', [
      ['ana.near', 'for'],
      ['ben.near', 'against'],
    ]),
    proposal(7, '2025-05-01T00:00:00.000Z', [
      ['ana.near', 'against'],
      ['ben.near', 'against'],
      ['cy.near', null],
    ]),
    proposal(8, '2025-06-01T00:00:00.000Z', []),
  ],
  read_at: '2026-11-11T00:00:00.000Z',
};

describe('voting blocs', () => {
  test('a pair counts when it shares enough proposals and votes alike on enough; a weighted ballot is not a vote', () => {
    const b = votingBlocs(P);
    expect(b.method).toEqual({ name: 'blocs/agreement@1', ...BLOCS_DEFAULTS });
    expect(b.proposals).toEqual({ in_period: 8, voted: 7 });
    // ana and ben: 7 shared, 6 alike (86%); cy shares 3 with each (and its weighted ballot on 7 isn't counted)
    expect(b.pairs).toEqual([
      {
        a: 'near:mainnet:ana.near',
        b: 'near:mainnet:ben.near',
        shared: 7,
        agreed: 6,
        agreement: 0.8571,
        proposals: [1, 2, 3, 4, 5, 6, 7].map((i) => `proposal:${DAO}:${i}`),
      },
    ]);
    expect(b.blocs).toEqual([
      {
        id: expect.stringMatching(/^bloc:[0-9a-f]{12}$/),
        members: ['near:mainnet:ana.near', 'near:mainnet:ben.near'],
        pairs: 1,
      },
    ]);
  });

  test('the thresholds and the period are the asker’s; below either there is no bloc', () => {
    const loose = votingBlocs(P, { min_shared: 2, min_agreement: 0.5 });
    expect(
      loose.pairs.map((p) => [p.a.split(':')[2], p.b.split(':')[2], p.agreed, p.shared]),
    ).toEqual([
      // cy votes alike with each on 1 of 3: out; dee with each on 1 of 2: in, at 50%
      ['ana.near', 'ben.near', 6, 7],
      ['ana.near', 'dee.near', 1, 2],
      ['ben.near', 'dee.near', 1, 2],
    ]);
    expect(loose.blocs[0]?.members).toHaveLength(3);
    // January and February only: ana and ben share 4, fewer than the default 5
    const early = votingBlocs(P, {
      from: '2025-01-01T00:00:00.000Z',
      to: '2025-03-01T00:00:00.000Z',
    });
    expect(early.proposals.in_period).toBe(4);
    expect(early.pairs).toEqual([]);
    expect(early.period).toEqual({
      from: '2025-01-01T00:00:00.000Z',
      to: '2025-03-01T00:00:00.000Z',
    });
  });

  test('each pair as an inferred claim: they act in step, its proposals as evidence, its method and counts in words', () => {
    const [claim] = blocClaims(votingBlocs(P), {
      by: 'tool:petals-blocs@1',
      at: '2026-11-11T20:00:00.000Z',
    });
    expect(validateClaim(claim).ok).toBe(true);
    expect(claim).toMatchObject({
      subject: 'near:mainnet:ana.near',
      verb: 'moves_with',
      object: 'near:mainnet:ben.near',
      kind: 'inferred',
      qualifiers: { grounds: 'synchronised_behaviour' },
      by: 'tool:petals-blocs@1',
    });
    expect(claim?.method).toMatch(/^blocs\/agreement@1#[0-9a-f]{12}$/);
    expect(claim?.evidence[0]).toMatchObject({
      type: 'note',
      note: 'Voted alike on 6 of the 7 proposals both voted on, over every proposal read (blocs/agreement@1: at least 5 in common, 80% alike). Agreement, not proof of coordination.',
    });
    expect(claim?.evidence.filter((e) => e.type === 'proposal')).toHaveLength(7);
  });

  test("a Baal's votes are named on its chain, in lower case", () => {
    const evm = {
      ...P,
      source: { ...P.source, contract: 'eip155:100:0xf02fd4286917270cb94fbc13a0f4e1ed76f7e986' },
      proposals: P.proposals.map((p) => ({
        ...p,
        votes: p.votes
          .filter((v) => v.account === 'ana.near' || v.account === 'ben.near')
          .map((v) => ({
            ...v,
            account:
              v.account === 'ana.near'
                ? '0xAAAA000000000000000000000000000000000001'
                : '0xbbbb000000000000000000000000000000000002',
          })),
      })),
    };
    expect(votingBlocs(evm).pairs[0]?.a).toBe(
      'eip155:100:0xaaaa000000000000000000000000000000000001',
    );
  });
});
