// Petals' open-calls feed (Elco, 12 Nov): read keyless into the store, a source's replaced as a whole, one that
// doesn't answer keeping what it had; served from the store as list_calls, GET /api/v1/calls and its RSS.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RpcPool } from '@petal/inputs';
import { describe, expect, test } from 'vitest';
import { callsOf, readCalls } from '../src/calls.ts';
import { createContext } from '../src/context.ts';
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
    ]);
    expect(await callsOf(ctx)).toEqual([]);
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
