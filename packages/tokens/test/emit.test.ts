// T175: the generated CSS is fresh, contrast is enforced, roles flip, and Tailwind offers nothing
// off the system.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { compile } from 'tailwindcss';
import { describe, expect, test } from 'vitest';
import { contrast, contrastFailures, contrastTable, emitCss, OUTPUT } from '../emit.ts';
import { chart, fonts, rendererVariables, surfaces, type Tokens, tokens } from '../source.ts';

const repo = join(import.meta.dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(repo, p), 'utf8');

/** What Tailwind builds for these class names, with our theme after its default one. */
async function build(candidates: string[]) {
  const require = createRequire(import.meta.url);
  const twRoot = dirname(require.resolve('tailwindcss/package.json'));
  const compiler = await compile(`@import "tailwindcss";\n${emitCss()}`, {
    loadStylesheet: async (id, base) => {
      const path =
        id === 'tailwindcss' ? 'index.css' : id.replace(/^tailwindcss\//, '').replace(/^\.\//, '');
      const file = path.endsWith('.css') ? path : `${path}.css`;
      return { path: join(twRoot, file), base, content: readFileSync(join(twRoot, file), 'utf8') };
    },
  });
  return compiler.build(candidates);
}

const hasRule = (css: string, cls: string) => css.includes(`.${cls.replaceAll(':', '\\:')}`);

describe('emit', () => {
  test('the committed CSS is what the source emits', () => {
    expect(readFileSync(OUTPUT, 'utf8')).toBe(emitCss());
  });

  test('changing one primitive reaches every role that uses it', () => {
    const changed: Tokens = {
      ...tokens,
      primitives: { ...tokens.primitives, Ink: '#123456' },
    };
    const css = emitCss(changed);
    expect(css).toContain('--text-primary: #123456;');
    expect(css).toContain('--text-muted: rgb(18 52 86 / 0.6);');
    expect(css).toContain('--action-background: #123456;');
  });
});

describe('contrast', () => {
  test('every declared pair passes on every surface', () => {
    expect(contrastFailures()).toEqual([]);
    expect(contrastTable()).toHaveLength(18);
  });

  test('known values', () => {
    expect(contrast('Ink', 'Ground')).toBeCloseTo(17.93, 1);
    expect(contrast({ of: 'Ink', alpha: 0.6 }, 'Ground')).toBeGreaterThan(4.5);
    expect(contrast('Mint', 'Ground')).toBeLessThan(2);
  });

  test('a weak pair is reported', () => {
    const weak: Tokens = {
      ...tokens,
      surfaces: {
        ...surfaces,
        ground: { ...surfaces.ground, 'text-muted': { of: 'Ink', alpha: 0.4 } },
      },
    };
    expect(contrastFailures(weak)).toMatchObject([
      { surface: 'ground', text: 'text-muted', on: 'surface' },
    ]);
  });
});

describe('Tailwind theme', () => {
  test('utilities exist for our tokens', async () => {
    const names = [
      'bg-surface',
      'text-primary',
      'text-muted',
      'border-hairline',
      'bg-action',
      'text-on-action',
      'h-control-height',
      'px-page-inset',
      'gap-block-gap',
      'font-mono',
      'type-body',
      'type-mono',
      'wordmark-front',
      'md:px-page-inset',
    ];
    const css = await build(names);
    for (const name of names) expect(hasRule(css, name), name).toBe(true);
  });

  test('nothing off the system has a utility', async () => {
    const names = [
      'bg-red-500',
      'bg-white',
      'text-black',
      'border-gray-200',
      'p-4',
      'gap-2',
      'h-12',
      'text-sm',
      'text-lg',
      'rounded-md',
      'shadow-md',
      'font-bold',
      'leading-tight',
      'tracking-wide',
    ];
    const css = await build(names);
    for (const name of names) expect(hasRule(css, name), name).toBe(false);
  });

  test('a role utility reads the role where it is used, so it flips with the surface', async () => {
    const css = await build(['text-primary', 'bg-action']);
    expect(css).toMatch(/\.text-primary\s*{\s*color:\s*var\(--text-primary\)/);
    expect(css).toMatch(/\.bg-action\s*{\s*background-color:\s*var\(--action-background\)/);
  });
});

describe('the seams around the tokens', () => {
  test('every variable the renderer reads has a token', () => {
    const style = read('packages/core/src/render/style.ts');
    const read_ = new Set([...style.matchAll(/var\(--([\w-]+)\)/g)].map((m) => m[1]));
    read_.delete('ink'); // follows --text-primary
    expect([...read_].sort()).toEqual([...rendererVariables].sort());
  });

  test('every swatch a legend can name has a generated rule', () => {
    const css = emitCss();
    const sources = [
      read('packages/core/src/render/style.ts'),
      read('packages/core/src/render/legend.ts'),
      read('apps/web/lib/mock/near-validators.json'),
    ];
    const named = sources.flatMap((s) =>
      [...s.matchAll(/var\(--([\w-]+)\)/g)].map((m) => m[1] as string),
    );
    for (const key of new Set(named)) {
      if (key === 'ink') continue;
      expect(key in chart, key).toBe(true);
      expect(css).toContain(`[data-swatch="${key}"]`);
    }
  });

  test('the layout loads each font under the variable the theme reads', () => {
    const layout = read('apps/web/app/layout.tsx');
    for (const f of Object.values(fonts)) expect(layout).toContain(`variable: '${f.variable}'`);
  });
});
