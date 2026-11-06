// T201: which flower stands on the canvas before the conversation has one, and that nothing throws.
import type { ToolError } from '@petal/core/types';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const answers = vi.hoisted(() => ({
  get: new Map<string, unknown>(),
  posts: [] as { path: string; body: unknown }[],
  post: (() => undefined) as (path: string, body: unknown) => unknown,
}));

const failed = { ok: false, status: 500, error: { code: 'internal', message: 'x' } } as {
  ok: false;
  status: number;
  error: ToolError['error'];
};

vi.mock('../lib/api.ts', () => ({
  api: async (path: string) => {
    const value = answers.get.get(path);
    if (value instanceof Error) throw value;
    return value === undefined ? failed : { ok: true, value };
  },
  post: async (path: string, body: unknown) => {
    answers.posts.push({ path, body });
    const value = answers.post(path, body);
    if (value instanceof Error) throw value;
    return value === undefined ? failed : { ok: true, value };
  },
}));

/** A server just started: nothing kept. */
const fresh = async () => {
  vi.resetModules();
  return (await import('../lib/workspace-home.ts')).workspaceHome;
};

const row = (id: string, where: 'map' | 'fixture' = 'fixture') => ({
  id,
  title: `Flower ${id}`,
  network: 'near-validators',
  as_of: '2026-11-03T19:42:00Z',
  maker: null,
  published_at: null,
  where,
});
const spec = { petal: 'spec/v1' };
const reading = { title: 'NEAR validators', petals: [{ id: 'a' }], extra: 'not for the browser' };

function serve(flowers: unknown) {
  answers.get.set('/api/v1/health', { ok: true, llm: 'up' });
  answers.get.set('/api/v1/flowers', flowers);
  answers.get.set('/api/v1/flowers/first', { entry: { spec, spec_sha256: 'sha-first' } });
  answers.post = () => ({ reading });
}

beforeEach(() => {
  answers.get.clear();
  answers.posts.length = 0;
});

describe('the stand-in', () => {
  test('is the first flower listed, its reading through render, keyed by its spec', async () => {
    serve({ flowers: [row('first'), row('second')] });
    const home = await (await fresh())({});
    expect(answers.posts).toEqual([
      { path: '/api/v1/render', body: { spec, include_reading: true } },
    ]);
    expect(home.standIn).toEqual({
      key: 'sha-first',
      reading: { title: reading.title, petals: reading.petals },
      stored: 'first',
    });
  });

  test('is read once, since a page load shares its limit with every other', async () => {
    serve({ flowers: [row('first')] });
    const workspaceHome = await fresh();
    const one = await workspaceHome({});
    const two = await workspaceHome({});
    expect(answers.posts).toHaveLength(1);
    expect(two.standIn).toEqual(one.standIn);
  });

  test('a failure isn’t kept: the next page load tries again', async () => {
    serve({ flowers: [row('first')] });
    answers.post = () => undefined;
    const workspaceHome = await fresh();
    expect((await workspaceHome({})).standIn).toBeNull();
    answers.post = () => ({ reading });
    expect((await workspaceHome({})).standIn?.key).toBe('sha-first');
  });

  test('another flower at the top of the list is another stand-in', async () => {
    serve({ flowers: [row('first')] });
    const workspaceHome = await fresh();
    await workspaceHome({});
    answers.get.set('/api/v1/flowers', { flowers: [row('newer', 'map'), row('first')] });
    answers.get.set('/api/v1/flowers/newer', { entry: { spec, spec_sha256: 'sha-newer' } });
    expect((await workspaceHome({})).standIn?.key).toBe('sha-newer');
  });

  test('never opens: the address decides that, and it asked for nothing', async () => {
    serve({ flowers: [row('first')] });
    const home = await (await fresh())({});
    expect(home.initialOpen).toEqual({ kind: 'latest' });
    expect(home.initialRun).toBeUndefined();
  });

  test.each([
    ['no flowers', () => serve({ flowers: [] })],
    ['the list failing', () => answers.get.set('/api/v1/health', { ok: true, llm: 'up' })],
    [
      'the flower failing to read',
      () => {
        serve({ flowers: [row('first')] });
        answers.get.delete('/api/v1/flowers/first');
      },
    ],
    [
      'the read throwing',
      () => {
        serve({ flowers: [row('first')] });
        answers.get.set('/api/v1/flowers/first', new Error('down'));
      },
    ],
    [
      'the render failing',
      () => {
        serve({ flowers: [row('first')] });
        answers.post = () => undefined;
      },
    ],
    [
      'the render throwing',
      () => {
        serve({ flowers: [row('first')] });
        answers.post = () => new Error('down');
      },
    ],
    [
      'a render with no reading',
      () => {
        serve({ flowers: [row('first')] });
        answers.post = () => ({});
      },
    ],
  ])('%s is empty ground, and nothing throws', async (_name, arrange) => {
    arrange();
    await expect((await fresh())({})).resolves.toMatchObject({ standIn: null });
  });
});

describe('the question', () => {
  test('comes from ?q=, whatever else the address holds', async () => {
    serve({ flowers: [] });
    const workspaceHome = await fresh();
    expect(await workspaceHome({ q: 'words', run: 'r1' })).toMatchObject({
      initialQuestion: 'words',
      initialRun: 'r1',
    });
    expect(await workspaceHome({ q: '' })).toMatchObject({ initialQuestion: null });
  });
});
