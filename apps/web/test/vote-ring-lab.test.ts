// The vote ring is in /lab first (#93), on sample proposals until SYSTEMS's land: only the petal look's bench hands
// the canvas any, and every word on it says they're made up.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const WEB = join(import.meta.dirname, '..');
const text = (f: string) => readFileSync(join(WEB, f), 'utf8');

describe('the vote ring, in the lab only', () => {
  test('the sample is said to be a sample', () => {
    expect(text('lab/petal/sample-votes.ts')).toMatch(/^\/\/ SAMPLE ONLY/);
    expect(text('lab/petal/bench.ts')).toMatch(
      /Sample proposals and votes, made up to try the look/,
    );
  });

  test('only the bench gives the look its votes', () => {
    expect(text('lab/petal/bench.ts')).toMatch(/votes: \{/);
    expect(text('flower/scene.ts')).toMatch(/const votes = look\?\.votes;/);
  });
});
