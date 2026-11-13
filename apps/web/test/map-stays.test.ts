// The legends switch live and the map adapts. The legend's choice brings the map's data again in the new view;
// the scene is built again where you were, at the same zoom and place and inside the flower you were in, not from
// the map's home.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const hook = readFileSync(join(import.meta.dirname, '..', 'landscape', 'useLandscape.ts'), 'utf8');

test('new data on the same page keeps the camera and the flower you were in', () => {
  expect(hook).toMatch(/const kept = useRef<Kept \| null>\(null\);/);
  // kept when the scene is taken down, once it has drawn
  expect(hook).toMatch(
    /if \(frames > 0\) \{\s+kept\.current = \{\s+view: \{ k: cam\.k, x: cam\.x, y: cam\.y \}/,
  );
  // and put back at once on the same page, before the page's own flower would fly there again
  expect(hook).toMatch(
    /if \(was && was\.focus === focusId && was\.layout === data\.layout\) \{[\s\S]*?flyTo\(\s+cam,\s+moved && from[\s\S]*?: was\.view,\s+\);/,
  );
  expect(hook.indexOf('was.focus === focusId')).toBeLessThan(hook.indexOf('enterFlower(focus);'));
});
