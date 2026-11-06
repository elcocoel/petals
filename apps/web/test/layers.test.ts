// T178: MVVM+ held by a test (design/frontend-foundation.md), the way packages/core/test/purity.test.ts
// holds core: a static scan of every source file, with comments and string contents removed, so a
// comment saying "fetch" does not count. Each rule also runs against a sample that breaks it, so a
// rule that stopped catching anything fails here too.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
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

/**
 * Source without comments, strings, template text and regex literals. A scanner, not the regexes of
 * purity.test.ts: one apostrophe inside a template literal flips their quote parity, which can hide a
 * real call as easily as it shows a false one. A quote can't run past its line, so JSX text like
 * "don't" costs one line at most.
 */
function code(text: string): string {
  let out = '';
  let i = 0;
  const skipTo = (end: string) => {
    const at = text.indexOf(end, i);
    i = at === -1 ? text.length : at + end.length;
  };
  while (i < text.length) {
    const c = text[i] as string;
    if (c === '/' && text[i + 1] === '/') {
      skipTo('\n');
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      skipTo('*/');
    } else if (c === "'" || c === '"' || c === '`') {
      for (i++; i < text.length && text[i] !== c; i++) {
        if (text[i] === '\\') i++;
        else if (text[i] === '\n' && c !== '`') break;
      }
      i++;
      out += `${c}${c}`;
    } else if (c === '/' && /(?:[(,=:[!&|?{};\n]|\breturn)\s*$/.test(out.slice(-12))) {
      let inClass = false;
      for (i++; i < text.length && text[i] !== '\n'; i++) {
        if (text[i] === '\\') i++;
        else if (text[i] === '[') inClass = true;
        else if (text[i] === ']') inClass = false;
        else if (text[i] === '/' && !inClass) break;
      }
      i++;
      out += '/./';
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Everything a file imports, written any way. Read from the raw text: stripping would hide it. */
function importsOf(text: string): string[] {
  const source = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  return [
    /^\s*(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/gm,
    /^\s*import\s+['"]([^'"]+)['"]/gm,
    /\bimport\s*\(\s*(?:\/\*.*?\*\/\s*)*['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]/g,
  ].flatMap((re) => [...source.matchAll(re)].map((m) => m[1] as string));
}

const NETWORK =
  /(?<![\w.])fetch\s*\(|globalThis\.fetch|\bXMLHttpRequest\b|\bEventSource\b|\bWebSocket\b/;
const DOM = /\b(?:window|document|localStorage|sessionStorage)\b/;
const REACT_OR_NEXT = /^(?:react|react-dom|next)(?:\/|$)/;
const ADAPTER = /(?:^|\/)agent-client(?:\.ts)?$/;

/** What a file breaks, or null. */
type Check = (text: string) => string | null;

const importing =
  (re: RegExp, what: string): Check =>
  (text) => {
    const hit = importsOf(text).find((spec) => re.test(spec));
    return hit ? `imports ${hit} (${what})` : null;
  };
const using =
  (re: RegExp, what: string): Check =>
  (text) => {
    const hit = code(text).match(re);
    return hit ? `uses ${hit[0].trim()} (${what})` : null;
  };
const all =
  (...checks: Check[]): Check =>
  (text) =>
    checks.map((c) => c(text)).find((r) => r !== null) ?? null;

/**
 * The exceptions, each named. Everything else in lib/ is held to every rule below, the files that
 * only ever run on the server included: none of them needs React, Next or the DOM.
 */
const MAY_CALL_THE_NETWORK = new Set(['lib/agent-client.ts']);

/** The pure projection of the foundation doc's table: same input, same output, and nothing else. */
const PROJECTION = [
  'lib/thread.ts',
  'lib/thread-view.ts',
  'lib/panel-view.ts',
  'lib/flower-view.ts',
  'lib/ask-about.ts',
  'lib/stage.ts',
  'lib/workspace-url.ts',
  'lib/float-box.ts',
  'lib/sse.ts',
  'lib/markdown.ts',
];

/** The one file in components/chat that isn't a view: it follows the window's scroll. */
const VIEW_HOOKS = new Set(['components/chat/useFollowScroll.ts']);

interface Rule {
  name: string;
  files: () => string[];
  check: Check;
  /** breaks the rule, so the rule must catch it */
  bad: string;
  /** only talks about it, so the rule must not */
  good: string;
}

const RULES: Rule[] = [
  {
    name: 'lib/ imports no react or next',
    files: () => sourcesIn('lib'),
    check: importing(REACT_OR_NEXT, 'lib stays free of the framework'),
    bad: "import { useState } from 'react';",
    good: "// react is not imported here\nconst x = 'next/link';",
  },
  {
    name: 'lib/ touches no DOM globals',
    files: () => sourcesIn('lib'),
    check: using(DOM, 'a browser is injected, not reached for'),
    bad: "export const go = () => window.localStorage.getItem('x');",
    good: "// window and document aren't touched\nconst words = 'localStorage';",
  },
  {
    name: 'lib/ calls no network, except the adapter',
    files: () => sourcesIn('lib').filter((f) => !MAY_CALL_THE_NETWORK.has(f)),
    check: using(NETWORK, 'only lib/agent-client.ts talks to the API'),
    bad: "export const go = () => fetch('/api/v1/health');",
    good: "// fetch() is the adapter's job\nconst hono = app.fetch(req); const s = 'fetch(';",
  },
  {
    name: 'the pure projection reads no clock, no randomness, no node:, no environment',
    files: () => PROJECTION,
    check: all(
      importing(/^node:/, 'a projection depends only on its input'),
      using(
        /Date\.now|new\s+Date\b|performance\.now|setTimeout|setInterval|Math\.random|getRandomValues|randomUUID|\bprocess\.|globalThis\./,
        'a projection depends only on its input',
      ),
    ),
    bad: 'export const stamp = () => Date.now();',
    good: "// Date.now would break this\nconst s = 'Math.random';",
  },
  {
    name: 'components/ have no fetch( and do not reach for the adapter',
    files: () => sourcesIn('components'),
    check: all(
      using(NETWORK, 'a view renders; a ViewModel calls'),
      importing(ADAPTER, 'a view renders; a ViewModel calls'),
    ),
    bad: "const r = await fetch('/api/v1/render');",
    good: "// no fetch( here\nconst s = 'fetch(';",
  },
  {
    name: 'viewmodels/ import nothing from components/',
    files: () => sourcesIn('viewmodels'),
    check: importing(/(?:^|\/)components(?:\/|$)/, 'a ViewModel knows no view'),
    bad: "import { Flower } from '../components/Flower.tsx';",
    good: "// components/ are not imported\nconst s = '../components/Flower.tsx';",
  },
  {
    name: 'viewmodels/ call the API only through the adapter',
    files: () => sourcesIn('viewmodels'),
    check: using(NETWORK, 'lib/agent-client.ts holds the calls'),
    bad: "const r = await fetch('/api/v1/render');",
    good: "// fetch( lives in the adapter\nconst s = 'fetch(';",
  },
  {
    name: 'components/chat and components/workspace views take props only: no ViewModel, no state, no effects',
    files: () =>
      [...sourcesIn('components/chat'), ...sourcesIn('components/workspace')].filter(
        (f) => !VIEW_HOOKS.has(f),
      ),
    check: all(
      importing(/(?:^|\/)viewmodels(?:\/|$)/, 'Workspace.tsx does the wiring'),
      using(/\buse(?:State|Reducer|Effect|LayoutEffect|Ref)\b/, 'a view holds nothing'),
    ),
    bad: "import { useMakeChat } from '../../viewmodels/useMakeChat.ts';",
    good: "// useState is not used\nconst s = 'useEffect';",
  },
  {
    name: 'nothing outside lab/ and app/lab reaches into lab/',
    files: () => [
      ...sourcesIn('lib'),
      ...sourcesIn('components'),
      ...sourcesIn('viewmodels'),
      ...sourcesIn('flower'),
      ...sourcesIn('app').filter((f) => !f.startsWith('app/lab/')),
    ],
    check: importing(/(?:^|\/)lab\//, 'the lab reaches out, nothing reaches in'),
    bad: "import { fakeRelations } from '../lab/flower/illustrative.ts';",
    good: "// lab/ is not imported\nconst s = '../lab/flower/illustrative.ts';",
  },
  {
    name: 'flower/ has no fetch( and does not reach for the adapter',
    files: () => sourcesIn('flower'),
    check: all(
      using(NETWORK, 'the flower is drawn from what it is handed'),
      importing(ADAPTER, 'the flower is drawn from what it is handed'),
    ),
    bad: "const r = await fetch('/api/v1/render');",
    good: "// no fetch( here\nconst s = 'fetch(';",
  },
];

describe('the layers', () => {
  test('the scan finds the sources', () => {
    expect(sourcesIn('lib')).toEqual(
      expect.arrayContaining(['lib/agent-client.ts', 'lib/thread.ts', 'lib/thread-view.ts']),
    );
    expect(sourcesIn('components')).toEqual(
      expect.arrayContaining([
        'components/Workspace.tsx',
        'components/chat/Thread.tsx',
        'components/workspace/FlowerPanel.tsx',
      ]),
    );
    expect(sourcesIn('viewmodels')).toEqual(
      expect.arrayContaining([
        'viewmodels/useMakeChat.ts',
        'viewmodels/useDrawnFlower.ts',
        'viewmodels/useWorkspace.ts',
        'viewmodels/useStage.ts',
      ]),
    );
    expect(sourcesIn('flower')).toEqual(
      expect.arrayContaining([
        'flower/InteractionSurface.tsx',
        'flower/FlowerCanvas.tsx',
        'flower/useFlowerCanvas.ts',
        'flower/scene.ts',
      ]),
    );
  });

  test.each(RULES)('$name', ({ files, check }) => {
    const hits = files().flatMap((f) => {
      const broke = check(readFileSync(join(WEB, f), 'utf8'));
      return broke ? [`${relative('.', f)}: ${broke}`] : [];
    });
    expect(hits).toEqual([]);
  });
});

describe('each rule catches what it says', () => {
  test.each(RULES)('$name', ({ check, bad, good }) => {
    expect(check(bad)).not.toBeNull();
    expect(check(good)).toBeNull();
  });

  test('the scanner keeps code and drops what only talks about it', () => {
    expect(code('a(\'fetch(\', "window"); b();')).toBe('a(\'\', ""); b();');
    expect(code('a(); // window\nb();')).toBe('a(); \nb();');
    expect(code('a(/* window */);')).toBe('a();');
    expect(code('const s = `it is window`; b();')).toBe('const s = ``; b();');
  });

  test('an apostrophe or a quote in a template or a regex neither hides code nor shows text', () => {
    const dom = using(DOM, 'x');
    expect(dom("const a = `don't`; const b = 'a document'; window.x;")).not.toBeNull();
    expect(dom("const a = `don't`; const b = 'a document';")).toBeNull();
    expect(dom("const r = /'/g; const b = 'a document';")).toBeNull();
    expect(dom("const r = /'/g; window.x;")).not.toBeNull();
    expect(dom("return /[/']/.test(s) ? 1 : window.x;")).not.toBeNull();
    // JSX text: the apostrophe costs its own line, not the file
    expect(dom("<p>don't</p>\nconst x = window.y;")).not.toBeNull();
  });

  test('an import is seen however it is written', () => {
    expect(importsOf("import x from 'a';")).toEqual(['a']);
    expect(importsOf("import type { X } from 'a';")).toEqual(['a']);
    expect(importsOf("import {\n  x,\n  y,\n} from 'a';")).toEqual(['a']);
    expect(importsOf("export { x } from 'a';")).toEqual(['a']);
    expect(importsOf("import 'a';")).toEqual(['a']);
    expect(importsOf("const x = await import('a');")).toEqual(['a']);
    expect(importsOf("const x = await import(/* webpackIgnore: true */ 'a');")).toEqual(['a']);
    expect(importsOf("// import x from 'a';")).toEqual([]);
  });

  test('every named exception still exists, so a stale one cannot hide a new file', () => {
    expect(sourcesIn('lib')).toEqual(
      expect.arrayContaining([
        ...MAY_CALL_THE_NETWORK,
        ...PROJECTION.filter((f) => f.startsWith('lib/')),
      ]),
    );
    expect(sourcesIn('components')).toEqual(expect.arrayContaining([...VIEW_HOOKS]));
  });
});
