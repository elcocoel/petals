// The vote ring is in /lab first (#93), on NEAR's Marketing DAO as SYSTEMS reads it: only the petal look's bench
// hands the canvas any votes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const WEB = join(import.meta.dirname, '..');
const text = (f: string) => readFileSync(join(WEB, f), 'utf8');

describe('the vote ring, in the lab only', () => {
  test('only the bench gives the look its votes, from the real proposals', () => {
    expect(text('lab/petal/votes.ts')).toMatch(/\/api\/v1\/maps\/\$\{at\}\/proposals/);
    expect(text('flower/scene.ts')).toMatch(/const votes = look\?\.votes;/);
  });
});
