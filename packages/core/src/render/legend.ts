// The legend in the render/v1 look: a swatch for each key the reading names, and the words this look
// adds to them. Every swatch here has a generated rule on the site (packages/tokens checks).
import type { BackerClass } from '../segments/backers.ts';
import type { LegendItem, Reading } from '../types/index.ts';
import { colourStyle, OUTLINE, SEGMENT_STYLE, TAIL_SWATCH } from './style.ts';

export function legendItem(item: Reading['legend'][number]): LegendItem {
  const { keys, ...rest } = item;
  if (!keys) return rest;
  const dressed = keys.map(({ key, label }) => {
    if (item.primitive === 'outline')
      return {
        swatch: 'var(--ink-2)',
        label: `${OUTLINE[key as keyof typeof OUTLINE]}: ${label}`,
      };
    if (item.primitive === 'segments')
      return { swatch: SEGMENT_STYLE[key as BackerClass].swatch, label };
    if (item.primitive === 'tail') return { swatch: TAIL_SWATCH, label };
    return { swatch: colourStyle(key).swatch, label };
  });
  return { ...rest, keys: dressed };
}
