// The one source of every design value (T175). `emit.ts` turns it into CSS; nothing else is edited.
// Keys are Figma's names, so an agent can hold this file next to Figma (file "Petals", collection
// "Petals · brand", local text styles) and compare by eye. Values read on 2026-11-05.
// Code uses roles (--text-primary, text-primary), never primitives.

/** Figma: Ink, Gray, Mint, Ground. */
export const primitives = {
  Ink: '#171717',
  Gray: '#C7C7C7',
  Mint: '#8BC9BD',
  Ground: '#FFFFFF',
} as const;

export type Primitive = keyof typeof primitives;
export type Paint = Primitive | { of: Primitive; alpha: number };

export const surfaceNames = ['ground', 'ink', 'mint'] as const;
export type SurfaceName = (typeof surfaceNames)[number];

/** What one `data-surface` attribute flips. Every surface sets every role. */
export interface Roles {
  surface: Paint;
  /** Words, the lines in a drawing, and the wordmark's front layer. */
  'text-primary': Paint;
  'text-muted': Paint;
  /** A quiet rule, a starter question's border, and the rail behind the workspace. */
  hairline: Paint;
  'action-background': Paint;
  'action-text': Paint;
  /** The arrow inside an action. Plain accent would vanish: Mint on Mint on ink, Ink on Ink on mint. */
  'action-accent': Paint;
  accent: Paint;
  /** A drawing's quiet petals and the wordmark's middle layer. */
  'figure-petal': Paint;
  /** Mint on every surface, so on mint it vanishes, as the closing section's cell does (66:2345). */
  'figure-accent': Paint;
}
export type Role = keyof Roles;

export const surfaces: Record<SurfaceName, Roles> = {
  ground: {
    surface: 'Ground',
    'text-primary': 'Ink',
    'text-muted': { of: 'Ink', alpha: 0.6 },
    hairline: 'Gray',
    'action-background': 'Ink',
    'action-text': 'Ground',
    'action-accent': 'Mint',
    accent: 'Mint',
    'figure-petal': 'Gray',
    'figure-accent': 'Mint',
  },
  ink: {
    surface: 'Ink',
    'text-primary': 'Ground',
    'text-muted': { of: 'Ground', alpha: 0.7 },
    hairline: { of: 'Ground', alpha: 0.3 },
    'action-background': 'Mint',
    'action-text': 'Ink',
    'action-accent': 'Ink',
    accent: 'Mint',
    'figure-petal': 'Gray',
    'figure-accent': 'Mint',
  },
  mint: {
    surface: 'Mint',
    'text-primary': 'Ink',
    'text-muted': { of: 'Ink', alpha: 0.7 },
    hairline: { of: 'Ink', alpha: 0.4 },
    'action-background': 'Ink',
    'action-text': 'Ground',
    'action-accent': 'Mint',
    accent: 'Ink',
    'figure-petal': 'Gray',
    'figure-accent': 'Mint',
  },
};

/** The Tailwind colour name of each role: bg-action, text-on-action, border-hairline. */
export const roleUtilities: Record<Role, string> = {
  surface: 'surface',
  'text-primary': 'primary',
  'text-muted': 'muted',
  hairline: 'hairline',
  'action-background': 'action',
  'action-text': 'on-action',
  'action-accent': 'action-accent',
  accent: 'accent',
  'figure-petal': 'figure-petal',
  'figure-accent': 'figure-accent',
};

/**
 * Checked at body-text contrast, on every surface unless the pair names the ones it's drawn on. Hairlines
 * and the figures are decoration, not text, so they aren't pairs.
 */
export const contrastMinimum = 4.5;
export const contrastPairs: readonly { text: Role; on: Role; surfaces?: readonly SurfaceName[] }[] =
  [
    { text: 'text-primary', on: 'surface' },
    { text: 'text-muted', on: 'surface' },
    { text: 'action-text', on: 'action-background' },
    { text: 'action-accent', on: 'action-background' },
    // The workspace's rail, which is only ever on ground.
    { text: 'text-primary', on: 'hairline', surfaces: ['ground'] },
    // The mono line above For Builders' heading, the one place accent is words.
    { text: 'accent', on: 'surface', surfaces: ['ink'] },
  ];

