// coordinator/one-source.md, step 3: the site reads the person's view in one place, and every petal, still
// picture and list is drawn in it. Elco's glasses rule: the view is the person's, never a petal's.
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { DEFAULT_VIEW, viewHash } from '@petal/core/view';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_PERSON_VIEW, viewChoices, viewQuery } from '../lib/person-view.ts';

const asked = vi.hoisted(() => ({
  calls: [] as { path: string; cookie: string | null | undefined }[],
  answer: null as unknown,
  cookie: null as string | null,
}));

vi.mock('../lib/api.ts', () => ({
  api: async (path: string, init?: { cookie?: string | null }) => {
    asked.calls.push({ path, cookie: init?.cookie });
    return asked.answer === null
      ? { ok: false, status: 503, error: { code: 'source_failed', message: 'down' } }
      : { ok: true, value: asked.answer };
  },
  hourly: async (path: string) => {
    asked.calls.push({ path, cookie: undefined });
    return new Response(JSON.stringify({ views: [] }));
  },
}));
vi.mock('../lib/visitor.ts', () => ({ requestCookie: async () => asked.cookie }));

beforeEach(() => {
  asked.calls = [];
  asked.answer = null;
  asked.cookie = null;
});

const HASH = 'cd'.repeat(32);

describe('the person’s view, read on the server', () => {
  test('is asked of the server with the person’s own cookie, and taken as it answers', async () => {
    const { viewerView } = await import('../lib/viewer-view.ts');
    asked.cookie = 'petal_session=abc';
    asked.answer = { view: DEFAULT_VIEW, hash: HASH };
    expect(await viewerView()).toEqual({ view: DEFAULT_VIEW, hash: HASH });
    expect(asked.calls).toEqual([{ path: '/api/v1/me/view', cookie: 'petal_session=abc' }]);
  });

  test('is the default when the server can’t answer', async () => {
    const { viewerView } = await import('../lib/viewer-view.ts');
    expect(await viewerView()).toEqual(DEFAULT_PERSON_VIEW);
  });

  test('the default carries its whole hash', () => {
    expect(DEFAULT_PERSON_VIEW.hash).toBe(viewHash(DEFAULT_VIEW));
    expect(DEFAULT_PERSON_VIEW.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('every list of the map is asked in it', () => {
  test('the maps, one map, the views and the landing’s tiles name the view by its hash', async () => {
    const { mapList, mapOne } = await import('../lib/maps.ts');
    const { mapViewList } = await import('../lib/map-views.ts');
    const { powerMapTiles } = await import('../lib/power-map.ts');
    asked.answer = {};
    await mapList(HASH);
    await mapOne('near:validators', HASH);
    await mapViewList(HASH);
    await powerMapTiles(HASH);
    expect(asked.calls.map((c) => c.path)).toEqual([
      `/api/v1/maps?view=${HASH}`,
      `/api/v1/maps/near%3Avalidators?view=${HASH}`,
      `/api/v1/map/views?view=${HASH}`,
      `/api/v1/map/views?view=${HASH}`,
    ]);
    expect(viewQuery(HASH)).toBe(`view=${HASH}`);
  });
});

describe('what can go where', () => {
  test('each dimension offers only the data that fits it, from core’s table', () => {
    const names = Object.fromEntries(
      Object.entries(viewChoices()).map(([d, pieces]) => [d, pieces.map((p) => p.name)]),
    );
    // each wallet's activity where its map's proposals were read (Elco, 12 Nov: time is absent): votes cast is a
    // count, voted a category; last active is a date, which no dimension takes until the look gives it one
    expect(names).toEqual({
      height: ['share', 'amount', 'votes_cast'],
      width: ['share', 'amount', 'votes_cast'],
      order: ['share', 'amount', 'kind', 'identity', 'votes_cast', 'voted', 'name', 'name_kind'],
      colour: ['share', 'amount', 'kind', 'identity', 'votes_cast', 'voted', 'name', 'name_kind'],
      outline: ['kind', 'identity', 'voted', 'name', 'name_kind'],
      texture: ['kind', 'identity', 'voted', 'name', 'name_kind'],
      markings: ['votes_cast'],
      // who backs each wallet, where a flower's reading has delegations (Elco's walk 3: no choices on segments)
      segments: ['backers'],
      lines: [],
      // a person's annotations name accounts (annotation-layer.md, step 6): labels show them once chosen
      labels: ['kind', 'identity', 'voted', 'name', 'name_kind'],
    });
  });

  test('a flower’s own pieces of data are offered where they fit', () => {
    expect(viewChoices([{ name: 'backers', kind: 'parts' }]).segments).toEqual([
      { name: 'backers', kind: 'parts' },
    ]);
  });
});

const WEB = join(import.meta.dirname, '..');
const sourcesIn = (dir: string): string[] =>
  readdirSync(join(WEB, dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory()
      ? sourcesIn(join(dir, d.name))
      : /\.tsx?$/.test(d.name)
        ? [join(dir, d.name).split(sep).join('/')]
        : [],
  );

describe('one place', () => {
  test('nothing that draws for a person picks a view itself: the default comes only from lib/person-view.ts', () => {
    // usePersonView's reset() puts the default back, which is the person's own choice.
    const allowed = new Set(['lib/person-view.ts', 'viewmodels/usePersonView.ts']);
    const files = ['app', 'components', 'flower', 'lib', 'viewmodels']
      .flatMap(sourcesIn)
      .filter((f) => !f.startsWith('app/lab/') && !allowed.has(f));
    const naming = files.filter((f) => /\bDEFAULT_VIEW\b/.test(readFileSync(join(WEB, f), 'utf8')));
    expect(naming).toEqual([]);
  });
});
