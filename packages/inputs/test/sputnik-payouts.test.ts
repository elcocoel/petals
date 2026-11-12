// A Sputnik DAO's payouts (payouts/v1, 12 Nov): what its passed proposals pay, dated by the DAO's own transfer
// in the transaction that approved each, its bond coming back left out, and priced that day.
import { describe, expect, test } from 'vitest';
import type { RawProposal, SputnikRead } from '../src/modules/sputnik-dao.ts';
import {
  pastPrices,
  plannedPayouts,
  sentByApprovals,
  sentIn,
  sputnikPayouts,
} from '../src/modules/sputnik-payouts.ts';

const DAO = 'build.sputnik-dao.near';
const USDC = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
const b64 = (x: unknown) => Buffer.from(JSON.stringify(x)).toString('base64');
const proposal = (id: number, kind: RawProposal['kind'], status = 'Approved'): RawProposal => ({
  id,
  proposer: 'p.near',
  description: '',
  kind,
  status,
  votes: {},
  submission_time: '1729179239405000000',
});
const read = (proposals: RawProposal[]): SputnikRead => ({
  policy: { roles: [], proposal_period: '0' },
  proposals,
  endpoint: 'test',
});

describe('what passed proposals pay', () => {
  test("a Transfer of NEAR or a token, a FunctionCall's ft_transfer, a BountyDone's bounty; nothing that didn't pass", () => {
    const planned = plannedPayouts(
      read([
        proposal(1, { Transfer: { token_id: '', receiver_id: 'a.near', amount: '5' } }),
        proposal(2, { Transfer: { token_id: USDC, receiver_id: 'b.near', amount: '7' } }),
        proposal(3, {
          FunctionCall: {
            receiver_id: USDC,
            actions: [
              { method_name: 'storage_deposit', args: b64({}), deposit: '1250000000000000000000' },
              {
                method_name: 'ft_transfer',
                args: b64({ receiver_id: 'c.near', amount: '9' }),
                deposit: '1',
              },
            ],
          },
        }),
        proposal(4, { BountyDone: { bounty_id: 0, receiver_id: 'd.near' } }),
        proposal(5, { Transfer: { token_id: '', receiver_id: 'e.near', amount: '5' } }, 'Rejected'),
        proposal(6, { Transfer: { token_id: '', receiver_id: 'f.near', amount: '5' } }, 'Failed'),
        proposal(7, 'Vote'),
      ]),
      new Map([[0, { token: '', amount: '11' }]]),
    );
    expect(planned.map((p) => [p.proposal.id, p.kind, p.to, p.token, p.raw])).toEqual([
      [1, 'Transfer', 'a.near', '', '5'],
      [2, 'Transfer', 'b.near', USDC, '7'],
      [3, 'FunctionCall', 'c.near', USDC, '9'],
      [4, 'BountyDone', 'd.near', '', '11'],
    ]);
  });
});

/** A transaction that approves proposal `id`: the vote, then the DAO's own receipts. */
const approval = (
  id: number,
  sent: Array<{ to: string; action: Record<string, Record<string, unknown>> }>,
) => ({
  transaction: { hash: `tx${id}` },
  receipts: [
    {
      execution_outcome: {
        block_timestamp: 1729180770709000000,
        block_height: 100,
        outcome: { status: { SuccessValue: '' } },
      },
      receipt: {
        predecessor_id: 'voter.near',
        receiver_id: DAO,
        receipt: {
          Action: {
            actions: [
              {
                FunctionCall: {
                  method_name: 'act_proposal',
                  args: b64({ id, action: 'VoteApprove' }),
                },
              },
            ],
          },
        },
      },
    },
    ...sent.map((s) => ({
      execution_outcome: {
        block_timestamp: 1729180771709000000,
        block_height: 101,
        outcome: { status: { SuccessValue: '' } },
      },
      receipt: {
        predecessor_id: DAO,
        receiver_id: s.to,
        receipt: { Action: { actions: [s.action] } },
      },
    })),
  ],
});

