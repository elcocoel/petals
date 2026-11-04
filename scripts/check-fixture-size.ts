// Fixture budget (T007): every file under fixtures/ is at most 5 MB gzipped, and all of them
// together at most 25 MB gzipped. A .gz file counts as its size on disk; anything else is
// gzipped in memory to measure it. MB here is 1,000,000 bytes (the stricter reading).
//   node scripts/check-fixture-size.ts [dir]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

export const LIMIT_EACH = 5_000_000;
export const LIMIT_TOTAL = 25_000_000;

export interface FixtureSize {
  file: string;
  bytes: number;
  gz_bytes: number;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    return d.isDirectory() ? walk(p) : d.isFile() ? [p] : [];
  });
}

export function measureFixtures(dir: string): FixtureSize[] {
  return walk(dir)
    .sort()
    .map((p) => {
      const bytes = statSync(p).size;
      const gz_bytes = p.endsWith('.gz') ? bytes : gzipSync(readFileSync(p), { level: 9 }).length;
      return { file: relative(dir, p), bytes, gz_bytes };
    });
}

export function checkBudget(sizes: FixtureSize[], each = LIMIT_EACH, total = LIMIT_TOTAL) {
  const over = sizes.filter((s) => s.gz_bytes > each);
  const sum = sizes.reduce((a, s) => a + s.gz_bytes, 0);
  return { ok: over.length === 0 && sum <= total, over, total_gz_bytes: sum };
}

if (import.meta.main) {
  const dir = process.argv[2] ?? join(import.meta.dirname, '..', 'fixtures');
  const sizes = measureFixtures(dir);
  const r = checkBudget(sizes);
  const mb = (n: number) => (n / 1e6).toFixed(2);
  for (const s of r.over)
    console.error(`fixture over 5 MB gzipped: ${s.file} (${mb(s.gz_bytes)} MB)`);
  if (r.total_gz_bytes > LIMIT_TOTAL)
    console.error(`fixtures over 25 MB gzipped in total: ${mb(r.total_gz_bytes)} MB`);
  const largest = [...sizes].sort((a, b) => b.gz_bytes - a.gz_bytes)[0];
  console.log(
    `fixtures: ${sizes.length} files, ${mb(r.total_gz_bytes)} MB gzipped in total` +
      (largest ? `, largest ${largest.file} ${mb(largest.gz_bytes)} MB` : ''),
  );
  process.exit(r.ok ? 0 : 1);
}
