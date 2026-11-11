// The far wave (#84) and the lines lean (#87) are on every map since 11 Nov (Elco: "let's get all the things that
// are in lab into the systems, and into prod"): LandscapeCanvas draws them unless a page says otherwise.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const text = (f: string) => readFileSync(join(import.meta.dirname, '..', f), 'utf8');

describe('the far wave and the lines, on every map', () => {
  test('are what LandscapeCanvas draws by default', () => {
    expect(text('landscape/LandscapeCanvas.tsx')).toMatch(/far = 'wave',/);
    expect(text('landscape/LandscapeCanvas.tsx')).toMatch(/lines = 'focus',/);
  });

  test("every map takes its maps' own marks", () => {
    expect(text('landscape/land.ts')).toMatch(/marked\(landscapeOf\(night\), view\)/);
  });
});
