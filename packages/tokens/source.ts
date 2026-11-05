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
  'text-primary': Paint;
  'text-muted': Paint;
  hairline: Paint;
  'action-background': Paint;
  'action-text': Paint;
  /** The arrow inside an action. Plain accent would vanish: Mint on Mint on ink, Ink on Ink on mint. */
  'action-accent': Paint;
  accent: Paint;
  'wordmark-back': Paint;
  'wordmark-middle': Paint;
  'wordmark-front': Paint;
  /** The small mono label above a heading: Ink on ground and mint, Mint on ink (Figma, 66:2318). */
  eyebrow: Paint;
  /** Illustrations. Figma paints these Ink, Gray and Mint; lib/figures.ts names them by use. */
  'figure-line': Paint;
  'figure-petal': Paint;
  /** Mint on every surface: on mint it vanishes, as the closing section's cell does (66:2345). */
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
    'wordmark-back': 'Mint',
    'wordmark-middle': 'Gray',
    'wordmark-front': 'Ink',
    eyebrow: 'Ink',
    'figure-line': 'Ink',
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
    'wordmark-back': 'Mint',
    'wordmark-middle': 'Gray',
    'wordmark-front': 'Ground',
    eyebrow: 'Mint',
    'figure-line': 'Ground',
    'figure-petal': 'Gray',
    'figure-accent': 'Mint',
  },
  mint: {
    surface: 'Mint',
    'text-primary': 'Ink',
    'text-muted': { of: 'Ink', alpha: 0.7 },
    hairline: 'Ink',
    'action-background': 'Ink',
    'action-text': 'Ground',
    'action-accent': 'Mint',
    accent: 'Ink',
    'wordmark-back': 'Ground',
    'wordmark-middle': 'Gray',
    'wordmark-front': 'Ink',
    eyebrow: 'Ink',
    'figure-line': 'Ink',
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
  'wordmark-back': 'wordmark-back',
  'wordmark-middle': 'wordmark-middle',
  'wordmark-front': 'wordmark-front',
  eyebrow: 'eyebrow',
  'figure-line': 'figure-line',
  'figure-petal': 'figure-petal',
  'figure-accent': 'figure-accent',
};

/**
 * Checked on every surface at body-text contrast. Hairlines, accent and the wordmark layers are
 * decoration, not text, so they aren't pairs.
 */
export const contrastMinimum = 4.5;
export const contrastPairs: readonly { text: Role; on: Role }[] = [
  { text: 'text-primary', on: 'surface' },
  { text: 'text-muted', on: 'surface' },
  { text: 'action-text', on: 'action-background' },
  { text: 'action-accent', on: 'action-background' },
  { text: 'eyebrow', on: 'surface' },
];

/** Figma: Layout/… variables, then the landing page's section padding. Pixels. */
export const layout = {
  'Page inset': 72,
  'Section inset': 64,
  'Column gap': 48,
  'Block gap': 24,
  'Text gap': 12,
  'Control inset': 20,
  'Control height': 48,
  'Section padding': 112,
} as const;

/**
 * Pixels read off Figma's components (hard values there, not variables), and the two page widths
 * the old pages already had. All of them become spacing utilities: h-ask-box-height.
 */
export const sizes = {
  None: 0,
  'Ask box height': 64,
  /** The most it takes. Every instance on the landing page fills its column (584, 640). */
  'Ask box width': 640,
  'Ask box inset': 8,
  'Ask box gap': 16,
  /** Figma's step 1 instance (67:2512) is the Ask box at 0.56: these are its values at that scale. */
  'Ask box small height': 35.84,
  'Ask box small width': 336,
  'Ask box small start': 13.44,
  'Ask box small end': 4.48,
  'Ask box small gap': 8.96,
  'Button small height': 26.88,
  'Button small inset': 12.32,
  'Button small gap': 5.6,
  'Starter height': 36,
  'Starter inset start': 16,
  'Starter inset end': 14,
  'Arrow gap': 10,
  'Content width': 960,
  'Flower width': 640,
  'Gallery flower width': 320,
  /** Landing frame 66:2180. Figma's column widths, read off its sections. */
  'Page width': 1440,
  'Hero pitch width': 584,
  'Hero figure width': 720,
  'Figure width': 480,
  'Intro width': 456,
  'Builders pitch width': 520,
  'Closing ask width': 640,
  'Community pitch width': 560,
  'Cell width': 300,
  'Cell repeat width': 624,
  'Visual height': 220,
  'Card flower height': 300,
  'FAQ answer inset': 114,
  'Glyph row': 48,
  'Glyph step': 144,
  'Thumb strip': 72,
  'Thumb step': 192,
  'Thumb card': 240,
  'Cursor width': 12,
  'Cursor height': 26,
  /** Figma's loose "Space" frames and auto-layout gaps on that page, named by their pixels. */
  'Space 2': 2,
  'Space 6': 6,
  'Space 8': 8,
  'Space 10': 10,
  'Space 14': 14,
  'Space 16': 16,
  'Space 20': 20,
  'Space 22': 22,
  'Space 26': 26,
  'Space 28': 28,
  'Space 32': 32,
  'Space 36': 36,
  'Space 40': 40,
  'Space 44': 44,
  'Space 56': 56,
  'Space 96': 96,
} as const;

/** Not in Figma, which is still: how fast the transcript's cursor blinks, in milliseconds. */
export const motion = { 'Cursor blink': 1200 } as const;

export const cornerRadius = 0;

/** Not from Figma, which has one frame width: Tailwind's own three, under the same names. */
export const breakpoints = { sm: 640, md: 768, lg: 1024 } as const;

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
 * Figma: Petals / <name>. The three mono styles consolidate Figma's nine loose Geist Mono sizes.
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
  /** Body and Label at the 0.56 of Figma's small Ask box (67:2512). */
  'Body small': { font: 'sans', size: 10.08, line: 15.12, weight: 400, tracking: 0 },
  'Label small': { font: 'sans', size: 8.96, line: 12.32, weight: 500, tracking: 0 },
  'Mono label': { font: 'mono', size: 12, line: 17, weight: 400, tracking: 0.04 },
  'Mono small': { font: 'mono', size: 11, line: 16, weight: 400, tracking: 0.04 },
  'Mono code': { font: 'mono', size: 15, line: 24, weight: 400, tracking: 0 },
  /** Figma's 10/15, the label and action of its note boxes (66:2229, 67:2530). */
  'Mono tiny': { font: 'mono', size: 10, line: 15, weight: 400, tracking: 0.04 },
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
  /** Font size in pixels. Display is the component's own size, the others its landing instances. */
  sizes: { Nav: 36.67, Footer: 155.56, Display: 269.722 },
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
  type: Record<string, TypeStyle>;
  chart: Record<string, string>;
}

/** Everything `emit.ts` reads. A test can hand it a changed copy. */
export const tokens: Tokens = { primitives, surfaces, layout, sizes, type, chart };

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
