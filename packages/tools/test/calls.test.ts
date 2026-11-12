// Petals' open-calls feed (Elco, 12 Nov): read keyless into the store, a source's replaced as a whole, one that
// doesn't answer keeping what it had; served from the store as list_calls, GET /api/v1/calls and its RSS.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RpcPool } from '@petal/inputs';
import { describe, expect, test } from 'vitest';
import { callsOf, readCalls } from '../src/calls.ts';
import { createContext } from '../src/context.ts';
import { privateStore } from '../src/drafts.ts';
import { httpApp } from '../src/http/app.ts';

const REPO = join(import.meta.dirname, '..', '..', '..');
const NOW = new Date('2026-11-12T12:00:00.000Z');

function setup() {
  const stateDir = mkdtempSync(join(tmpdir(), 'petal-calls-'));
  return createContext({ root: REPO, stateDir, map: null, llmDailyUsd: 0, fake: true });
}

const karma = (programs: unknown[], status = 200) =>
  (async () =>
    new Response(JSON.stringify({ programs, hasNext: false }), {
      status,
    })) as unknown as typeof fetch;
const program = (id: string, type: string, endsAt: string | null, title = `Program ${id}`) => ({
  programId: id,
  type,
  name: title,
  isActive: true,
  communities: [{ name: 'Arbitrum' }],
  metadata: { title, status: 'Active', endsAt },
});
const committee = (ok = true) =>
  ({
    view: async () => {
      if (!ok) throw new Error('no endpoint answered');
      return {
        value: [
          {
            id: 8,
            snapshot: {
              name: 'Chain Abstracted Relayer RFP',
              summary: 'Build a relayer & its SDK',
              submission_deadline: '1748476800000000000',
              timeline: { status: 'ACCEPTING_SUBMISSIONS' },
            },
          },
        ],
      };
    },
  }) as unknown as RpcPool;

describe('reading the open calls', () => {
  test('each source kept as a whole; one that does not answer keeps what it had', async () => {
    const ctx = setup();
    await readCalls(ctx, {
      save: true,
      fetch: karma([
        program('1', 'grant', '2027-01-31T00:00:00.000Z'),
        program('2', 'bounty', null),
      ]),
      pool: committee(),
      now: () => NOW,
    });
    expect((await callsOf(ctx)).map((c) => c.id)).toEqual([
      'infrastructure-committee.near:8',
      'karma:1',
      'karma:2',
    ]);
    // read again: Karma no longer lists program 2, and the committee doesn't answer
    const r = await readCalls(ctx, {
      save: true,
      fetch: karma([program('1', 'grant', '2027-01-31T00:00:00.000Z')]),
      pool: committee(false),
      now: () => NOW,
    });
    expect(r.sources).toEqual([
      { name: 'karma', calls: 1, kept: true, failed: null },
      {
        name: 'infrastructure-committee.near',
        calls: 0,
        kept: false,
        failed: 'no endpoint answered',
      },
      { name: 'snapshot', calls: 0, kept: true, failed: null },
    ]);
    expect((await callsOf(ctx)).map((c) => c.id)).toEqual([
      'infrastructure-committee.near:8',
      'karma:1',
    ]);
  });

  test('--dry reads and keeps nothing', async () => {
    const ctx = setup();
    const r = await readCalls(ctx, {
      save: false,
      fetch: karma([program('1', 'grant', null)]),
      pool: committee(),
    });
    expect(r.sources.map((s) => [s.name, s.calls, s.kept])).toEqual([
      ['karma', 1, false],
      ['infrastructure-committee.near', 1, false],
      ['snapshot', 0, false],
    ]);
    expect(await callsOf(ctx)).toEqual([]);
  });
});

