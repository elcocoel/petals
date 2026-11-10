// The sizes of a box that floats over a canvas, moved and sized by hand. Only script reads them, and in
// every version, so they aren't CSS. They live here and not in source.ts because source.ts stays as it
// was tagged system-v1 (packages/tokens/test/versions.test.ts).
import { layout, sizes } from './source.ts';

export const floatBox = {
  /**
   * Where a box starts: how wide, and its input's height, which fits a question, its pill and the run's line.
   * The height holds the Ask box grown to its most (Ask box max height, 200) with its controls and padding,
   * under the bar, so a long message never hides its first lines under the bar (design/minimally-good.md,
   * rule 7; 264 did, 10 Nov).
   */
  width: 480,
  'input-height': 344,
  /** A recorded run's input: its saved question is long, and the button to play it stays in sight. */
  'recorded-input-height': 392,
  /** The flower's own box, on the right: wide enough to read a petal, tall enough for the rest. */
  'panel-width': 440,
  'panel-height': 640,
  /** The terminal in the page (specs/004-workspace, W10): wide enough for an agent's own screen, about 90 columns. */
  'terminal-width': 760,
  /** The list of conversations, beside the output: wide enough for a question's first words. */
  'list-width': 320,
  /** What can be picked, beside the input: wide enough for a model's line. */
  'options-width': 440,
  'options-height': 456,
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
