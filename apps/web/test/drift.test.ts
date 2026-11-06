// surface.drift, surface.shimmer, surface.connect and surface.tone. Elco: "All of them need to be softer and
// softly in motion", the colour behind the mouse is gone, and a line between stars stays off the content.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tones, v2 } from '@petal/tokens';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import {
  channels,
  crosses,
  fadeAt,
  type Point,
  pick,
  starsOn,
  toneAt,
} from '../app/versions/drift.ts';
import { Section } from '../components/ui/Section.tsx';

const D = v2.script.drift;
const C = v2.script.connect;
const app = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(app, path), 'utf8');

/** A spread of places on a band, a page long, and of moments, an hour long. */
const samples = Array.from({ length: 4000 }, (_, i) => ({
  x: (i * 97.3) % 1600,
  y: (i * 211.7) % 1400,
  t: (i * 37.9) % 3600,
  seed: (i % 7) * 1.3,
}));
const worstOver = (change: (s: (typeof samples)[number]) => number) =>
  Math.max(...samples.map(change));

describe('the field', () => {
  test('stays between its two ends', () => {
    for (const { x, y, t, seed } of samples) {
      const v = toneAt(x, y, t, seed);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test('is calm: a full swing takes at least twenty seconds', () => {
    const worst = worstOver(({ x, y, t, seed }) =>
      Math.abs(toneAt(x, y, t + 1, seed) - toneAt(x, y, t, seed)),
    );
    expect(worst).toBeGreaterThan(0.005);
    expect(worst).toBeLessThan(0.05);
  });

  test('every cycle runs to minutes', () => {
    for (const { period } of D.waves) expect(period).toBeGreaterThanOrEqual(120);
  });

  test('is soft: neighbouring cells of the canvas are close, so stretching it shows nothing', () => {
    const worst = worstOver(({ x, y, t, seed }) =>
      Math.abs(toneAt(x + D.cell, y, t, seed) - toneAt(x, y, t, seed)),
    );
    expect(worst).toBeLessThan(0.16);
  });

  test('one drawing to the next is under a level of the paint it most moves', () => {
    const step = worstOver(({ x, y, t, seed }) =>
      Math.abs(toneAt(x, y, t + D.frameMs / 1000, seed) - toneAt(x, y, t, seed)),
    );
    const widest = Math.max(
      ...Object.values(D.wash).map(({ low, high }) =>
        Math.abs(channels(low)[3] - channels(high)[3]),
      ),
    );
    // In alpha levels. Ground over the palest bands moves their colour by a small fraction of this.
    expect(step * widest).toBeLessThan(3);
  });
});

describe('nothing follows the mouse', () => {
  const sheet = read('app/versions/v2.css');
  const joy = read('app/versions/JoyLayer.tsx');
  const drift = read('app/versions/drift.ts');

  test.each(['data-spot', 'data-pull', '--b-sheen', '--b-wash', '--b-mx', 'joy-light-'])(
    '%s is gone from the stylesheet and JoyLayer',
    (name) => {
      expect(sheet).not.toContain(name);
      expect(joy).not.toContain(name);
    },
  );

  test('the textures have no way to know where it is', () => {
    expect(drift).not.toContain('.pointer');
    expect(drift).not.toContain('onScroll');
  });

  test('the groups that held its light are gone', () => {
    expect(Object.keys(v2.groups)).not.toContain('light');
    expect(Object.keys(v2.groups.gradient ?? {})).not.toEqual(expect.arrayContaining(['spot']));
  });
});

describe('the paints', () => {
  test('a paint becomes canvas numbers', () => {
    expect(channels('Ground')).toEqual([255, 255, 255, 255]);
    expect(channels({ of: 'Ink', alpha: 0.5 })).toEqual([23, 23, 23, 127.5]);
  });

  test('every band that drifts has a wash, and stone, which shimmers, has none', () => {
    expect(Object.keys(D.wash).sort()).toEqual(
      [...tones.filter((tone) => tone !== 'stone'), 'mint'].sort(),
    );
  });

  test('the textures are code, not bitmaps: each tile is under 2 KB, and none embeds an image', () => {
    const { grain, countergrain, screen, speckle } = v2.groups.texture as Record<
      string,
      string | Record<string, string>
    >;
    const values = [
      ...Object.values(grain as Record<string, string>).filter((value) => value !== 'none'),
      countergrain as string,
      screen as string,
      speckle as string,
    ];
    const tiles = values.flatMap((value) => value.split(/,\s*(?=url\()/));
    expect(tiles.length).toBeGreaterThanOrEqual(5);
    for (const value of tiles) {
      expect(value.startsWith('url("data:image/svg+xml,')).toBe(true);
      expect(value.length).toBeLessThan(2048);
      expect(value).not.toContain('base64');
    }
  });
});

describe('a line between two stars', () => {
  const WIDTH = 1440;
  const HEIGHT = 1050;

  test('stars are far fewer than Elco first saw, and only show in the corners', () => {
    const stars = starsOn(WIDTH, HEIGHT);
    expect(stars.length).toBeGreaterThan(4);
    // The first pass had 16 stars and 26 specks to about 1,400px² each, or some 1,500 on a band this size.
    expect(stars.length).toBeLessThan(80);
    for (const { x, y } of stars) {
      expect(fadeAt(x, y, WIDTH, HEIGHT)).toBeGreaterThanOrEqual(C.least);
    }
    expect(fadeAt(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT)).toBeLessThanOrEqual(0);
  });

  test('never crosses what it must keep out of', () => {
    const stars = starsOn(WIDTH, HEIGHT);
    const keepouts = [{ left: 1100, top: 0, right: 1250, bottom: HEIGHT }];
    for (let i = 0; i < 200; i++) {
      const pair = pick(stars, keepouts, () => i / 200);
      if (!pair) continue;
      expect(crosses(pair[0], pair[1], keepouts)).toBe(false);
    }
  });

  test('joins only near stars', () => {
    const pair = pick(starsOn(WIDTH, HEIGHT), [], () => 0.5) as [Point, Point];
    const apart = Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y);
    expect(apart).toBeGreaterThanOrEqual(C.nearest);
    expect(apart).toBeLessThanOrEqual(C.farthest);
  });

  test('has nothing to draw if every line would cross something', () => {
    const everything = [{ left: 0, top: 0, right: WIDTH, bottom: HEIGHT }];
    expect(pick(starsOn(WIDTH, HEIGHT), everything)).toBeNull();
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
