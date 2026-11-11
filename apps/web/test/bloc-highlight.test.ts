// A chosen group's highlight on the map (#94): the legend's Highlight row (OVERLAYS) picks a bloc, the map
// highlights its members inside the flower you're in (LandscapeAt.highlight), and the blocs come from SYSTEMS's
// GET /api/v1/maps/:id/blocs, read once per map (useMapBlocs).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { readMapBlocs } from '../lib/agent-client.ts';

const WEB = join(import.meta.dirname, '..');
const text = (f: string) => readFileSync(join(WEB, f), 'utf8');

afterEach(() => vi.unstubAllGlobals());

describe('the blocs read', () => {
  test("asks the map's blocs, with a period only when one is given", async () => {
    const asked: string[] = [];
    const answer = {
      about: 'x',
      period: { from: 'a', to: 'b' },
      blocs: [{ id: 'bloc:1', members: ['m'], pairs: 1 }],
    };
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url);
      return new Response(JSON.stringify(answer), { status: 200 });
    });
    expect(await readMapBlocs('near:mainnet:x.sputnik-dao.near')).toEqual(answer);
    await readMapBlocs('m', { from: '2026-01-01T00:00:00Z' });
    expect(asked).toEqual([
      '/api/v1/maps/near%3Amainnet%3Ax.sputnik-dao.near/blocs',
      '/api/v1/maps/m/blocs?from=2026-01-01T00%3A00%3A00Z',
    ]);
  });

  test('none where the map has none, or the server says no', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 404 }));
    expect(await readMapBlocs('m')).toBeNull();
  });
});

describe('the map highlights the chosen group', () => {
  test('a setter on the map, as choose is, that lights that flower again with the group in its look', () => {
    const land = text('landscape/useLandscape.ts');
    expect(land).toMatch(/highlight\?: \(ids: readonly string\[\] \| null\) => void;/);
    expect(land).toMatch(/at\.current\.highlight = \(ids\) =>/);
    expect(land).toMatch(/sharedLook\(f, \[\.\.\.shared, \.\.\.group\], ringOf\(i\)\)/);
    expect(land).toMatch(/look: lookOf\(i\),/);
  });

  test("while a group is chosen everyone else recedes, as a pointed petal's neighbours do (one highlight state)", () => {
    const scene = text('flower/scene.ts');
    expect(scene).toMatch(
      /const away = \(i: number\): number => \(lit\.size > 0 && !high\[i\] \? 1 - RECEDE : 1\);/,
    );
    expect(scene.match(/Math\.min\(i === focusIndex \? 1 : recede, away\(i\)\)/g)?.length).toBe(2);
  });
});
