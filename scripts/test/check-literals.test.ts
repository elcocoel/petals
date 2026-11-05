// T175: the literal scan fails on what it says it fails on, and nothing else.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { scanText, scanTree } from '../check-literals.ts';

const VIEW = 'apps/web/components/Thing.tsx';
const rules = (text: string, file = VIEW) => scanText(text, file).map((f) => f.rule);

describe('raw values', () => {
  test.each([
    ['a hex colour', 'const c = "#b00020";'],
    ['a short hex', '.x { color: #222 }'],
    ['rgb()', 'const c = "rgb(1 2 3)";'],
    ['rgba()', 'const c = "rgba(1, 2, 3, 0.5)";'],
    ['hsl()', '.x { color: hsl(10 20% 30%) }'],
    ['oklch()', '.x { color: oklch(50% 0.1 20) }'],
    ['an arbitrary colour', '<p className="bg-[#123456]" />'],
    ['an arbitrary size', '<p className="text-[13px]" />'],
    ['an arbitrary size behind a variant', '<p className="hover:p-[3px]" />'],
    ['an arbitrary property', '<p className="[color:red]" />'],
    ['a variable shorthand', '<p className="bg-(--primitive-ink)" />'],
    ['a primitive', '.x { color: var(--primitive-ink) }'],
    ['a rounded corner', '<p className="rounded-full" />'],
  ])('fails on %s', (_name, text) => {
    expect(rules(text)).not.toEqual([]);
  });

  test.each([
    ['a same-page anchor', '<a href="#doors">x</a>'],
    ['a component named like a colour function', 'export default function Lab() {}'],
    ['a fragment in a path', 'const u = "/connect#bad";'],
    ['a role variable', '.x { color: var(--text-primary) }'],
    ['token utilities', '<p className="bg-action px-control-inset type-label" />'],
    ['a generic', 'const x: Array<string> = [];'],
    ['an index signature', 'type M = { [key: string]: number };'],
    ['an attribute selector', '[data-surface="ink"] { display: block }'],
  ])('passes %s', (_name, text) => {
    expect(rules(text)).toEqual([]);
  });
});

describe('inline styles', () => {
  test('fails on a colour or a size, on one line or several', () => {
    expect(rules('<p style={{ color: "red" }} />')).toEqual(['inline colour or size style']);
    expect(rules('<p style={{ padding: x }} />')).toEqual(['inline colour or size style']);
    expect(rules('<p\n  style={{\n    display: "block",\n    width: 3,\n  }}\n/>')).toEqual([
      'inline colour or size style',
    ]);
  });

  test('passes a style with neither', () => {
    expect(rules('<p style={{ display: "none" }} />')).toEqual([]);
  });
});

describe('the escape', () => {
  test('needs a reason, on the same line', () => {
    expect(rules('const c = "#222"; // token-exempt: a demo of the old colour')).toEqual([]);
    expect(rules('const c = "#222"; // token-exempt:')).not.toEqual([]);
    expect(rules('// token-exempt: a demo of the old colour\nconst c = "#222";')).not.toEqual([]);
  });
});

describe('one behaviour, one component', () => {
  test('a raw control with utilities fails outside ui/', () => {
    expect(rules('<button className="bg-action" />')).toHaveLength(1);
    expect(rules('<a href="/" className="text-primary">x</a>')).toHaveLength(1);
    expect(rules('<a\n  href="/"\n  onClick={() => go()}\n  className="x"\n>y</a>')).toHaveLength(
      1,
    );
  });

  test('a raw control with no class passes, it gets the base look', () => {
    expect(rules('<button type="submit">Send</button>')).toEqual([]);
    expect(rules('<a href="/">x</a> <p className="muted" />')).toEqual([]);
  });

  test('other elements and ui/ itself pass', () => {
    expect(rules('<span className="muted" />')).toEqual([]);
    expect(rules('<article className="x" />')).toEqual([]);
    expect(rules('<button className="x" />', 'apps/web/components/ui/Button.tsx')).toEqual([]);
  });

  test('globals.css takes no new class', () => {
    const css = '/* .note in a comment */\n@layer base {\n  .box { color: red }\n}\n';
    expect(rules(css, 'apps/web/app/globals.css')).toEqual([]);
    expect(rules('.card > .box { width: 1.5em }', 'apps/web/app/globals.css')).toEqual([
      'new class .card in globals.css, make it a component',
    ]);
  });
});

describe('the tree', () => {
  test('skips generated files, other types and folders that do not exist yet', () => {
    const root = mkdtempSync(join(tmpdir(), 'petal-literals-'));
    mkdirSync(join(root, 'apps/web/app'), { recursive: true });
    writeFileSync(join(root, 'apps/web/app/tokens.generated.css'), '.x { color: #222 }');
    writeFileSync(join(root, 'apps/web/app/notes.md'), '#222');
    writeFileSync(join(root, 'apps/web/app/ok.tsx'), 'export const a = 1;');
    expect(scanTree(root)).toEqual([]);
    writeFileSync(join(root, 'apps/web/app/bad.tsx'), 'export const a = "#222";\n');
    expect(scanTree(root)).toMatchObject([{ file: 'apps/web/app/bad.tsx', line: 1 }]);
  });
});
