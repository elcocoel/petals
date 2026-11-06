// The behaviour tree holds: every rule in a version's stylesheet goes through a known parent and is
// marked with a known child, every child in the table is really used, and every component that carries
// `data-b` names a parent. A rule with no parent fails here, by name.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { behaviours, parentOf, parents, tokenName, v2 } from '@petal/tokens';
import { describe, expect, test } from 'vitest';
import { REVEALED, SCRIPTED } from '../app/versions/JoyLayer.tsx';

const app = join(import.meta.dirname, '..');
const SHEET = readFileSync(join(app, 'app/versions/v2.css'), 'utf8');
const ROOT = /^:root\[data-version="2"\](\[data-joy\])?/;

interface Rule {
  child: string | null;
  selector: string;
  line: number;
}
interface Keyframes {
  child: string | null;
  name: string;
}

const lineOf = (text: string, at: number) => text.slice(0, at).split('\n').length;

/** Splits on commas that aren't inside `:is(…)` and friends. */
function splitSelectors(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    if (text[i] === ')') depth--;
    if (text[i] === ',' && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim());
}

/** A small parser, enough for this file: comments, at-rules, selectors, and their blocks. */
function parse(css: string): { rules: Rule[]; keyframes: Keyframes[]; unknownAt: string[] } {
  const rules: Rule[] = [];
  const keyframes: Keyframes[] = [];
  const unknownAt: string[] = [];
  let child: string | null = null;
  let i = 0;
  const skipBlock = () => {
    let depth = 0;
    do {
      if (css[i] === '{') depth++;
      if (css[i] === '}') depth--;
      i++;
    } while (depth > 0 && i < css.length);
  };
  const walk = (end: number) => {
    while (i < end) {
      if (/\s/.test(css[i] as string) || css[i] === '}') {
        i++;
      } else if (css.startsWith('/*', i)) {
        const close = css.indexOf('*/', i);
        const text = css.slice(i + 2, close).trim();
        if (/^[a-z]+\.[a-z-]+$/.test(text)) child = text;
        i = close + 2;
      } else if (css[i] === '@') {
        const open = css.indexOf('{', i);
        const prelude = css.slice(i, open).trim();
        if (prelude.startsWith('@keyframes')) {
          keyframes.push({ child, name: prelude.slice('@keyframes'.length).trim() });
          i = open;
          skipBlock();
        } else if (prelude.startsWith('@media')) {
          i = open + 1;
          // Walk inside it: its rules are held to the same law.
          let depth = 1;
          let j = i;
          while (depth > 0 && j < css.length) {
            if (css[j] === '{') depth++;
            if (css[j] === '}') depth--;
            j++;
          }
          walk(j - 1);
          i = j;
        } else {
          unknownAt.push(prelude);
          i = open;
          skipBlock();
        }
      } else {
        const open = css.indexOf('{', i);
        const line = lineOf(css, i);
        for (const selector of splitSelectors(css.slice(i, open))) {
          rules.push({ child, selector, line });
        }
        i = open;
        skipBlock();
      }
    }
  };
  walk(css.length);
  return { rules, keyframes, unknownAt };
}

