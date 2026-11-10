// What a petal is painted with (specs/006-the-map, milestone 3): its colour from the reading, by render/v1's
// palette (style.ts), and the tail's tone for "everyone else". The live flower and the still picture paint
// alike, so the same flower looks the same everywhere. The values are CSS custom properties: the site's
// tokens define them in a page, and a still picture's own <style> defines them in the picture.
import type { ReadingPetal } from '../../types/index.ts';
import { colourStyle, TAIL_SWATCH } from '../style.ts';

/**
 * A still picture defines `--k-pool` and the rest in its own <style>; a page defines the same colours as
 * the site's chart tokens, `--chart-k-pool` and the rest. So a paint names the first, falling back to the
 * second, and reads right in both.
 */
const inEither = (swatch: string): string =>
  swatch.replace(/^var\(--([\w-]+)\)$/, 'var(--$1, var(--chart-$1))');

export const paintOf = (p: Pick<ReadingPetal, 'colour' | 'tail'>): string =>
  inEither(p.tail ? TAIL_SWATCH : colourStyle(p.colour).swatch);