describe("Snapshot's open votes, for the DAOs Petals maps", () => {
  test("a vote open in a map's Snapshot space is a call to its voters, tied to the map", async () => {
    const ctx = setup();
    const fixture = JSON.parse(
      readFileSync(
        join(REPO, 'packages', 'core', 'schema', 'fixtures', 'proposals.v2.json'),
        'utf8',
      ),
    );
    const about = 'eip155:100:0x177127622c4a00f3d409b75571e12cb3c8973d3c';
    await privateStore(ctx.config).proposals.put({
      about,
      body: JSON.stringify({
        ...fixture,
        about,
        source: { ...fixture.source, kind: 'snapshot', contract: 'snapshot:cow.eth' },
      }),
      read_at: NOW.toISOString(),
    });
    const asked: string[] = [];
    const sources = (async (url: string) => {
      asked.push(url);
      if (url.startsWith('https://hub.snapshot.org/graphql'))
        return new Response(
          JSON.stringify({
            data: {
              proposals: [
                {
                  id: '0x42e5',
                  title: 'CIP-93: CoW Swap Affiliate Program Extension',
                  start: 1793941462,
                  end: 1794546262,
                  state: 'active',
                  link: 'https://snapshot.box/#/s:cow.eth/proposal/0x42e5',
                  space: { id: 'cow.eth', name: 'CoW DAO' },
                },
              ],
            },
          }),
        );
      return new Response(JSON.stringify({ programs: [], hasNext: false }));
    }) as unknown as typeof fetch;
    await readCalls(ctx, { save: true, fetch: sources, pool: committee(), now: () => NOW });
    expect(decodeURIComponent(asked.find((u) => u.includes('snapshot')) ?? '')).toContain(
      'space_in: ["cow.eth"]',
    );
    const vote = (await callsOf(ctx)).find((c) => c.kind === 'vote');
    expect(vote).toMatchObject({
      id: 'snapshot:0x42e5',
      offered_by: { name: 'CoW DAO', about },
      status: 'active',
      closes: new Date(1794546262 * 1000).toISOString(),
      link: 'https://snapshot.box/#/s:cow.eth/proposal/0x42e5',
    });
  });
});

describe('serving them', () => {
  async function served() {
    const ctx = setup();
    await readCalls(ctx, {
      save: true,
      fetch: karma([
        program('1', 'grant', '2027-01-31T00:00:00.000Z', 'Arbitrum Audit Program'),
        program('2', 'hackathon', '2026-12-01T00:00:00.000Z', 'Gnosis Builders Hackathon'),
      ]),
      pool: committee(),
      now: () => NOW,
    });
    return httpApp(ctx);
  }

  test('GET /api/v1/calls: closing soonest first, filtered by kind, words and a deadline', async () => {
    const app = await served();
    const ids = async (q = '') =>
      (
        (await (await app.request(`/api/v1/calls${q}`)).json()) as { calls: { id: string }[] }
      ).calls.map((c) => c.id);
    expect(await ids()).toEqual(['infrastructure-committee.near:8', 'karma:2', 'karma:1']);
    expect(await ids('?kind=hackathon')).toEqual(['karma:2']);
    expect(await ids('?q=audit')).toEqual(['karma:1']);
    expect(await ids('?closes_before=2026-01-01T00:00:00.000Z')).toEqual([
      'infrastructure-committee.near:8',
    ]);
    expect((await app.request('/api/v1/calls?kind=job')).status).toBe(400);
  });

  test('GET /api/v1/calls.rss: the same calls as RSS 2.0, each with its link, and the filters in its own address', async () => {
    const app = await served();
    const res = await app.request('/api/v1/calls.rss?kind=rfp');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/rss+xml');
    const rss = await res.text();
    expect(rss).toContain('<rss version="2.0"');
    expect(rss).toContain('<title>Chain Abstracted Relayer RFP</title>');
    expect(rss).toContain(
      '<link>https://near.social/infrastructure-committee.near/widget/app?page=rfp&amp;id=8</link>',
    );
    // a deadline that has passed stays beside the status the source gives
    expect(rss).toContain(
      'Build a relayer &amp; its SDK Offered by NEAR Infrastructure Committee. Closes 2025-05-29. Status: ACCEPTING_SUBMISSIONS.',
    );
    expect(rss).not.toContain('Arbitrum Audit Program');
    expect(rss).toMatch(/<atom:link href="[^"]*\/api\/v1\/calls\.rss\?kind=rfp" rel="self"/);
  });
});
