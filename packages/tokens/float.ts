// The sizes of a box that floats over a canvas, moved and sized by hand. Only script reads them, and in
// every version, so they aren't CSS. They live here and not in source.ts because source.ts stays as it
// was tagged system-v1 (packages/tokens/test/versions.test.ts).
import { layout, sizes } from './source.ts';

export const floatBox = {
  /** Where a box starts: how wide, and its input's height, which fits a question and the run's line. */
  width: 480,
  'input-height': 216,
  /** Where the column of boxes stops above the window's bottom: the flower's small map has that corner. */
  floor: 168,
  /** The smallest a hand can make it, which still shows its bar and a line or two. */
  'min-width': 280,
  'min-height': 144,
  /** How far from the window's edge boxes start, and the space between one and the next. */
  inset: layout['Block gap'],
  gap: layout['Space 8'],
  /** A bar holds one mono line in a control's height, as the Terminal's does. */
  bar: sizes['Control height'],
} as const;
