// A person's names on the petals drawn for them (the server's side): POST
// /api/v1/render and the map's readings compose the signed-in person's named annotations (core's namePieces),
// a visitor's carry none, and nothing that carries a person's is kept by a cache. The name is invented.
import {
  accountRef,
  canonicalJson,
  DEFAULT_VIEW,
  makeClaim,
  readFlower,
  viewHash,
} from '@petal/core';
import { Hono } from 'hono';
import { beforeEach, describe, expect, test } from 'vitest';
import { privateStore } from '../src/drafts.ts';
import { httpApp } from '../src/http/app.ts';
import { mapViews } from '../src/map.ts';
import { findTool } from '../src/registry.ts';
import { loadSnapshot } from '../src/tools/shared.ts';
import { rig, type TestRig } from './helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Out = Record<string, any>;

let r: TestRig;
beforeEach(async () => {
  r = await rig();
});

const NAMES_ON = {
  ...DEFAULT_VIEW,
  dimensions: { ...DEFAULT_VIEW.dimensions, labels: { data: 'name' } },
};
const run = async (name: string, input: unknown) =>
  (await findTool(name)?.run(input, r.ctx)) as Out;

/** A flower of the validators, and a name the person keeps for its biggest petal. */
async function flowerAndName() {
  const snap = await run('get_snapshot', { network: 'near-validators' });
  const proposed = await run('propose_spec', {
    network: 'near-validators',
    sha256: snap.sha256,
    choices: { measure: 'validator_stake_current_epoch' },
  });
  const snapshot = await loadSnapshot(r.ctx, snap.sha256 as string);
  // the biggest petal, which is drawn as its own, not folded into the tail
  const pool = readFlower(proposed.spec, snapshot).petals[0]?.id as string;
  const named = makeClaim(
    {
      subject: accountRef('near:mainnet', pool) as string,
      verb: 'named',
      object: { value: 'Ada Pool' },
      issued_at: '2026-11-11T12:00:00Z',
      kind: 'stated',
      evidence: [],
      by: 'near:mainnet:alice.near',
    },
    'claim/v2',
  );
  await privateStore(r.ctx.config).annotation.add([
    {
      owner: 'prs_a',
      id: named.id,
      exploration: '',
      subject: named.subject,
      verb: named.verb,
      kind: named.kind,
      body: JSON.stringify(named),
      credential: null,
      created_at: named.issued_at,
      place: 0,
    },
  ]);
  return { spec: proposed.spec, named };
}

function door() {
  const app = new Hono();
  app.route(
    '/',
    httpApp(r.ctx, {
      gate: {
        subjectOf: async (c) => c.req.header('x-test-subject') ?? null,
        refuseForeign: () => null,
      },
    }),
  );
  return app;
}
const render = (app: Hono, spec: unknown, subject?: string) =>
  app.request('/api/v1/render', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(subject ? { 'x-test-subject': subject } : {}),
    },
    body: JSON.stringify({ spec, view: NAMES_ON }),
  });

describe("a person's names on the petals drawn for them", () => {
  test('the signed-in person sees their name on its petal; a visitor, and anyone else, sees none', async () => {
    const { spec } = await flowerAndName();
    const app = door();
    const theirs = await render(app, spec, 'prs_a');
    expect(theirs.status).toBe(200);
    expect(((await theirs.json()) as Out).svg).toContain('Ada Pool');
    expect(theirs.headers.get('cache-control')).toBe('private, no-store');
    for (const who of [undefined, 'prs_b']) {
      const res = await render(app, spec, who);
      expect(((await res.json()) as Out).svg).not.toContain('Ada Pool');
      expect(res.headers.get('cache-control')).not.toBe('private, no-store');
    }
  });

  test("a tile is the person's when its address names their set: drawn with it for them, kept by no cache", async () => {
    const { spec, named } = await flowerAndName();
    await run('render_flower', { spec });
    // the person's view, kept as a person's is when they set it, so its picture can name it by hash
    await privateStore(r.ctx.config).viewDoc.put(
      viewHash(NAMES_ON),
      canonicalJson(NAMES_ON),
      '2026-11-11T12:00:00Z',
    );
    const app = door();
    const [mine] = await mapViews({ ...r.ctx, names: [named] }, NAMES_ON);
    const [public_] = await mapViews(r.ctx, NAMES_ON);
    const path = (url: string) => url.slice(url.indexOf('/api/v1/'));
    expect(mine?.picture).toMatch(/&names=[0-9a-f]{64}$/);
    expect(public_?.picture).not.toContain('names=');
    const get = (url: string, subject?: string) =>
      app.request(path(url), { headers: subject ? { 'x-test-subject': subject } : {} });
    const theirs = await get(mine?.picture as string, 'prs_a');
    expect(await theirs.text()).toContain('Ada Pool');
    expect(theirs.headers.get('cache-control')).toBe('private, no-store');
    // the same address for anyone else draws no names, and isn't kept either
    for (const who of [undefined, 'prs_b']) {
      const res = await get(mine?.picture as string, who);
      expect(await res.text()).not.toContain('Ada Pool');
      expect(res.headers.get('cache-control')).toBe('private, no-store');
    }
    // the public tile stays the public one, kept a year
    const plain = await get(public_?.picture as string, 'prs_a');
    expect(await plain.text()).not.toContain('Ada Pool');
    expect(plain.headers.get('cache-control')).toMatch(/immutable/);
  });

  test("the map's readings carry the person's names, kept apart from a visitor's", async () => {
    const { spec, named } = await flowerAndName();
    // drawn once, so it's on the map
    await run('render_flower', { spec });
    const visitor = JSON.stringify(await mapViews(r.ctx, NAMES_ON));
    const person = JSON.stringify(await mapViews({ ...r.ctx, names: [named] }, NAMES_ON));
    expect(person).toContain('Ada Pool');
    expect(visitor).not.toContain('Ada Pool');
    // and the visitor's, read after the person's, is still the visitor's
    expect(JSON.stringify(await mapViews(r.ctx, NAMES_ON))).not.toContain('Ada Pool');
  });
});
