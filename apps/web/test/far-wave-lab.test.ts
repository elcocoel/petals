// The far wave is in /lab first (#84): only the map bench asks for it, and /map, the landing and /make draw far
// flowers as their silhouettes until Elco has seen it.
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, test } from 'vitest';

const WEB = join(import.meta.dirname, '..');
const sourcesIn = (dir: string): string[] =>
  readdirSync(join(WEB, dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory()
      ? sourcesIn(join(dir, d.name))
      : /\.tsx?$/.test(d.name)
        ? [join(dir, d.name).split(sep).join('/')]
        : [],
  );
const text = (f: string) => readFileSync(join(WEB, f), 'utf8');

describe('the far wave, in the lab only', () => {
  test('only the map bench asks for it', () => {
    const asking = ['app', 'components', 'flower', 'landscape', 'lib', 'viewmodels', 'lab']
      .flatMap(sourcesIn)
      .filter((f) => /\bfar=\{/.test(text(f)));
    // LandscapeCanvas only hands its own prop on to the map inside it
    expect(asking).toEqual(['app/lab/map/page.tsx', 'landscape/LandscapeCanvas.tsx']);
  });

  test('the map draws silhouettes unless asked', () => {
    expect(text('landscape/LandscapeCanvas.tsx')).toMatch(/far = null,/);
    expect(text('landscape/scene.ts')).toMatch(/far: FarStyle = null/);
  });
});
