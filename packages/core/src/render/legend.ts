// The legend in the render/v1 look: a swatch for each key the reading names, and the words this look
// adds to them. Every swatch here has a generated rule on the site (packages/tokens checks). Handed the art
// direction's colours (wedge/keys.ts lookFills, since 11 Nov), each swatch is the key its value is painted in:
// a banded flower's kinds have none (its petals are grey and its bands keyed), everyone else is grey.
import type { BackerClass } from '../segments/backers.ts';
import type { LegendItem, Reading } from '../types/index.ts';
import { colourStyle, keyStyle, OUTLINE, SEGMENT_STYLE, TAIL_SWATCH } from './style.ts';
import { GREY } from './wedge/keys.ts';

/** The art direction's colours, as lookFills hands them: by kind and by band class. */
export interface LegendLook {
  kinds: Record<string, string>;
  bands: Record<string, string>;
}

export function legendItem(item: Reading['legend'][number], look?: LegendLook): LegendItem {
  const { keys, ...rest } = item;
  if (!keys) return rest;
  if (look) {
    if (item.primitive === 'colour' && Object.keys(look.kinds).length === 0) return rest;
    const paint = (hex: string | undefined) => keyStyle(hex ?? GREY.hex).swatch;
    return {
      ...rest,
      keys: keys.map(({ key, label }) => {
        if (item.primitive === 'outline')
          return {
            swatch: 'var(--ink-2)',
            label: `${OUTLINE[key as keyof typeof OUTLINE]}: ${label}`,
          };
        if (item.primitive === 'segments') return { swatch: paint(look.bands[key]), label };
        if (item.primitive === 'tail') return { swatch: paint(GREY.hex), label };
        return { swatch: paint(look.kinds[key]), label };
      }),
    };
  }
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
