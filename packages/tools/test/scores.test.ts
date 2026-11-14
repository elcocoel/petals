// The qualifier's readings are kept by what was read: the same words for the same statement are read once.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { keptScore } from '../src/scores.ts';

describe('kept scores', () => {
  test('a reading is read once and kept; other words, another statement or another model read again', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'petal-scores-'));
    let reads = 0;
    const read = (v: number) => async () => {
      reads++;
      return v;
    };
    expect(await keptScore(dir, 'm', 'A record names Ada', ['Ada Pool'], read(0.9))).toBe(0.9);
    expect(await keptScore(dir, 'm', 'A record names Ada', ['Ada Pool'], read(0.1))).toBe(0.9);
    expect(reads).toBe(1);
    expect(await keptScore(dir, 'm', 'A record names Ada', ['Ada'], read(0.5))).toBe(0.5);
    expect(await keptScore(dir, 'm', 'A record names Bo', ['Ada Pool'], read(0.4))).toBe(0.4);
    expect(await keptScore(dir, 'n', 'A record names Ada', ['Ada Pool'], read(0.3))).toBe(0.3);
    expect(reads).toBe(4);
  });
});
