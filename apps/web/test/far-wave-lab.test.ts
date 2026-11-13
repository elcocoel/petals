// The far wave and the lines are on every map: LandscapeCanvas draws them unless a page says otherwise.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const text = (f: string) => readFileSync(join(import.meta.dirname, '..', f), 'utf8');

describe('the far wave and the lines, on every map', () => {
  test('are what LandscapeCanvas draws by default', () => {
    expect(text('landscape/LandscapeCanvas.tsx')).toMatch(/far = 'wave',/);
    expect(text('landscape/LandscapeCanvas.tsx')).toMatch(/lines = 'focus',/);
  });

  test("every map takes its maps' own marks, its cards asked for with the map, not after it", () => {
    const land = text('landscape/land.ts');
    expect(land).toMatch(/marked\(landscapeOf\(night\), cards\)/);
    expect(land).toMatch(/const cards = mapList\(view\);\n\s+const night = await liveNight/);
    expect(land).toMatch(/const cards = mapList\(view\);\n\s+const live = await liveMap/);
  });
});
