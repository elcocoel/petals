// What a DAO map paid out (payouts/v1, 12 Nov): list_payouts and GET /api/v1/maps/:id/payouts over a period.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeEach, describe, expect, test } from 'vitest';
import { privateStore } from '../src/drafts.ts';
import { httpApp } from '../src/http/app.ts';
import { callTool } from '../src/registry.ts';
import { rig, type TestRig } from './helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Out = Record<string, any>;

const paid = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '..', '..', 'core', 'schema', 'fixtures', 'payouts.v1.json'),
    'utf8',
  ),
);

let r: TestRig;
beforeEach(async () => {
  r = await rig();
  await privateStore(r.ctx.config).payouts.put({
    about: paid.about,
    body: JSON.stringify(paid),
    read_at: paid.read_at,
  });
});

describe('payouts', () => {
  test("list_payouts: a period's payouts by when each was paid, and their totals", async () => {
    const all = (await callTool('list_payouts', { map: paid.about }, r.ctx)) as Out;
    expect(all.totals).toMatchObject({ count: 3, recipients: 3, priced: 3, unpriced: 0 });
    expect(all.totals.assets).toEqual([
      expect.objectContaining({
        asset: expect.objectContaining({ symbol: 'USDC' }),
        amount: '11500',
        count: 3,
      }),
    ]);
    const dec = (await callTool(
      'list_payouts',
      { map: paid.about, since: '2024-12-01T00:00:00.000Z', until: '2025-01-01T00:00:00.000Z' },
      r.ctx,
    )) as Out;
    expect(dec.payouts.map((p: Out) => p.proposal.id)).toEqual(['386', '387']);
    expect(dec.period).toEqual({
      since: '2024-12-01T00:00:00.000Z',
      until: '2025-01-01T00:00:00.000Z',
    });
    const none = (await callTool('list_payouts', { map: 'near:mainnet:none.near' }, r.ctx)) as Out;
    expect(none.error.code).toBe('not_found');
  });

  test('GET /api/v1/maps/:id/payouts: the same, with since and until as ISO times', async () => {
    const app = new Hono();
    app.route(
      '/',
      httpApp(r.ctx, { gate: { subjectOf: async () => null, refuseForeign: () => null } }),
    );
    const at = (q: string) =>
      app.request(`/api/v1/maps/${encodeURIComponent(paid.about)}/payouts${q}`);
    const res = await at('?since=2024-12-01T00:00:00Z');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Out;
    expect(body).toMatchObject({ about: paid.about, totals: { count: 2 }, undated: 0 });
    expect((await at('?since=nope')).status).toBe(400);
    expect(
      (await app.request(`/api/v1/maps/${encodeURIComponent('near:mainnet:none.near')}/payouts`))
        .status,
    ).toBe(404);
  });
});
