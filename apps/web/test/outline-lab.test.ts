// Outlines are in /lab first (annotation-layer.md, step 7; Elco's (b), 11 Nov): nothing on the live flowers
// draws one until Elco has seen them. Only the flower bench hands the canvas any; the canvas draws none
// unless handed them.
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

describe('outlines, in the lab only', () => {
  test('only the flower bench hands the canvas outlines', () => {
    const handing = ['app', 'components', 'flower', 'landscape', 'lib', 'viewmodels', 'lab']
      .flatMap(sourcesIn)
      .filter((f) => /\boutlines=\{/.test(text(f)));
    expect(handing).toEqual(['app/lab/flower/page.tsx']);
  });

  test('the canvas draws none unless it is handed them', () => {
    expect(text('flower/FlowerCanvas.tsx')).toMatch(/outlines = null,/);
    expect(text('flower/drive.ts')).toMatch(/o\.outlines \?\? null/);
    expect(text('flower/scene.ts')).toMatch(/outlines: PetalOutlines \| null = null/);
  });
});
