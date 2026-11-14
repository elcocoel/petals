// Each petal's vesting reaches every drawing of its map (vesting.ts, a vesting reader for any token): a vesting/v1
// loaded as Petals' mapping, by its map's address, cuts the petals that hold its
// allocations, in the map's views (pieces, given) and in render_flower. Offline.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Vesting } from '@petal/core';
import { modules } from '@petal/inputs';
import { beforeEach, describe, expect, test } from 'vitest';
import { privateStore } from '../src/drafts.ts';
import { mapViews } from '../src/map.ts';
import { loadMapping } from '../src/mapping-load.ts';
import { callTool } from '../src/registry.ts';
import { loadSnapshot } from '../src/tools/shared.ts';
import { vestingOf } from '../src/vesting.ts';
import { rig, type TestRig } from './helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Out = Record<string, any>;

const MOLOCH = 'c46437a2afb76cc7c3b07195da499a80a93bd3f09f2ce342436a366c68009a9c';
const MAP = 'eip155:1:0x1fd169a4f5c59acf79d0fd5d91d1201ef1bce9f1';

let r: TestRig;
const run = async (name: string, input: unknown) => (await callTool(name, input, r.ctx)) as Out;

beforeEach(async () => {
  r = await rig();
  r.ctx.modules = {
    ...r.ctx.modules,
    'moloch-v1': modules['moloch-v1'] as NonNullable<(typeof modules)[string]>,
  };
  const proposed = await run('propose_spec', { network: 'moloch-v1', sha256: MOLOCH });
  const drawn = await run('render_flower', { spec: proposed.spec });
  // on the shared map, as Petals' loads put a view there
  await privateStore(r.ctx.config).draft.label(drawn.spec_sha256 as string, {
    name: null,
    made_by: 'mapping.petals.near',
  });
});

/** One allocation held by the reading's largest petal: a cliff a year before the reading, then monthly steps. */
async function vestingFor(): Promise<{ v: Vesting; holder: string; holds: string }> {
  const s = await loadSnapshot(r.ctx, MOLOCH);
  const top = [...s.holdings]
    .filter((h) => h.measure === s.coverage.measure)
    .sort((a, b) => Number(b.amount) - Number(a.amount))[0];
  if (!top) throw new Error('no holdings');
  const as_of = Date.parse(s.snapshot.as_of);
  const iso = (days: number) => new Date(as_of + days * 86_400_000).toISOString();
  // half at a cliff a year before the reading, half in 24 monthly (30-day) steps from then: 12 passed by the reading
  const half = (Number(top.amount) / 2).toString();
  return {
    holder: top.participant,
    holds: top.amount,
    v: {
      petal: 'vesting/v1',
      about: MAP,
      token: { id: MAP, symbol: null, decimals: 0 },
      allocations: [
        {
          name: 'Founders',
          holder: `eip155:1:${top.participant}`,
          beneficiary: null,
          total: top.amount,
          schedule: [
            { at: iso(-365), amount: half },
            { from: iso(-365), to: iso(-365 + 720), every: 30 * 86_400, amount: half },
          ],
          released: null,
          known: 'verified',
          how: 'a test',
          evidence: [],
        },
      ],
      read_at: '2026-11-12T00:00:00.000Z',
    },
  };
}

describe("each petal's vesting reaches every drawing of its map", () => {
  test('none before any was read; loaded as Petals’ mapping, the holder is cut and Tools offers the pieces', async () => {
    const s = await loadSnapshot(r.ctx, MOLOCH);
    expect(await vestingOf(r.ctx, s)).toEqual([]);
    const names = async () => (await mapViews(r.ctx))[0]?.pieces.map((p) => p.name) ?? [];
    expect(await names()).not.toContain('vesting');

    const { v, holder, holds } = await vestingFor();
    const root = mkdtempSync(join(tmpdir(), 'petal-vesting-'));
    mkdirSync(join(root, 'ethereum'), { recursive: true });
    writeFileSync(join(root, 'ethereum', 'vesting.json'), JSON.stringify(v));
    const dry = await loadMapping(r.ctx, root, { by: 'mapping.petals.near', dry: true });
    expect(dry.formats.vesting).toEqual({ good: 1, kept: 0, left: 0 });
    expect(await privateStore(r.ctx.config).vesting.get(MAP)).toBeFalsy();
    const done = await loadMapping(r.ctx, root, { by: 'mapping.petals.near' });
    expect(done.formats.vesting).toEqual({ good: 1, kept: 1, left: 0 });

    const pieces = await vestingOf(r.ctx, s);
    expect(pieces.map((p) => p.name)).toEqual(['vesting', 'next_unlock', 'tranche']);
    const parts = pieces[0] as { parts: { participant: string; part: string; value: string }[] };
    expect(parts.parts.map((p) => p.part)).toEqual(['unlocked', 'next unlock', 'later']);
    expect(parts.parts.every((p) => p.participant === holder)).toBe(true);
    const sum = parts.parts.reduce((n, p) => n + Number(p.value), 0);
    expect(sum).toBeCloseTo(Number(holds), 6);
    expect(await names()).toEqual(expect.arrayContaining(['vesting', 'next_unlock', 'tranche']));

    // given with the view, for the drawn petals only (redrawn at once)
    const [view] = await mapViews(r.ctx);
    if (!view) throw new Error('no view on the map');
    const given = view.given.find((p) => p.name === 'vesting') as {
      parts: { participant: string }[];
    };
    expect(given.parts.map((p) => p.participant)).toEqual([holder, holder, holder]);

    // render_flower takes them too: a view that cuts petals by vesting draws the holder's bands
    const proposed = await run('propose_spec', { network: 'moloch-v1', sha256: MOLOCH });
    const drawn = await run('render_flower', {
      spec: proposed.spec,
      include_reading: true,
      view: {
        petal: 'view/v2',
        dimensions: {
          height: { data: 'share', scale: 'linear' },
          width: null,
          order: { data: 'share' },
          colour: { data: 'kind' },
          outline: null,
          texture: null,
          markings: null,
          segments: { data: 'vesting' },
          lines: null,
          labels: { data: 'identity' },
        },
      },
    });
    expect(drawn.error).toBeUndefined();
  });
});
