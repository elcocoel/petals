// The literal scan (T175). Strict, no ratchet: design values come from packages/tokens, and one
// behaviour lives in one component. Fails on raw colours, arbitrary Tailwind values, inline colour
// or size styles, primitives used directly, rounded corners, a raw <button> or <a> styled with
// utilities outside components/ui/, and a class name in globals.css that isn't on the list below.
// One escape, which should be rare: a same-line `token-exempt: reason` comment.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const SCANNED = [
  'apps/web/app',
  'apps/web/components',
  'apps/web/viewmodels',
  'apps/web/lab',
];
const UI = 'apps/web/components/ui/';
const GLOBALS = 'apps/web/app/globals.css';

/** What globals.css may style: the classes the pages already had, and the renderer's. */
export const GLOBAL_CLASSES = new Set([
  'badge',
  'box',
  'composer',
  'composer-note',
  'composer-row',
  'error',
  'events',
  'flower-svg',
  'gallery',
  'gallery-flower',
  'legend',
  'md',
  'muted',
  'petal-centre',
  'petal-selected',
  'steps',
  'swatch',
  'thread',
  'you',
]);

export interface Finding {
  file: string;
  line: number;
  rule: string;
  text: string;
}

const LINE_RULES: [string, RegExp][] = [
  ['raw colour', /(?<![\w&/-])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/i],
  ['raw colour', /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/],
  ['arbitrary Tailwind value', /\b[a-z][a-z0-9-]*-\[[^\]\s]*\]/],
  ['arbitrary Tailwind value', /\b[a-z][a-z0-9-]*-\(--[\w-]+\)/],
  ['arbitrary Tailwind value', /\[[a-z-]+:[^\]\s]+\]/],
  ['primitive used directly, use a role', /var\(--primitive-/],
  // Tailwind keeps rounded-full and rounded-none whatever the theme says.
  ['corner radius is 0 everywhere', /\brounded-[a-z0-9]/],
];

const STYLE_KEY =
  /\b(?:color|background\w*|border\w*|outline\w*|fill|stroke\w*|boxShadow|font\w*|lineHeight|letterSpacing|padding\w*|margin\w*|gap|rowGap|columnGap|width|height|minWidth|minHeight|maxWidth|maxHeight|top|right|bottom|left|inset\w*)\s*:/;

/** A raw <button> or <a> carrying a className. Arrow functions in earlier attributes don't end it. */
const STYLED_CONTROL = /<(?:button|a)\b(?:=>|[^>])*?\bclassName\s*=/g;

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;

/** Each `style={{ … }}` block: its first line and its body, however many lines it spans. */
function styleBlocks(text: string): { line: number; body: string }[] {
  const out: { line: number; body: string }[] = [];
  for (const m of text.matchAll(/style=\{\{/g)) {
    const start = m.index + m[0].length;
    let depth = 2;
    let end = start;
    while (end < text.length && depth > 0) {
      if (text[end] === '{') depth++;
      if (text[end] === '}') depth--;
      end++;
    }
    out.push({ line: lineOf(text, m.index), body: text.slice(start, end) });
  }
  return out;
}

/** The class names in a stylesheet's selectors: comments and at-rule lines aside. */
function selectorClasses(text: string): { name: string; line: number }[] {
  const noComments = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const out: { name: string; line: number }[] = [];
  for (const m of noComments.matchAll(/([^{};]+)\{/g)) {
    const selector = m[1] ?? '';
    if (selector.trim().startsWith('@')) continue;
    for (const c of selector.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)) {
      out.push({ name: c[1] ?? '', line: lineOf(noComments, m.index + c.index) });
    }
  }
  return out;
}

/** Every finding in one file's text. `file` is repo-relative. */
export function scanText(text: string, file: string): Finding[] {
  const lines = text.split('\n');
  const exempt = (line: number) => /token-exempt:\s*\S/.test(lines[line - 1] ?? '');
  const findings: Finding[] = [];
  const add = (line: number, rule: string) => {
    if (!exempt(line)) findings.push({ file, line, rule, text: (lines[line - 1] ?? '').trim() });
  };

  lines.forEach((text, i) => {
    for (const [rule, re] of LINE_RULES) {
      if (re.test(text)) add(i + 1, rule);
    }
  });
  for (const block of styleBlocks(text)) {
    if (STYLE_KEY.test(block.body)) add(block.line, 'inline colour or size style');
  }
  if (!file.startsWith(UI) && /\.[jt]sx$/.test(file)) {
    for (const m of text.matchAll(STYLED_CONTROL)) {
      add(lineOf(text, m.index), 'styled raw control, use components/ui/Button or TextLink');
    }
  }
  if (file === GLOBALS) {
    for (const c of selectorClasses(text)) {
      if (!GLOBAL_CLASSES.has(c.name)) {
        add(c.line, `new class .${c.name} in globals.css, make it a component`);
      }
    }
  }
  return findings;
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
  );
}

/** Scans the app's folders under `root`. A folder that doesn't exist yet is fine. */
export function scanTree(root: string): Finding[] {
  return SCANNED.flatMap((dir) => walk(join(root, dir)))
    .filter((p) => /\.(?:tsx?|mjs|css)$/.test(p) && !/\.generated\./.test(p))
    .flatMap((p) => scanText(readFileSync(p, 'utf8'), relative(root, p)));
}

if (import.meta.main) {
  const findings = scanTree(join(import.meta.dirname, '..'));
  for (const f of findings) console.error(`${f.file}:${f.line}  ${f.rule}\n    ${f.text}`);
  if (findings.length > 0) {
    console.error(`literals: ${findings.length} found. Use a token or a component from ui/.`);
    process.exit(1);
  }
  console.log('literals: clean');
}
