// The Snapshot proposals on the shared map given their own text and their page (proposals/v3):
// only summary and link are added; everything else a mapping run wrote stays.
import { validateProposals } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { privateStore } from '../src/drafts.ts';
import { snapshotTexts } from '../src/proposals.ts';
import { rig } from './helpers.ts';

const ID = `0x${'ab'.repeat(32)}`;
const wave = {
  petal: 'proposals/v1',
  about: 'eip155:100:0x177127622c4a00f3d409b75571e12cb3c8973d3c',
  source: {
    kind: 'snapshot',
    contract: 'snapshot:cow.eth',
    ref: 'the wave',
    at: '2026-11-11T00:00:00Z',
  },
  proposals: [
    {
      id: ID,
      title: 'CIP-93',
      kind: 'basic',
      proposer: '0x7cebc2c5bdf597feb0f52142ca7d5bd435254ad4',
      at: '2026-11-06T05:04:22Z',
      closes_at: '2026-11-13T05:04:22Z',
      decided_at: null,
      outcome: 'in progress',
      as_said: 'active',
      ref: `proposal:snapshot:cow.eth:${ID}`,
      votes: [],
    },
  ],
  read_at: '2026-11-11T00:00:00Z',
};

describe('Snapshot texts', () => {
  test("a mapping run's Snapshot proposal gains its own text and its page, where it was made; the rest stays", async () => {
    const r = await rig();
    const store = privateStore(r.ctx.config);
    await store.proposals.put({
      about: wave.about,
      body: JSON.stringify(wave),
      read_at: wave.read_at,
    });
    const asked: unknown[] = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      asked.push(JSON.parse(String(init?.body)).variables.ids);
      return Response.json({
        data: {
          proposals: [
            {
              id: ID,
              body: '  This proposal extends the program.  ',
              link: `https://snapshot.box/#/s:cow.eth/proposal/${ID}`,
            },
          ],
        },
      });
    }) as typeof fetch;
    const done = await snapshotTexts(r.ctx, { fetch: fetchImpl });
    expect(done).toMatchObject({ docs: 1, proposals: 1, found: 1, saved: 1, failed: [] });
    expect(asked).toEqual([[ID]]);
    const kept = JSON.parse((await store.proposals.get(wave.about))?.body ?? '{}');
    expect(validateProposals(kept).ok).toBe(true);
    expect(kept.petal).toBe('proposals/v3');
    expect(kept.source).toEqual(wave.source);
    expect(kept.read_at).toBe(wave.read_at);
    expect(kept.proposals[0]).toEqual({
      ...wave.proposals[0],
      recipient: null,
      summary: 'This proposal extends the program.',
      link: { url: `https://snapshot.box/#/s:cow.eth/proposal/${ID}`, kind: 'where it was made' },
    });
  });

  test('Snapshot not answering leaves every doc as it was', async () => {
    const r = await rig();
    const store = privateStore(r.ctx.config);
    await store.proposals.put({
      about: wave.about,
      body: JSON.stringify(wave),
      read_at: wave.read_at,
    });
    const fetchImpl = (async () => new Response('', { status: 502 })) as typeof fetch;
    const done = await snapshotTexts(r.ctx, { fetch: fetchImpl });
    expect(done).toMatchObject({ saved: 0, found: 0 });
    expect(done.failed).toHaveLength(1);
    expect(JSON.parse((await store.proposals.get(wave.about))?.body ?? '{}')).toEqual(wave);
  });
});