/** Everything wrong with a stylesheet, in words. An empty list is the law. */
function audit(css: string): string[] {
  const names = new Set<string>(behaviours.map((b) => b.name));
  const { rules, keyframes, unknownAt } = parse(css);
  const out: string[] = unknownAt.map((at) => `${at}: no at-rule but @media and @keyframes`);
  for (const { child, selector, line } of rules) {
    const at = `line ${line}: ${selector}`;
    if (!ROOT.test(selector)) out.push(`${at}: not under :root[data-version="2"]`);
    const named = [...selector.matchAll(/\[data-b=["']([a-z]+)["']\]/g)].map((m) => m[1] as string);
    if (named.length === 0) out.push(`${at}: names no parent`);
    for (const parent of named) {
      if (!(parent in parents)) out.push(`${at}: unknown parent ${parent}`);
    }
    if (child === null || !names.has(child)) out.push(`${at}: unknown child ${child}`);
    else if (!named.includes(parentOf(child)))
      out.push(`${at}: doesn't go through ${child}'s parent`);
  }
  for (const { child, name } of keyframes) {
    if (child === null || !names.has(child)) out.push(`@keyframes ${name}: unknown child ${child}`);
    else if (!name.startsWith(`${parentOf(child)}-`)) {
      out.push(`@keyframes ${name}: isn't named after its parent, ${parentOf(child)}`);
    }
  }
  return out;
}

describe('the stylesheet', () => {
  test('every rule goes through a known parent under the version', () => {
    expect(audit(SHEET)).toEqual([]);
    expect(parse(SHEET).rules.length).toBeGreaterThan(80);
  });

  test.each([
    ['a rule with no parent', ':root[data-version="2"] p { color: red; }', 'names no parent'],
    ['a free-floating rule', '/* box.glass */\nbody { color: red; }', 'not under'],
    [
      'an unknown parent',
      '/* box.glass */\n:root[data-version="2"] [data-b="nope"] { color: red; }',
      'unknown parent',
    ],
    [
      'an unknown child',
      '/* box.nope */\n:root[data-version="2"] [data-b="box"] { color: red; }',
      'unknown child',
    ],
    [
      "another parent's child",
      '/* action.lift */\n:root[data-version="2"] [data-b="box"] { color: red; }',
      "doesn't go through",
    ],
    ['an unmarked rule', ':root[data-version="2"] [data-b="box"] { color: red; }', 'unknown child'],
    ['a stray at-rule', '@font-face { font-family: x; }', 'no at-rule'],
    [
      'a stray keyframe',
      '/* box.glass */\n@keyframes wiggle { from { opacity: 0; } }',
      "isn't named after",
    ],
    [
      'a rule inside @media with no parent',
      '@media (hover: hover) { /* box.lift */ :root[data-version="2"] p { color: red; } }',
      'names no parent',
    ],
  ])('fails on %s', (_name, css, expected) => {
    expect(audit(css).join('\n')).toContain(expected);
  });
});

describe('the tokens', () => {
  const declared = Object.entries(v2.groups).flatMap(([group, values]) =>
    Object.keys(values).map((name) => tokenName(group, name)),
  );
  const named = new Set([...SHEET.matchAll(/--joy-[\w-]+/g)].map((m) => m[0]));

  test('every token the stylesheet reads exists', () => {
    expect([...named].filter((name) => !declared.includes(name))).toEqual([]);
  });

  test('every token has a purpose: the stylesheet reads it', () => {
    expect(declared.filter((name) => !named.has(name))).toEqual([]);
  });
});

describe('hover', () => {
  /** Every declaration of every rule whose selector says :hover. */
  const hoverDeclarations = (css: string) =>
    [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*:hover[^{}]*)\{([^{}]*)\}/g)].flatMap(
      (m) =>
        (m[2] ?? '')
          .split(';')
          .map((d) => d.split(':')[0]?.trim() ?? '')
          .filter(Boolean)
          .map((property) => ({ selector: (m[1] ?? '').trim(), property })),
    );
  /**
   * `text-decoration-line` isn't movement: it takes away v1's underline, in favour of the drawn one. Nor is
   * `z-index`: it says which row's card lies over its neighbour's separator, and can't shift layout.
   */
  const MOVES = new Set([
    'translate',
    'scale',
    'rotate',
    'transform',
    'transform-origin',
    'opacity',
    'text-decoration-line',
    'z-index',
  ]);

  test('moves things with transform and opacity only, so it can never shift layout', () => {
    const found = hoverDeclarations(SHEET);
    expect(found.length).toBeGreaterThan(10);
    expect(found.filter(({ property }) => !MOVES.has(property))).toEqual([]);
  });

  test('a rule that paints on hover is caught', () => {
    const css = ':root[data-version="2"] [data-b="box"]:hover { box-shadow: var(--x); }';
    expect(hoverDeclarations(css)).toEqual([expect.objectContaining({ property: 'box-shadow' })]);
  });
});

describe('the table against what uses it', () => {
  const usedInSheet = new Set(
    [...parse(SHEET).rules, ...parse(SHEET).keyframes].map((r) => r.child),
  );
  const scripted = new Set<string>([...Object.keys(SCRIPTED), ...REVEALED]);

  /** `// box.move` on a line of its own, in a component, a ViewModel or the live flower. */
  const markedInViews = (() => {
    const sources = (dir: string): string[] =>
      readdirSync(join(app, dir), { withFileTypes: true }).flatMap((d) =>
        d.isDirectory()
          ? sources(join(dir, d.name))
          : /\.tsx?$/.test(d.name)
            ? [join(dir, d.name)]
            : [],
      );
    const text = [...sources('components'), ...sources('viewmodels'), ...sources('flower')]
      .map((p) => readFileSync(join(app, p), 'utf8'))
      .join('\n');
    const parentNames = Object.keys(parents).join('|');
    const mark = new RegExp(`^\\s*// ((?:${parentNames})\\.[a-z-]+)$`, 'gm');
    return new Set([...text.matchAll(mark)].map((m) => m[1] as string));
  })();

  test.each(behaviours.map((b) => [b.name, b.via] as const))('%s is used (%s)', (name, via) => {
    if (via === 'css' || via === 'both') {
      expect(usedInSheet.has(name), `${name} in v2.css`).toBe(true);
    }
    if (via === 'script' || via === 'both') {
      expect(scripted.has(name), `${name} in JoyLayer`).toBe(true);
    }
    if (via === 'view') expect(markedInViews.has(name), `${name} marked in a view`).toBe(true);
  });

  test('nothing is used that the table does not list as living there', () => {
    const table = new Map<string, string>(behaviours.map((b) => [b.name, b.via]));
    for (const child of usedInSheet) {
      expect(['css', 'both'], `${child} in v2.css`).toContain(table.get(child as string));
    }
    for (const child of scripted) {
      expect(['script', 'both'], `${child} in JoyLayer`).toContain(table.get(child));
    }
    for (const child of markedInViews) {
      expect(['view'], `${child} marked in a view`).toContain(table.get(child));
    }
  });
});

describe('a box that floats', () => {
  const rules = parse(SHEET).rules;
  const JOY = readFileSync(join(app, 'app/versions/JoyLayer.tsx'), 'utf8');

  test('takes the glass, as one kind of box', () => {
    const glass = rules.filter((r) => r.child === 'box.glass').map((r) => r.selector);
    expect(glass.some((s) => s.includes('[data-kind="float"]'))).toBe(true);
  });

  test.each(['box.rise', 'box.lift'])('leaves out %s', (child) => {
    const holding = rules.filter(
      (r) =>
        r.child === child && /\[data-b="box"\](?::not\([^)]*\))?:(?:hover|not)/.test(r.selector),
    );
    expect(holding.length).toBeGreaterThan(0);
    const offenders = holding.filter(
      ({ selector }) =>
        (selector.includes(':hover') || selector.includes(':not([data-seen]')) &&
        !selector.includes('[data-kind="float"]'),
    );
    expect(offenders).toEqual([]);
  });

  test("isn't watched for a reveal, and doesn't follow the pointer", () => {
    expect(JOY).toContain(`'box.rise': '[data-b="box"]:not([data-kind="float"])'`);
    expect(JOY).toContain(`const BOX = '[data-b="box"]:not(foreignObject *, [data-kind="float"])'`);
  });
});

describe('components', () => {
  const sources = (dir: string): string[] =>
    readdirSync(join(app, dir), { withFileTypes: true }).flatMap((d) =>
      d.isDirectory()
        ? sources(join(dir, d.name))
        : /\.tsx$/.test(d.name)
          ? [join(dir, d.name)]
          : [],
    );
  const files = [...sources('components'), ...sources('flower')].map((p) =>
    readFileSync(join(app, p), 'utf8'),
  );
  const used = files.flatMap((text) =>
    [...text.matchAll(/data-b="([a-z]+)"/g)].map((m) => m[1] as string),
  );

  test('every data-b names a parent', () => {
    for (const parent of used) expect(Object.keys(parents)).toContain(parent);
  });

  test('every parent sits on a component', () => {
    for (const parent of Object.keys(parents)) {
      const onButton = parent === 'action'; // Button's variants map to it.
      if (!onButton) expect(used, parent).toContain(parent);
    }
    const button = readFileSync(join(app, 'components/ui/Button.tsx'), 'utf8');
    expect(button).toContain("primary: 'action'");
  });
});
