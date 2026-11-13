// T201: nothing stands on the canvas before the conversation draws, and nothing throws.
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

/** The view the page read (lib/viewer-view.ts), by its hash. */
const VIEW = 'ab'.repeat(32);

/** A server just started: nothing kept. */
const fresh = async () => {
  vi.resetModules();
  return (await import('../lib/workspace-home.ts')).workspaceHome;
};

/** A map, one per address, as GET /api/v1/maps gives it. */
const row = (id: string, count = 1) => ({
  id,
  name: null,
  title: `Flower ${id}`,
  about: 'validators on NEAR',
  chain: 'near:mainnet',
  address: null,
  picture: `https://petals.test/api/v1/map/${id}/svg`,
  view_url: `https://petals.test/d/${id}`,
  keys: [],
  readings: [
    {
      snapshot: id,
      as_of: '2026-11-03T19:42:00Z',
      network: 'near-validators',
      about: 'validators on NEAR',
      title: `Flower ${id}`,
      count,
      made_by: null,
      drawings: [],
    },
  ],
});
const spec = { petal: 'spec/v1' };
const reading = { title: 'NEAR validators', petals: [{ id: 'a' }], extra: 'not for the browser' };

function serve(map: unknown) {
  answers.get.set('/api/v1/health', { ok: true, llm: 'up' });
  answers.get.set(`/api/v1/maps?view=${VIEW}`, map);
  answers.get.set('/api/v1/flowers/first', { entry: { spec, spec_sha256: 'sha-first' } });
  answers.post = () => ({ reading });
}

beforeEach(() => {
  answers.get.clear();
  answers.posts.length = 0;
});

describe('the canvas before the conversation draws', () => {
  test('nothing stands in: no flower is read or drawn for it', async () => {
    serve({ maps: [row('first'), row('second', 5)] });
    const home = await (await fresh())({}, VIEW);
    expect(answers.posts).toEqual([]);
    expect(home).not.toHaveProperty('standIn');
    // one map: the shelf offers what an empty conversation offers, the largest first
    expect(home.shelf.map((m) => m.id)).toEqual(['second', 'first']);
    expect(home.starts.map((s) => s.href)).toEqual(['/m/second', '/m/first', '/map']);
  });

  test('never opens: the address decides that, and it asked for nothing', async () => {
    serve({ maps: [row('first')] });
    const home = await (await fresh())({}, VIEW);
    expect(home.initialOpen).toEqual({ kind: 'latest' });
    expect(home.initialRun).toBeUndefined();
  });

  test.each([
    ['an empty map', () => serve({ maps: [] })],
    ['the list failing', () => answers.get.set('/api/v1/health', { ok: true, llm: 'up' })],
  ])('%s, and nothing throws', async (_name, arrange) => {
    arrange();
    await expect((await fresh())({}, VIEW)).resolves.toMatchObject({ shelf: [] });
  });
});

describe('the question', () => {
  test('comes from ?q=, whatever else the address holds', async () => {
    serve({ maps: [] });
    const workspaceHome = await fresh();
    expect(await workspaceHome({ q: 'words', run: 'r1' }, VIEW)).toMatchObject({
      initialQuestion: 'words',
      initialRun: 'r1',
    });
    expect(await workspaceHome({ q: '' }, VIEW)).toMatchObject({ initialQuestion: null });
  });
});
