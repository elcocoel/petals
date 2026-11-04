// T027: core stays pure (FR-023, renderer.md): no node: imports (fs, net, ...), no fetch, no
// clock, no randomness, no locale. A static scan of every source file, then a run of the whole
// pipeline with the clock, randomness and network booby-trapped.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { buildSpec } from '../src/convention/index.ts';
import { computeFigures } from '../src/figures/index.ts';
import { renderFlower } from '../src/render/index.ts';
import { snapshotSha256 } from '../src/tables.ts';
import { validateSnapshot, validateSpec } from '../src/validate/index.ts';
import { descriptorFor } from './descriptors.ts';
import { tinyBackers } from './load.ts';

const SRC = join(import.meta.dirname, '..', 'src');
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith('.ts') ? [join(dir, d.name)] : [],
  );

/** Source without comments and string contents, so a comment saying "fetch" does not count. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

const FORBIDDEN: [string, RegExp][] = [
  ['a node: import', /from\s+['"]node:|import\s*\(\s*['"]node:|require\s*\(/],
  ['fetch', /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/],
  ['the clock', /Date\.now|new\s+Date\b|performance\.now|process\.hrtime|setTimeout|setInterval/],
  ['randomness', /Math\.random|getRandomValues|randomUUID|randomBytes/],
  ['the locale', /toLocale\w*|localeCompare|\bIntl\./],
  ['the environment', /\bprocess\.|globalThis\.|\bwindow\.|\bdocument\./],
  ['dynamic import', /\bimport\s*\(/],
];

describe('static scan of packages/core/src', () => {
  const sources = files(SRC);

  test('finds the sources', () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  test.each(FORBIDDEN)('no %s', (_what, pattern) => {
    const hits = sources.flatMap((f) => {
      // node: imports are checked on raw import lines (the string stripping would hide them)
      const text = readFileSync(f, 'utf8');
      const scanned = pattern.source.includes('node:') ? text : code(text);
      return pattern.test(scanned) ? [relative(SRC, f)] : [];
    });
    expect(hits).toEqual([]);
  });

  test('imports only its own files and pure libraries', () => {
    const allowed = /^(\.{1,2}\/|@noble\/hashes\/|ajv|ajv-formats$|ajv\/|canonicalize$)/;
    const bad = sources.flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/^\s*(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/gm)]
        .map((m) => m[1] as string)
        .filter((spec) => !allowed.test(spec))
        .map((spec) => `${relative(SRC, f)}: ${spec}`),
    );
    expect(bad).toEqual([]);
  });
});

describe('the pipeline runs with the clock, randomness and network trapped', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('validate, count, propose, validate, render: same bytes, nothing touched', () => {
    const trap = (what: string) => () => {
      throw new Error(`core touched ${what}`);
    };
    const RealDate = Date;
    vi.spyOn(Math, 'random').mockImplementation(trap('Math.random'));
    vi.spyOn(Date, 'now').mockImplementation(trap('Date.now'));
    vi.stubGlobal('fetch', trap('fetch'));
    vi.stubGlobal(
      'Date',
      new Proxy(RealDate, {
        construct: trap('new Date()') as unknown as ProxyHandler<DateConstructor>['construct'],
      }),
    );
    vi.stubGlobal('Intl', new Proxy({}, { get: trap('Intl') }));

    const s = structuredClone(tinyBackers()); // fresh object: no memoised tables
    expect(validateSnapshot(s).ok).toBe(true);
    const d = descriptorFor(s);
    const sha = snapshotSha256(s);
    computeFigures(s, { measure: 'validator_stake_current_epoch' });
    const { spec } = buildSpec(
      { network: d.id, sha256: sha, choices: { segments: 'backers', petals: 5 } },
      d,
      s,
    );
    expect(validateSpec(spec, { snapshot: s, capabilities: d.capabilities }).valid).toBe(true);
    const a = renderFlower(spec, s);
    const b = renderFlower(spec, structuredClone(s));
    expect(b.svg).toBe(a.svg);
    expect(b.render_sha256).toBe(a.render_sha256);
  });
});
