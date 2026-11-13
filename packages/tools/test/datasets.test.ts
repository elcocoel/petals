// Layers kept on the site, and a dataset's versions (005, data.md: anyone can add, fork and use
// a prior layer, private first). Over HTTP, through the project's link, as the pasted file and curl call them.
import { Hono } from 'hono';
import { beforeEach, describe, expect, test } from 'vitest';
import { httpApp } from '../src/http/app.ts';
import { rig, type TestRig } from './helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Out = Record<string, any>;

let r: TestRig;
beforeEach(async () => {
  r = await rig();
});

const ABOUT = 'eip155:100:0x10e31c10fb0b3f56a9e7fd0b0a3d17a1be0ac9c1';
const layer = (measure: string, values: [string, string][]) => ({
  petal: 'layer/v1',
  about: ABOUT,
  kind: 'measures',
  measures: [{ name: measure, unit: 'proposals', kind: 'count' }],
  rows: values.map(([participant, value]) => ({ participant, measure, value })),
  how: { method: 'counted the events by who sent them', sources: [{ url: 'https://rpc.example' }] },
  from: [],
  when: { as_of: '2026-11-09T00:00:00Z' },
  standing: 'verified',
});

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
const send = async (app: Hono, method: string, path: string, json?: unknown, subject?: string) => {
  const res = await app.request(path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(subject ? { 'x-test-subject': subject } : {}),
    },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });
  return { status: res.status, body: (await res.json()) as Out };
};

/** A project its owner started, with a continue link and a read link. */
async function project() {
  const app = door();
  const id = (await send(app, 'POST', '/api/v1/explorations', { question: 'who?' }, 'prs_a')).body
    .exploration as string;
  const token = async (scope: string) =>
    (
      (await send(app, 'POST', `/api/v1/explorations/${id}/links`, { scope }, 'prs_a')).body
        .url as string
    )
      .split('/')
      .pop() as string;
  return { app, id, cont: await token('continue'), read: await token('read') };
}

