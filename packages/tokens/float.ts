// The sizes of a box that floats over a canvas, moved and sized by hand. Only script reads them, and in
// every version, so they aren't CSS. They live here and not in source.ts because source.ts stays as it
// was tagged system-v1 (packages/tokens/test/versions.test.ts).
import { layout, sizes } from './source.ts';

export const floatBox = {
  /** Where a box starts: how wide. */
  width: 480,
  /**
   * The conversation's foot, the dark base its input is: where it starts, a few lines
   * of the field over its controls and the run's line, and the least a hand can make it, one line and its
   * controls. The field fills the base, so a taller base is a taller field.
   */
  'base-height': 184,
  'base-min-height': 120,
  /** A recorded run's base: its saved question is long, and the button to play it stays in sight. */
  'recorded-base-height': 392,
  /** The flower's own box, on the right: wide enough to read a petal, tall enough for the rest. */
  'panel-width': 440,
  'panel-height': 640,
  /** The list of conversations, beside the output: wide enough for a question's first words. */
  'list-width': 320,
  /** What can be picked, beside the input: wide enough for a model's line. */
  'options-width': 440,
  'options-height': 456,
  /** Where the column of boxes stops above the window's bottom: the flower's small map has that corner. */
  floor: 168,
  /** The smallest a hand can make it, which still shows its bar and a line or two. A sheet over a base, too. */
  'min-width': 280,
  'min-height': 144,
  /** How far from the window's edge boxes start, and the space between one and the next. */
  inset: layout['Block gap'],
  gap: layout['Space 8'],
  /** A bar holds one mono line in a control's height, as the Terminal's does. */
  bar: sizes['Control height'],
} as const;