/**
 * The ladder: every gap, inset and padding is one of these nine. Nothing else makes space. `0` isn't a
 * step: clearing Tailwind's numeric scale takes zero with it, and m-0, min-h-0, inset-0 and px-0 read it.
 */
export const layout = {
  '0': 0,
  'Space 4': 4,
  'Space 8': 8,
  'Text gap': 12,
  'Space 16': 16,
  'Block gap': 24,
  'Space 32': 32,
  'Column gap': 48,
  'Page inset': 72,
  'Section padding': 112,
} as const;

/** The size of a thing, not the space around it. Pixels. All of them become utilities: h-control-height. */
export const sizes = {
  'Control height': 48,
  /** How far a question grows before the box scrolls. */
  'Ask box max height': 200,
  'Content width': 960,
  'Page width': 1440,
  /** The four sizes a drawing comes in. */
  'Drawing 48': 48,
  'Drawing 72': 72,
  'Drawing 144': 144,
  'Drawing 240': 240,
  /** The box around a picture: a step's and a gallery card's. Drawing 240 with Block gap above and below. */
  'Figure height': 288,
  'Icon size': 18,
} as const;

/**
 * Not the system: structural sizes only the workspace and the old pages use, kept apart so they aren't
 * counted as design decisions. They still become utilities. The surfaces stage decides each one.
 */
export const quarantine = {
  'Workspace header height': 80,
  'Workspace rule': 20,
  'Rail width': 180,
  'Conversation width': 580,
  'Panel width': 680,
  'Detail height': 117,
  'Swatch size': 9,
  'Cell small': 16.72,
  'Cell medium': 27.28,
  'Cell large': 40.48,
  'Stage height': 280,
  'Turn flower thumb': 48,
  'Tile width': 280,
  'Flower width': 640,
  'Gallery flower width': 320,
} as const;

/**
 * How a split section divides the page, in twelfths: the text takes this many and the figure the rest,
 * with Column gap between. Change it and every split section moves.
 */
export const splitText = 5;

/** A real control drawn inside a figure, at this scale, so it follows the type and the ladder. */
export const figureScale = 0.56;

/** Every line's width in pixels: borders, outlines, drawings, icons. A heavy line or a focus ring is twice it. */
export const stroke = 1;

export const cornerRadius = 0;

/** Something switched off or set back, something under the pointer, and a drawing's faint lines. */
export const opacity = { inactive: 0.5, hover: 0.85, 'figure-line': 0.4 } as const;

/**
 * Not from Figma, which has one frame width: Tailwind's own three, under the same names, and `wide`,
 * where the workspace's columns sit side by side instead of stacking.
 */
export const breakpoints = { sm: 640, md: 768, wide: 900, lg: 1024 } as const;

/** `variable` is what next/font sets in apps/web/app/layout.tsx. Figma: Type/Reading family. */
export const fonts = {
  sans: { family: 'Mona Sans', variable: '--font-mona-sans', fallback: 'system-ui, sans-serif' },
  mono: { family: 'Geist Mono', variable: '--font-geist-mono', fallback: 'monospace' },
  pixel: { family: 'Bitcount Grid Single', variable: '--font-bitcount', fallback: 'monospace' },
} as const;

export interface TypeStyle {
  font: keyof typeof fonts;
  size: number;
  line: number;
  weight: number;
  /** In em: Figma's -2% is -0.02. */
  tracking: number;
  /** Variable font axes, where the style sets them. */
  axes?: Record<string, number>;
}

/**
 * Figma: Petals / <name>. Mono and Mono code consolidate Figma's nine loose Geist Mono sizes.
 * Text case is written in the copy, never transformed.
 */