describe('when each was paid', () => {
  test("the DAO's own transfers in the transaction that approved a proposal, NEAR and ft_transfer", () => {
    const sent = sentIn(
      approval(2, [
        {
          to: USDC,
          action: {
            FunctionCall: {
              method_name: 'ft_transfer',
              args: b64({ receiver_id: 'b.near', amount: '7' }),
            },
          },
        },
        // the proposal's bond coming back to its proposer
        { to: 'p.near', action: { Transfer: { deposit: '100000000000000000000000' } } },
      ]),
      DAO,
    );
    expect(sent.map((s) => [s.proposal, s.token, s.to, s.raw, s.at, s.tx])).toEqual([
      [2, USDC, 'b.near', '7', '2024-10-17T15:59:31.709Z', 'tx2'],
      [2, '', 'p.near', '100000000000000000000000', '2024-10-17T15:59:31.709Z', 'tx2'],
    ]);
  });

  test("a vote that doesn't approve, or another account's receipts, send nothing", () => {
    const t = approval(2, [{ to: 'x.near', action: { Transfer: { deposit: '5' } } }]);
    const reject = {
      ...t,
      receipts: t.receipts.map((r, i) =>
        i === 0
          ? {
              ...r,
              receipt: {
                ...r.receipt,
                receipt: {
                  Action: {
                    actions: [
                      {
                        FunctionCall: {
                          method_name: 'act_proposal',
                          args: b64({ id: 2, action: 'VoteReject' }),
                        },
                      },
                    ],
                  },
                },
              },
            }
          : r,
      ),
    };
    expect(sentIn(reject, DAO)).toEqual([]);
    expect(sentIn(t, 'other.sputnik-dao.near')).toEqual([]);
  });

  test("FastNEAR's pages, then the transactions where the DAO sent a receipt; asked again after a refusal", async () => {
    const asked: string[] = [];
    let refused = false;
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? '{}'));
      asked.push(`${url.split('/v0/')[1]} ${body.resume_token ?? ''}`);
      if (url.endsWith('/account') && !body.resume_token)
        return new Response(
          JSON.stringify({
            account_txs: [
              { transaction_hash: 'tx2', is_predecessor: true, is_function_call: true },
              { transaction_hash: 'vote', is_predecessor: false, is_function_call: true },
            ],
            resume_token: 'r1',
          }),
        );
      if (url.endsWith('/account')) {
        if (!refused) {
          refused = true;
          return new Response('', { status: 429 });
        }
        return new Response(JSON.stringify({ account_txs: [], resume_token: null }));
      }
      expect(body.tx_hashes).toEqual(['tx2']);
      return new Response(
        JSON.stringify({
          transactions: [approval(2, [{ to: 'b.near', action: { Transfer: { deposit: '5' } } }])],
        }),
      );
    }) as typeof fetch;
    const r = await sentByApprovals(fetchImpl, DAO, () => {}, [0]);
    expect(r).toMatchObject({ txs: 2, read: 1, failed: [] });
    expect(r.sent).toHaveLength(1);
    expect(asked).toEqual(['account ', 'account r1', 'account r1', 'transactions ']);
  });
});

describe('payouts/v1', () => {
  test('each payout matched to its own transfer, the bond left out; one with no transfer found has no date and no dollars', async () => {
    const planned = plannedPayouts(
      read([
        proposal(2, { Transfer: { token_id: USDC, receiver_id: 'b.near', amount: '7000000' } }),
        proposal(3, {
          Transfer: { token_id: '', receiver_id: 'c.near', amount: '2000000000000000000000000' },
        }),
      ]),
      new Map(),
    );
    const sent = sentIn(
      approval(2, [
        {
          to: USDC,
          action: {
            FunctionCall: {
              method_name: 'ft_transfer',
              args: b64({ receiver_id: 'b.near', amount: '7000000' }),
            },
          },
        },
        { to: 'p.near', action: { Transfer: { deposit: '100000000000000000000000' } } },
      ]),
      DAO,
    );
    const doc = sputnikPayouts({
      about: `near:mainnet:${DAO}`,
      dao: DAO,
      planned,
      sent,
      facts: new Map([
        ['', { symbol: 'NEAR', decimals: 24 }],
        [USDC, { symbol: 'USDC', decimals: 6 }],
      ]),
      priceOf: (token) =>
        token === USDC ? { price: 0.9999, at: '2024-10-17T15:59:00.000Z', ref: 'test' } : null,
      at: { block_height: 1, as_of: '2026-11-12T00:00:00.000Z' },
      ref: 'test',
      readAt: '2026-11-12T00:00:00.000Z',
    });
    expect(doc.payouts).toHaveLength(2);
    expect(doc.payouts[0]).toMatchObject({
      to: 'near:mainnet:b.near',
      asset: { id: `near:mainnet:${USDC}`, symbol: 'USDC', decimals: 6 },
      amount: '7',
      when: '2024-10-17T15:59:31.709Z',
      usd: { usd: '7.00', source: 'defillama' },
      evidence: { tx: 'tx2', block: 101 },
    });
    expect(doc.payouts[1]).toMatchObject({ amount: '2', when: null, usd: null, evidence: null });
  });

  test('DefiLlama asked again after a refusal', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) return new Response('', { status: 429 });
      return new Response(
        JSON.stringify({
          coins: { 'coingecko:near': { prices: [{ timestamp: 1000, price: 5 }] } },
        }),
      );
    }) as typeof fetch;
    const at = new Date(1000 * 1000).toISOString();
    const p = await pastPrices(fetchImpl, [{ token: '', at }], [0]);
    expect(calls).toBe(2);
    expect(p.priceOf('', at)?.price).toBe(5);
    expect(p.failed).toEqual([]);
  });

  test("DefiLlama's price nearest each moment, within six hours, or none", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          coins: {
            'coingecko:near': {
              prices: [
                { timestamp: 1000, price: 5 },
                { timestamp: 1000 + 7 * 3600, price: 6 },
              ],
            },
          },
        }),
      )) as typeof fetch;
    const p = await pastPrices(fetchImpl, [
      { token: '', at: new Date(1100 * 1000).toISOString() },
      { token: '', at: new Date((1000 + 3.4 * 3600) * 1000).toISOString() },
    ]);
    expect(p.priceOf('', new Date(1100 * 1000).toISOString())?.price).toBe(5);
    expect(p.priceOf('', new Date((1000 + 3.4 * 3600) * 1000).toISOString())?.price).toBe(5);
    expect(p.priceOf(USDC, new Date(1100 * 1000).toISOString())).toBeNull();
  });
});