describe('layers on the site', () => {
  test('kept once under the project’s owner, each one a new version after the last', async () => {
    const { app, cont, read } = await project();
    const written = layer('proposals_written', [['0xaa', '3']]);
    const first = await send(app, 'POST', `/api/v1/explorations/${cont}/layers`, {
      layer: written,
    });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      about: ABOUT,
      existed: false,
      version: { seq: 0, parent: null },
    });
    const again = await send(app, 'POST', `/api/v1/explorations/${cont}/layers`, {
      layer: written,
    });
    expect(again.body).toMatchObject({ existed: true, version: { id: first.body.version.id } });

    const voted = layer('votes_cast', [['0xaa', '9']]);
    const second = await send(app, 'POST', `/api/v1/explorations/${cont}/layers`, { layer: voted });
    expect(second.body.version).toMatchObject({
      seq: 1,
      parent: first.body.version.id,
      layers: [first.body.hash, second.body.hash],
    });

    // any link reads them; a read link can't keep one
    const listed = (await send(app, 'GET', `/api/v1/explorations/${read}/layers?about=${ABOUT}`))
      .body;
    expect(listed.layers.map((l: Out) => l.hash)).toEqual([first.body.hash, second.body.hash]);
    expect(listed.layers[0]).toMatchObject({ standing: 'verified', rows: 1 });
    // who made it, outside the hash: the link it came by, the time, the brain version, no recipe
    expect(listed.layers[0].by).toMatchObject({
      author: expect.stringMatching(/^link:/),
      brain: expect.stringMatching(/^[0-9a-f]{16}@([0-9a-f]{12}|unknown)$/),
      recipe: null,
    });
    expect(listed.versions.map((v: Out) => v.seq)).toEqual([0, 1]);
    const whole = (
      await send(app, 'GET', `/api/v1/explorations/${read}/layers?hash=${first.body.hash}`)
    ).body;
    expect(whole.layer.measures[0].name).toBe('proposals_written');
    expect(whole.by.author).toMatch(/^link:/);
    const refused = await send(app, 'POST', `/api/v1/explorations/${read}/layers`, {
      layer: voted,
    });
    expect(refused.status).toBe(401);
  });

  test('a fork drops or adds layers, names its parent, and leaves the parent as it was', async () => {
    const { app, cont } = await project();
    const a = (
      await send(app, 'POST', `/api/v1/explorations/${cont}/layers`, {
        layer: layer('a_count', [['0xaa', '1']]),
      })
    ).body;
    const b = (
      await send(app, 'POST', `/api/v1/explorations/${cont}/layers`, {
        layer: layer('b_count', [['0xaa', '2']]),
      })
    ).body;
    const fork = await send(app, 'POST', `/api/v1/explorations/${cont}/datasets/fork`, {
      version: b.version.id,
      drop: [a.hash],
    });
    expect(fork.status).toBe(200);
    expect(fork.body.version).toMatchObject({ parent: b.version.id, layers: [b.hash], seq: 2 });
    const versions = (await send(app, 'GET', `/api/v1/explorations/${cont}/layers`)).body.versions;
    expect(versions.find((v: Out) => v.id === b.version.id).layers).toEqual([a.hash, b.hash]);
    const back = await send(app, 'POST', `/api/v1/explorations/${cont}/datasets/fork`, {
      version: fork.body.version.id,
      add: [a.hash],
    });
    expect(back.body.version.layers).toEqual([b.hash, a.hash]);
  });

  test('another owner’s version, or a layer this project doesn’t keep, is refused', async () => {
    const mine = await project();
    const v = (
      await send(mine.app, 'POST', `/api/v1/explorations/${mine.cont}/layers`, {
        layer: layer('a_count', [['0xaa', '1']]),
      })
    ).body.version;
    const app = mine.app;
    const theirs = (await send(app, 'POST', '/api/v1/explorations', { question: 'mine' }, 'prs_b'))
      .body.exploration;
    const forked = await send(
      app,
      'POST',
      `/api/v1/explorations/${theirs}/datasets/fork`,
      { version: v.id },
      'prs_b',
    );
    expect(forked.status).toBe(404);
    const unknown = await send(app, 'POST', `/api/v1/explorations/${mine.cont}/datasets/fork`, {
      version: v.id,
      add: ['c'.repeat(64)],
    });
    expect(unknown.status).toBe(404);
  });

  test('a project nobody owns holds its layers until it is claimed, and they move with it', async () => {
    const app = door();
    const started = (await send(app, 'POST', '/api/v1/explorations', { question: 'unowned' })).body;
    const link = (started.link.url as string).split('/').pop() as string;
    const kept = (
      await send(app, 'POST', `/api/v1/explorations/${link}/layers`, {
        layer: layer('a_count', [['0xaa', '1']]),
      })
    ).body;
    expect(kept.version.seq).toBe(0);
    const claimed = await send(app, 'POST', `/api/v1/explorations/${link}/claim`, {}, 'prs_c');
    expect(claimed.body.claimed).toBe(true);
    const listed = (
      await send(
        app,
        'GET',
        `/api/v1/explorations/${started.exploration}/layers`,
        undefined,
        'prs_c',
      )
    ).body;
    expect(listed.layers.map((l: Out) => l.hash)).toEqual([kept.hash]);
    expect(listed.versions.map((v: Out) => v.id)).toEqual([kept.version.id]);
  });

  test('something that isn’t a layer is refused, and nothing is kept', async () => {
    const { app, cont } = await project();
    const bad = await send(app, 'POST', `/api/v1/explorations/${cont}/layers`, {
      layer: { petal: 'layer/v1' },
    });
    expect(bad.status).toBe(400);
    expect((await send(app, 'GET', `/api/v1/explorations/${cont}/layers`)).body.layers).toEqual([]);
  });
});
