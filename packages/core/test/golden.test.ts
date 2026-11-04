// T031: golden renders (SC-005). Each case is compared byte for byte with fixtures/golden/<name>.svg
// and its legend and petals with <name>.json. `pnpm golden:update` rewrites them; a person reviews
// the diff. A second check renders each twice in this process and once in a fresh process.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { specHash } from '../src/hash.ts';
import { GOLDEN_CASES, renderGolden } from './golden-cases.ts';
import { FIXTURES, REPO } from './load.ts';

const DIR = join(FIXTURES, 'golden');
const UPDATE = process.env.PETAL_GOLDEN_UPDATE === '1';

function goldenJson(name: string, r: ReturnType<typeof renderGolden>): string {
  const doc = {
    name,
    spec_sha256: specHash(r.spec),
    render_sha256: r.result.render_sha256,
    spec: r.spec,
    legend: r.result.legend,
    petals: r.result.petals,
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

describe('golden flowers', () => {
  test.each(GOLDEN_CASES.map((c) => [c.name, c] as const))('%s', (name, c) => {
    const r = renderGolden(c);
    const svgFile = join(DIR, `${name}.svg`);
    const jsonFile = join(DIR, `${name}.json`);
    if (UPDATE) {
      mkdirSync(DIR, { recursive: true });
      writeFileSync(svgFile, r.result.svg);
      writeFileSync(jsonFile, goldenJson(name, r));
    }
    expect(existsSync(svgFile), `${svgFile} missing: run pnpm golden:update`).toBe(true);
    expect(r.result.svg).toBe(readFileSync(svgFile, 'utf8'));
    expect(goldenJson(name, r)).toBe(readFileSync(jsonFile, 'utf8'));
  });
});

describe('determinism (SC-005)', () => {
  const inProcess = Object.fromEntries(
    GOLDEN_CASES.map((c) => {
      const r = renderGolden(c);
      return [c.name, { spec_sha256: specHash(r.spec), render_sha256: r.result.render_sha256 }];
    }),
  );

  test('twice in one process: the same hashes', () => {
    for (const c of GOLDEN_CASES) {
      const again = renderGolden(c);
      expect(again.result.render_sha256).toBe(inProcess[c.name]?.render_sha256);
      expect(specHash(again.spec)).toBe(inProcess[c.name]?.spec_sha256);
    }
  });

  test('a fresh process gives the same hashes', () => {
    const out = execFileSync(
      process.execPath,
      [join(REPO, 'packages', 'core', 'scripts', 'render-fixture.ts'), '--hashes'],
      { cwd: REPO, encoding: 'utf8' },
    );
    expect(JSON.parse(out)).toEqual(inProcess);
  }, 30_000);
});
