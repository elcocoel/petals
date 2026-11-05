// The behaviour tree holds: every rule in a version's stylesheet goes through a known parent and is
// marked with a known child, every child in the table is really used, and every component that carries
// `data-b` names a parent. A rule with no parent fails here, by name.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { behaviours, parentOf, parents } from '@petal/tokens';
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

describe('the table against what uses it', () => {
  const usedInSheet = new Set(
    [...parse(SHEET).rules, ...parse(SHEET).keyframes].map((r) => r.child),
  );
  const scripted = new Set<string>([...Object.keys(SCRIPTED), ...REVEALED]);

  test.each(behaviours.map((b) => [b.name, b.via] as const))('%s is used (%s)', (name, via) => {
    if (via !== 'script') expect(usedInSheet.has(name), `${name} in v2.css`).toBe(true);
    if (via !== 'css') expect(scripted.has(name), `${name} in JoyLayer`).toBe(true);
  });

  test('nothing is used that the table does not list as living there', () => {
    const table = new Map<string, string>(behaviours.map((b) => [b.name, b.via]));
    for (const child of usedInSheet) {
      expect(['css', 'both'], `${child} in v2.css`).toContain(table.get(child as string));
    }
    for (const child of scripted) {
      expect(['script', 'both'], `${child} in JoyLayer`).toContain(table.get(child));
    }
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
  const files = sources('components').map((p) => readFileSync(join(app, p), 'utf8'));
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
