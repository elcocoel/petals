// T027: core stays pure (FR-023, renderer.md): no node: imports (fs, net, ...), no fetch, no
// clock, no randomness, no locale. A static scan of every source file, then a run of the whole
// pipeline with the clock, randomness and network booby-trapped.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  applyPolicy,
  claimerRecord,
  claimsFromMap,
  DEFAULT_LENS,
  observedClaims,
  validateClaim,
} from '../src/claims/index.ts';
import { buildSpec } from '../src/convention/index.ts';
import { computeFigures } from '../src/figures/index.ts';
import { readFlower, readingHash } from '../src/reading/index.ts';
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
    expect(sources.map((f) => relative(SRC, f))).toEqual(
      expect.arrayContaining([
        'reading/index.ts',
        'reading/encodings.ts',
        'reading/legend.ts',
        'claims/index.ts',
        'claims/observed.ts',
        'claims/policy.ts',
        'claims/validate.ts',
      ]),
    );
  });

  test('the claims know nothing of a drawing or a reading', () => {
    const bad = sources
      .filter((f) => relative(SRC, f).startsWith('claims/'))
      .filter((f) => /from\s+['"][^'"]*(render|reading)\//.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(bad).toEqual([]);
  });

  test('the reading knows nothing of a drawing: reading/ imports nothing from render/', () => {
    const bad = sources
      .filter((f) => relative(SRC, f).startsWith('reading/'))
      .filter((f) => /from\s+['"][^'"]*render\//.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(bad).toEqual([]);
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
    expect(readingHash(readFlower(spec, structuredClone(s)))).toBe(
      readingHash(readFlower(spec, s)),
    );

    // Everything is a claim: read, check, derive and apply a lens, with all of the above trapped.
    const claims = observedClaims(s);
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.every((c) => validateClaim(c).ok)).toBe(true);
    const shown = applyPolicy(claims, DEFAULT_LENS);
    expect(applyPolicy(claims, DEFAULT_LENS)).toEqual(shown);
    expect(claimerRecord(claims, 'tool:petal/observed-claims@1').claims).toBe(shown.length);
    const key = 'petal/v1/label/near:testnet/tern.pool.example.testnet';
    const label = {
      tag: 'identity',
      status: 'verified',
      evidence: [{ url: 'https://example.org/post' }],
      written_at: '2026-11-05T10:00:00Z',
    };
    const row = {
      key,
      value: label,
      writer: 'petals-writer.testnet',
      receiver: 'petals.testnet',
      tx_hash: 'tx',
      block_height: 1,
      block_timestamp: 1,
    };
    expect(claimsFromMap([row]).claims).toHaveLength(1);
  });
});
