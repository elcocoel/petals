// A flower a link in the conversation points at opens on /make's canvas, not on another
// page. What counts as one of this site's flowers, and how the address keeps a drawing opened that way.
import type { Spec } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { encodeDraft } from '../lib/draft.ts';
import { drawingLink, mapLink } from '../lib/drawing-link.ts';
import { addressOpensBox } from '../lib/panel-view.ts';
import { openFlowerIndex } from '../lib/thread-view.ts';
import { openFromParams, workspaceUrl } from '../lib/workspace-url.ts';

const SITE = 'https://petals.test';
const SHA = 'a'.repeat(64);
const spec = {
  petal: 'spec/v1',
  network: { id: 'moloch' },
  snapshot: { sha256: 'b'.repeat(64) },
} as Spec;

describe('a link to one of this site’s flowers', () => {
  test('a stored one, a drawing and a view on the map, whole or as a path', () => {
    expect(drawingLink('/f/abc', SITE)).toEqual({ stored: 'abc' });
    expect(drawingLink(`${SITE}/f/a%20b`, SITE)).toEqual({ stored: 'a b' });
    expect(drawingLink(`${SITE}/draft?spec=eyJ9`, SITE)).toEqual({ draft: 'eyJ9' });
    expect(drawingLink(`/d/${SHA}`, SITE)).toEqual({ sha: SHA });
    expect(drawingLink(`${SITE}/d/${SHA}`, SITE)).toEqual({ sha: SHA });
  });

  test('anything else stays a link: another site, another page, a hash that isn’t one', () => {
    expect(drawingLink(`https://elsewhere.test/d/${SHA}`, SITE)).toBeNull();
    expect(drawingLink('/gallery', SITE)).toBeNull();
    expect(drawingLink('/m/near%3Amainnet%3Avalidators', SITE)).toBeNull();
    expect(drawingLink('/d/not-a-hash', SITE)).toBeNull();
    expect(drawingLink('/draft', SITE)).toBeNull();
  });
});

describe('a drawing opened here', () => {
  test('the address keeps it, and a reload opens it again with its box', () => {
    const url = workspaceUrl({ runId: 'r1', open: { kind: 'draft', spec }, petal: null });
    expect(url).toBe(`/make?run=r1&draft=${encodeDraft(spec)}`);
    const { open } = openFromParams({ run: 'r1', draft: encodeDraft(spec) });
    expect(open).toEqual({ kind: 'draft', spec });
    expect(addressOpensBox(open, null)).toBe(true);
  });

  test('none of the thread’s flowers is in the panel then', () => {
    expect(openFlowerIndex({ kind: 'draft', spec }, 3)).toBe(-1);
  });

  test('a draft that can’t be read opens nothing', () => {
    expect(openFromParams({ draft: 'not base64 json' }).open).toEqual({ kind: 'latest' });
  });
});

describe('a link to the Power Map or a map on it', () => {
  test('the whole map, one map whole or as a path, and nothing else', () => {
    expect(mapLink('/map', SITE)).toEqual({ map: null });
    expect(mapLink(`${SITE}/m/eip155%3A1%3A0xabc`, SITE)).toEqual({ map: 'eip155:1:0xabc' });
    expect(mapLink('/m/near%3Amainnet%3Avalidators', SITE)).toEqual({
      map: 'near:mainnet:validators',
    });
    expect(mapLink('https://elsewhere.test/map', SITE)).toBeNull();
    expect(mapLink('/f/abc', SITE)).toBeNull();
    expect(mapLink('/gallery', SITE)).toBeNull();
  });
});
