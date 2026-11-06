// T198: pnpm relations:rebuild says what it read, how many rows, how long it took, and that deleting
// the index lost nothing.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const SCRIPT = join(import.meta.dirname, '../relations-rebuild.ts');

function rebuild(stateDir: string) {
  return spawnSync(process.execPath, [SCRIPT], {
    env: { ...process.env, PETAL_STATE_DIR: stateDir, NODE_NO_WARNINGS: '1' },
    encoding: 'utf8',
  });
}

// Two real processes: about 2.3 s alone, past the default 5 s when the whole suite shares a busy machine.
test('prints plain lines, and a second run says it changed nothing', { timeout: 30_000 }, () => {
  const stateDir = mkdtempSync(join(tmpdir(), 'petal-relations-script-'));
  const first = rebuild(stateDir);
  expect(first.status).toBe(0);
  expect(existsSync(join(stateDir, 'index.db'))).toBe(true);
  expect(first.stdout).toMatch(/^Reading snapshots from /m);
  expect(first.stdout).toMatch(/NEAR validators \(near-validators\): 438 groups, [\d,]+ rows, /);
  expect(first.stdout).toMatch(/^Read \d+ snapshots: [\d,]+ groups at [\d,]+ dates, /m);
  expect(first.stdout).toMatch(/^Derived [\d,]+ adjacency rows and [\d,]+ group overlaps\.$/m);
  expect(first.stdout).toMatch(/^Wrote .*index\.db: [\d.]+ MB, in [\d,]+ ms\.$/m);
  expect(first.stdout).toMatch(/No earlier index to compare\.$/m);

  const second = rebuild(stateDir);
  expect(second.status).toBe(0);
  expect(second.stdout).toMatch(/^Deleted .*index\.db \([\d.]+ MB\)\.$/m);
  expect(second.stdout).toMatch(/the same as the deleted index\.$/m);
});
