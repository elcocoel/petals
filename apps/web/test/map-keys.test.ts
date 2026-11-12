// Elco, 12 Nov: "I have a drop down to say what color means and then the legend tells me what each color is". On the
// map a value has one colour on every flower (core mapKeys), and the map's legend lists what each colour stands for.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const text = (f: string) => readFileSync(join(import.meta.dirname, '..', f), 'utf8');

test("the map's keys are ranked once and used by every flower, its far shape and the legend", () => {
  const canvas = text('landscape/LandscapeCanvas.tsx');
  expect(canvas).toMatch(
    /const mapKeyed = useMemo\(\(\) => mapKeys\(data\.flowers\.map\(\(f\) => f\.reading\.petals\)\), \[data\]\);/,
  );
  expect(canvas).toMatch(
    /keys=\{inFlower \? flowerKeys\(inFlower\.reading\.petals, mapKeyed\) : keyLines\(mapKeyed\)\}/,
  );
  expect(text('landscape/useLandscape.ts')).toMatch(
    /\.\.\.lookFills\(f\.model\.petals, data\.keyed\),/,
  );
  expect(text('landscape/scene.ts')).toMatch(/const fills = waveFills\(f\.model, keyed\);/);
});
