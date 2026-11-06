// surface.drift and surface.tone: the field stays in range, stays calm (Elco: things reacting too fast and
// too much is what bothers them), stays soft enough for a coarse canvas, and the tiles stay small.
import { tones, v2 } from '@petal/tokens';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { channels, toneAt } from '../app/versions/drift.ts';
import { Section } from '../components/ui/Section.tsx';

const D = v2.script.drift;

/** A spread of places on a band, a page long, and of moments, an hour long. */
const samples = Array.from({ length: 4000 }, (_, i) => ({
  x: (i * 97.3) % 1600,
  y: (i * 211.7) % 1400,
  t: (i * 37.9) % 3600,
  seed: (i % 7) * 1.3,
}));

describe('the field', () => {
  test('stays between its two ends, with or without the pointer', () => {
    for (const { x, y, t, seed } of samples) {
      for (const near of [0, 0.5, 1]) {
        const v = toneAt(x, y, t, seed, near);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  test('is calm: a full swing takes at least eight seconds', () => {
    const worst = Math.max(
      ...samples.map(({ x, y, t, seed }) =>
        Math.abs(toneAt(x, y, t + 1, seed) - toneAt(x, y, t, seed)),
      ),
    );
    expect(worst).toBeGreaterThan(0.01);
    expect(worst).toBeLessThan(0.125);
  });

  test('is soft: neighbouring cells of the canvas are close, so stretching it shows nothing', () => {
    const worst = Math.max(
      ...samples.map(({ x, y, t, seed }) =>
        Math.abs(toneAt(x + D.cell, y, t, seed) - toneAt(x, y, t, seed)),
      ),
    );
    expect(worst).toBeLessThan(0.16);
  });

  test('the pointer lifts it, gently, and only near', () => {
    const { x, y, t, seed } = samples[0] as (typeof samples)[number];
    expect(toneAt(x, y, t, seed, 0)).toBe(toneAt(x, y, t, seed));
    const lifted = samples.map((s) => toneAt(s.x, s.y, s.t, s.seed, 1));
    const rest = samples.map((s) => toneAt(s.x, s.y, s.t, s.seed));
    const mean = (a: number[]) => a.reduce((sum, v) => sum + v, 0) / a.length;
    expect(mean(lifted)).toBeGreaterThan(mean(rest));
  });

  test('answers the pointer and the scroll slowly, as the wordmark settles', () => {
    expect(D.leanMs).toBeGreaterThanOrEqual(600);
    expect(D.scrollMs).toBeGreaterThanOrEqual(400);
    expect(D.parallax).toBeLessThan(0.3);
  });
});

describe('the paints', () => {
  test('a paint becomes canvas numbers', () => {
    expect(channels('Ground')).toEqual([255, 255, 255, 255]);
    expect(channels({ of: 'Ink', alpha: 0.5 })).toEqual([23, 23, 23, 127.5]);
  });

  test('every tone and the mint band has a wash', () => {
    expect(Object.keys(D.wash).sort()).toEqual([...tones, 'mint'].sort());
  });

  test('the textures are code, not bitmaps: each tile is under 2 KB, and none embeds an image', () => {
    const { grain, countergrain, screen, felt } = v2.groups.texture;
    const values = [
      ...Object.values(grain as Record<string, string>),
      countergrain as string,
      screen as string,
      felt as string,
    ];
    const tiles = values.flatMap((value) => value.split(/,\s*(?=url\()/));
    expect(tiles.length).toBeGreaterThanOrEqual(6);
    for (const value of tiles) {
      expect(value.startsWith('url("data:image/svg+xml,')).toBe(true);
      expect(value.length).toBeLessThan(2048);
      expect(value).not.toContain('base64');
    }
  });
});

describe('a section', () => {
  const html = (props: { tone?: 'mist' }) =>
    renderToStaticMarkup(Section({ children: 'x', ...props }));

  test('says its tone, and says nothing without one', () => {
    expect(html({ tone: 'mist' })).toContain('data-tone="mist"');
    expect(html({})).not.toContain('data-tone');
  });
});
