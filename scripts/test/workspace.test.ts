// Workspace conventions (T002–T009): every package is MIT, ESM, and exports TypeScript sources;
// the repo pins Node 24; the fixture budget check measures what it says.
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { checkBudget, measureFixtures } from '../check-fixture-size.ts';

const root = join(import.meta.dirname, '..', '..');
const readJson = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const workspaces = ['packages', 'apps'].flatMap((dir) =>
  readdirSync(join(root, dir), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `${dir}/${d.name}`),
);

describe('workspace', () => {
  test('Node 24 is pinned', () => {
    expect(readFileSync(join(root, '.nvmrc'), 'utf8').trim()).toMatch(/^24\./);
    expect(readJson('package.json').engines.node).toBe('>=24 <25');
    expect(process.version).toMatch(/^v24\./);
  });

  test('the root is private, ESM and MIT', () => {
    const pkg = readJson('package.json');
    expect(pkg).toMatchObject({ private: true, type: 'module', license: 'MIT' });
    expect(readFileSync(join(root, 'LICENSE'), 'utf8')).toContain(
      'Copyright (c) 2026 Felipe Duarte (Elco Coel)',
    );
  });

  test.each(workspaces)('%s is a private MIT ESM package named @petal/*', (dir) => {
    const pkg = readJson(`${dir}/package.json`);
    expect(pkg.name).toMatch(/^@petal\/[a-z-]+$/);
    expect(pkg).toMatchObject({ private: true, type: 'module', license: 'MIT' });
  });

  test.each(workspaces.filter((d) => readJson(`${d}/package.json`).exports))(
    '%s exports TypeScript sources',
    (dir) => {
      const { exports } = readJson(`${dir}/package.json`);
      expect(exports['.']).toBe('./src/index.ts');
      for (const [key, target] of Object.entries(exports)) {
        if (key !== './package.json') expect(target).toMatch(/^\.\/src\/.+\.ts$/);
      }
    },
  );
});

describe('fixture budget', () => {
  test('counts .gz files as stored and gzips the rest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'petal-fixtures-'));
    const text = 'petal '.repeat(10_000);
    writeFileSync(join(dir, 'a.json'), text);
    writeFileSync(join(dir, 'b.json.gz'), gzipSync(text));
    const sizes = measureFixtures(dir);
    expect(sizes.map((s) => s.file)).toEqual(['a.json', 'b.json.gz']);
    expect(sizes[0]?.bytes).toBe(text.length);
    expect(sizes[0]?.gz_bytes).toBeLessThan(1_000);
    expect(checkBudget(sizes).ok).toBe(true);
    expect(checkBudget(sizes, 10).ok).toBe(false);
    expect(checkBudget(sizes, 5_000_000, 10).ok).toBe(false);
  });
});
