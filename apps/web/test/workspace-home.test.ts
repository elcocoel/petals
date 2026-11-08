// T201, then Elco on 8 Nov: nothing stands on the canvas before the conversation draws, and nothing throws.
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

describe('the canvas before the conversation draws', () => {
  test('nothing stands in: no flower is read or drawn for it', async () => {
    serve({ flowers: [row('first'), row('second')] });
    const home = await (await fresh())({});
    expect(answers.posts).toEqual([]);
    expect(home).not.toHaveProperty('standIn');
    expect(home.shelf.map((f) => f.id)).toEqual(['first', 'second']);
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
  ])('%s, and nothing throws', async (_name, arrange) => {
    arrange();
    await expect((await fresh())({})).resolves.toMatchObject({ shelf: [] });
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
