// A map's composed reading: asked for the layers switched on, or, with none listed, the server's reading of every
// published layer, so a map with hundreds of layers never asks with a list too long for the address.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { readComposed } from '../lib/agent-client.ts';

afterEach(() => vi.unstubAllGlobals());

describe('the composed read', () => {
  const asked: string[] = [];
  const answer = { title: 't', petals: [] };
  const stub = () =>
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url);
      return new Response(JSON.stringify(answer), { status: 200 });
    });

  test('the layers on, when some are listed', async () => {
    stub();
    await readComposed('m', ['a', 'b'], 'v');
    expect(asked.at(-1)).toBe('/api/v1/maps/m/reading?layers=a%2Cb&view=v');
  });

  test('no list for every layer, however many the map has', async () => {
    stub();
    await readComposed('m', [], 'v');
    expect(asked.at(-1)).toBe('/api/v1/maps/m/reading?view=v');
  });
});
