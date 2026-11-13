// The old hand-drawn marks go. Nothing petal-shaped on the site comes from
// lib/figures.ts: the workspace's sign is the Petals icon (components/ui/Icon.tsx), and the landing's marks
// are gone. The figures stay for the lab's own pages, which aren't the site.
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

const site = ['app', 'components', 'flower', 'landscape', 'lib', 'viewmodels']
  .flatMap(sourcesIn)
  .filter((f) => !f.startsWith('app/lab/'));
const imports = (f: string, what: RegExp) =>
  [...readFileSync(join(WEB, f), 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].some((m) =>
    what.test(m[1] as string),
  );

/** The files that still hold a figure, each for a reason that keeps it off the site. */
const KEPT: Record<string, string> = {
  'components/ui/Drawing.tsx': 'draws a figure, for the lab',
  'components/ui/FaqItem.tsx':
    'draws a glyph only when it is handed one, and the site hands it none',
  'components/ui/GalleryCard.tsx': 'only the lab shows it',
  'components/landing/AnnotatedFlower.tsx': 'only the lab shows it',
};

describe('the old marks', () => {
  test('nothing on the site draws from lib/figures.ts', () => {
    const drawing = site.filter(
      (f) => !(f in KEPT) && imports(f, /(?:^|\/)(?:lib\/figures|ui\/Drawing)(?:\.tsx?)?$/),
    );
    expect(drawing).toEqual([]);
  });

  test('what still holds a figure, but for the FAQ, is shown by the lab alone', () => {
    for (const kept of [
      'components/ui/GalleryCard.tsx',
      'components/landing/AnnotatedFlower.tsx',
    ]) {
      const name = kept.replace(/^.*\//, '').replace(/\.tsx$/, '');
      const using = site.filter(
        (f) => f !== kept && imports(f, new RegExp(`(?:^|/)${name}(?:\\.tsx)?$`)),
      );
      expect(using, kept).toEqual([]);
    }
  });

  test('the FAQ hands its items no glyph', () => {
    const questions = readFileSync(join(WEB, 'components/landing/Questions.tsx'), 'utf8');
    expect(questions).not.toMatch(/\bglyph[=:]/);
    expect(imports('components/landing/Questions.tsx', /figures/)).toBe(false);
  });
});
