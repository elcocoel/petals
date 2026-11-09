// The terminal in the page (specs/004-workspace, W10) in Petals' look, after the illustrated terminal on
// the builders' band that Elco liked: the ink surface, Mono code type, Mint for what the agent marks.
// Colours are roles, not values, so the terminal follows its box's surface and every version. Only script
// reads this: the terminal renderer takes a theme object, not CSS.
import type { Role } from './source.ts';

/** The type the terminal is set in: Petals / Mono code (15 on 24). */
export const terminalType = 'Mono code';

/** The surface its box sits on, as the builders' band does. */
export const terminalSurface = 'ink';

/** A thin bar, blinking, in the accent. */
export const terminalCursor = { style: 'bar', blink: true } as const;

/**
 * The renderer's theme, key by key. The 16 colours an agent can ask for map onto Petals' four primitives
 * through their roles. Petals has no red, yellow, blue or magenta, so those stay the renderer's own until
 * Elco chooses (design/journey-strings.md, "The terminal in the page").
 */
export const terminalTheme = {
  background: 'surface',
  foreground: 'text-primary',
  cursor: 'accent',
  cursorAccent: 'surface',
  selectionBackground: 'hairline',
  black: 'surface',
  brightBlack: 'text-muted',
  white: 'text-primary',
  brightWhite: 'text-primary',
  green: 'accent',
  brightGreen: 'accent',
  cyan: 'accent',
  brightCyan: 'accent',
} as const satisfies Record<string, Role>;
