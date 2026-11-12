// Open calls read keyless (Elco, 12 Nov): Karma's active programs and NEAR's Infrastructure Committee RFPs, as
// calls/v1, every field as the source says it. Stubbed sources: nothing here reads the web.
import { validateCall } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { committeeCalls, forumCalls, karmaCalls, snapshotCalls } from '../src/calls/index.ts';
import type { RpcPool } from '../src/rpc/pool.ts';

const AT = '2026-11-12T12:00:00.000Z';

const program = (over: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) => ({
  programId: '1508',
  type: 'grant',
  name: 'Filecoin ProPGF Kernel 2027',
  isActive: true,
  deadline: null,
  submissionUrl: null,
  communities: [{ name: 'Filecoin' }],
  metadata: {
    title: 'Filecoin ProPGF Kernel 2027',
    shortDescription: 'Kernel track renewals for 2027',
    status: 'Active',
    startsAt: '2026-11-10T00:00:00.000Z',
    endsAt: '2027-01-31T23:59:00.000Z',
    programBudget: '',
    website: '',
    adminEmails: ['someone@example.org'],
    financeEmails: ['money@example.org'],
    ...meta,
  },
  ...over,
});

function karmaSite(pages: unknown[][]) {
  const seen: string[] = [];
  const fetchImpl = (async (url: string) => {
    seen.push(url);
    const page = Number(new URL(url).searchParams.get('page'));
    return new Response(
      JSON.stringify({ programs: pages[page - 1] ?? [], hasNext: page < pages.length }),
      { status: 200 },
    );
  }) as typeof fetch;
  return { seen, fetchImpl };
}

describe("Karma's program registry", () => {
  test("every page of active programs, each a valid calls/v1 with its fields as said and no one's email", async () => {
    const { seen, fetchImpl } = karmaSite([
      [program()],
      [
        program(
          { programId: 7, type: 'vc_fund', submissionUrl: 'https://apply.example/7' },
          { programBudget: '50,000 USDC' },
        ),
      ],
    ]);
    const calls = await karmaCalls(fetchImpl, AT);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toContain('status=active');
    expect(calls.map((c) => validateCall(c).ok)).toEqual([true, true]);
    expect(calls[0]).toMatchObject({
      id: 'karma:1508',
      kind: 'grants',
      offered_by: { name: 'Filecoin', about: null },
      budget: null,
      opens: '2026-11-10T00:00:00.000Z',
      closes: '2027-01-31T23:59:00.000Z',
      status: 'Active',
      // no link of its own: Karma's own page for it
      link: 'https://www.karmahq.org/funding-map?programId=1508',
      how: 'sourced',
    });
    expect(calls[1]).toMatchObject({
      id: 'karma:7',
      kind: 'fund',
      budget: '50,000 USDC',
      link: 'https://apply.example/7',
    });
    expect(JSON.stringify(calls)).not.toContain('@example.org');
  });

  test('a source that answers badly throws, so the calls already kept stay', async () => {
    const down = (async () => new Response('busy', { status: 503 })) as unknown as typeof fetch;
    await expect(karmaCalls(down, AT)).rejects.toThrow(/503/);
  });
});

describe("NEAR's Infrastructure Committee", () => {
  const pool = (rfps: unknown[]) =>
    ({
      view: async (account: string, method: string) => {
        expect([account, method]).toEqual(['infrastructure-committee.near', 'get_rfps']);
        return { value: rfps, block_height: 1, block_hash: 'h', endpoint: {} };
      },
    }) as unknown as RpcPool;
  const rfp = (id: number, status: string) => ({
    id,
    snapshot: {
      name: `RFP ${id}`,
      summary: 'Build it.',
      submission_deadline: '1748476800000000000',
      timeline: { status },
    },
  });

  test('only the RFPs that say they take submissions, the status kept beside a deadline that has passed', async () => {
    const calls = await committeeCalls(
      pool([rfp(7, 'PROPOSAL_SELECTED'), rfp(8, 'ACCEPTING_SUBMISSIONS')]),
      AT,
    );
    expect(calls).toHaveLength(1);
    expect(validateCall(calls[0]).ok).toBe(true);
    expect(calls[0]).toMatchObject({
      id: 'infrastructure-committee.near:8',
      kind: 'rfp',
      status: 'ACCEPTING_SUBMISSIONS',
      closes: '2025-05-29T00:00:00.000Z',
      link: 'https://near.social/infrastructure-committee.near/widget/app?page=rfp&id=8',
    });
  });
});

describe("Snapshot's open votes", () => {
  test('no spaces, no request; an error from the hub throws, so the votes kept stay', async () => {
    let asked = 0;
    const counting = (async () => {
      asked++;
      return new Response(JSON.stringify({ errors: [{ message: 'too many requests' }] }));
    }) as unknown as typeof fetch;
    expect(await snapshotCalls(counting, [], AT)).toEqual([]);
    expect(asked).toBe(0);
    await expect(snapshotCalls(counting, [{ space: 'cow.eth', about: null }], AT)).rejects.toThrow(
      /too many requests/,
    );
  });
});

describe('the forums', () => {
  test('only titles that say RFP, request for proposals or grants program, each inferred with its topic', async () => {
    const forum = (async (url: string) => {
      const q = decodeURIComponent(new URL(url).searchParams.get('q') ?? '');
      const topics = q.startsWith('RFP')
        ? [
            {
              id: 1,
              title: '[RFP] Wallet Selector Maintenance',
              slug: 'rfp-wallet',
              created_at: '2024-04-01T19:33:57.675Z',
            },
            { id: 2, title: 'Monthly report', slug: 'report', created_at: '2024-04-02T00:00:00Z' },
          ]
        : q.startsWith('"grants program"')
          ? [
              {
                id: 3,
                title: 'Gaming DAO Grants Program (May)',
                slug: 'gaming',
                created_at: '2024-04-02T00:00:00Z',
              },
            ]
          : [];
      return new Response(JSON.stringify({ topics }));
    }) as unknown as typeof fetch;
    const calls = await forumCalls(forum, { base: 'https://gov.near.org', name: 'NEAR' }, AT, 0);
    expect(calls.map((c) => [c.id, c.kind, c.how, c.status, c.closes])).toEqual([
      ['gov.near.org:1', 'rfp', 'inferred', null, null],
      ['gov.near.org:3', 'grants', 'inferred', null, null],
    ]);
    expect(calls[0]).toMatchObject({
      link: 'https://gov.near.org/t/rfp-wallet/1',
      evidence: 'https://gov.near.org/t/rfp-wallet/1',
      offered_by: { name: 'NEAR', about: null },
    });
    expect(calls.every((c) => validateCall(c).ok)).toBe(true);
  });
});
