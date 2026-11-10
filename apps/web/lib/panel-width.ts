// How wide the side panel may be (design/side-panel.md, lines 16 to 19): from its designed width, the
// tokens' Sidebar width, to twice that, the default being the designed one. Pure.
import { sizes } from '@petal/tokens';

export const PANEL_WIDTH = {
  usual: sizes['Sidebar width'],
  least: sizes['Sidebar width'],
  most: 2 * sizes['Sidebar width'],
} as const;

/** A width the panel can have: a number, rounded, within its bounds; anything else is the usual one. */
export function panelWidth(asked: unknown): number {
  const n = typeof asked === 'number' ? asked : Number.parseFloat(String(asked));
  if (!Number.isFinite(n)) return PANEL_WIDTH.usual;
  return Math.round(Math.min(PANEL_WIDTH.most, Math.max(PANEL_WIDTH.least, n)));
}
