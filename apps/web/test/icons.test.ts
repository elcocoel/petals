// One icon family (Elco, 10 Nov: "let's define our icons family and stay within it"): Phosphor, through
// components/ui/Icon.tsx alone. Anywhere else, an <svg> is a drawing (a flower, a figure), never an icon.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

const app = join(import.meta.dirname, '..');
const ICON = 'components/ui/Icon.tsx';
/** The drawings: they draw a reading or a figure, so they hold their own <svg>. */
const DRAWINGS = [
  'components/ui/Drawing.tsx',
  'components/landing/AnnotatedFlower.tsx',
  'flower/FlowerCanvas.tsx',
  // the outline bench's key: a short run of each line, as the flower draws it round a petal
  'lab/flower/OutlineKey.tsx',
];

const sources = (dir: string): string[] =>
  readdirSync(join(app, dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory()
      ? sources(join(dir, d.name))
      : /\.tsx?$/.test(d.name)
        ? [join(dir, d.name)]
        : [],
  );
const files = ['components', 'flower', 'app', 'lab'].flatMap(sources);
const text = (path: string) => readFileSync(join(app, path), 'utf8');

describe('the icon family', () => {
  test('Phosphor comes in through Icon.tsx only', () => {
    const importing = files.filter((f) => text(f).includes('@phosphor-icons/'));
    expect(importing.map((f) => relative('.', f))).toEqual([ICON]);
  });

  test('an <svg> outside Icon.tsx is one of the drawings', () => {
    const drawing = files.filter((f) => f !== ICON && /<svg[\s>]/.test(text(f)));
    expect(drawing.filter((f) => !DRAWINGS.includes(f))).toEqual([]);
  });
});