export const type = {
  Display: { font: 'sans', size: 88, line: 90, weight: 600, tracking: -0.02 },
  'Display compact': { font: 'sans', size: 64, line: 68, weight: 600, tracking: -0.02 },
  Title: { font: 'sans', size: 44, line: 50, weight: 600, tracking: 0 },
  Heading: { font: 'sans', size: 28, line: 34, weight: 600, tracking: 0 },
  Lead: { font: 'sans', size: 22, line: 31, weight: 400, tracking: 0 },
  Body: { font: 'sans', size: 18, line: 27, weight: 400, tracking: 0 },
  Label: { font: 'sans', size: 16, line: 22, weight: 500, tracking: 0 },
  Caption: { font: 'sans', size: 14, line: 20, weight: 500, tracking: 0 },
  /** Every small mono line: an eyebrow, a caption, a note, an index. */
  Mono: { font: 'mono', size: 11, line: 16, weight: 400, tracking: 0.04 },
  'Mono code': { font: 'mono', size: 15, line: 24, weight: 400, tracking: 0 },
  /** The step numbers (66:2275): Bitcount Grid Single with its axes at rest. */
  'Pixel numeral': {
    font: 'pixel',
    size: 64,
    line: 68,
    weight: 400,
    tracking: 0,
    axes: { CRSV: 0, ELSH: 0, ELXP: 0 },
  },
} as const satisfies Record<string, TypeStyle>;

/** Figma: Petals / Wordmark, 12:12. Three layers of live text at one origin, back to front. */
export const wordmark = {
  layers: {
    back: { CRSV: 0.11, ELSH: 81, ELXP: 0, slnt: -8, wght: 358 },
    middle: { CRSV: 0.11, ELSH: 50, ELXP: 90, slnt: -8, wght: 358 },
    front: { CRSV: 0.5, ELSH: 17, ELXP: 63, slnt: -8, wght: 337 },
  },
  /** The role that paints each layer. */
  roles: { back: 'figure-accent', middle: 'figure-petal', front: 'text-primary' },
  /** Font size in pixels. Display is the component's own size, the others those in the page frames. */
  sizes: { Nav: 36.67, Footer: 155.56, Workspace: 33.18, Display: 269.722 },
} as const;

/**
 * Chart colours. The first twelve are the renderer's light values (packages/core render/style.ts),
 * which page CSS overrides by name, so a flower's colours move from here without changing its
 * hashed bytes. The renderer's own --ink follows --text-primary instead.
 */
export const chart = {
  'ink-2': '#52514e',
  hair: '#e1e0d9',
  unknown: '#c9c7bf',
  tail: '#b8b6ae',
  'k-pool': '#2a78d6',
  'k-exchange': '#eb6834',
  'k-entity': '#1baf7a',
  'k-custodian': '#eda100',
  'k-contract': '#e87ba4',
  'k-treasury': '#008300',
  'k-org': '#4a3aa7',
  'k-delegator': '#e34948',
  'everyone-else': '#666661',
  selected: primitives.Mint,
  // Only the API mock's legend names these (apps/web/lib/mock/near-validators.json).
  'k-staking_pool': '#6b8f71',
  'k-staking_entity': '#c9a227',
  'seg-other': '#9bb7a0',
  'seg-large': '#557a5c',
  'seg-liquid': '#c9a227',
  'seg-lockup': '#7a6a9b',
} as const;

/** The chart keys the renderer reads as CSS variables of the same name. */
export const rendererVariables = [
  'ink-2',
  'hair',
  'unknown',
  'tail',
  'k-pool',
  'k-exchange',
  'k-entity',
  'k-custodian',
  'k-contract',
  'k-treasury',
  'k-org',
  'k-delegator',
] as const satisfies readonly (keyof typeof chart)[];

export interface Tokens {
  primitives: Record<Primitive, string>;
  surfaces: Record<SurfaceName, Roles>;
  layout: Record<string, number>;
  sizes: Record<string, number>;
  quarantine: Record<string, number>;
  type: Record<string, TypeStyle>;
  chart: Record<string, string>;
}

/** Everything `emit.ts` reads. A test can hand it a changed copy. */
export const tokens: Tokens = { primitives, surfaces, layout, sizes, quarantine, type, chart };

/** Figma's name as a CSS name: "Display compact" becomes display-compact. */
export const kebab = (name: string) => name.toLowerCase().replaceAll(' ', '-');

/** A paint as CSS: a hex, or the primitive at an alpha. */
export function paintCss(paint: Paint, from: Record<Primitive, string> = primitives): string {
  if (typeof paint === 'string') return from[paint];
  const hex = from[paint.of];
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r} ${g} ${b} / ${paint.alpha})`;
}

/** A paint in words, for the lab: "Ink", "Ink at 60%". */
export const paintName = (paint: Paint) =>
  typeof paint === 'string' ? paint : `${paint.of} at ${Math.round(paint.alpha * 100)}%`;
