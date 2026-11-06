// Version 2, the joy layer: tactile, animated, responsive to what the person is interested in. It grows
// from source.ts (v1) and adds; it never changes a v1 token. Every value that gives the page softness or
// motion is here: apps/web/app/versions/v2.css only says var(). Measured from dearsaintelmo.com for the
// way it feels, on Petals' own palette: nothing here is Saint Elmo's paper or ember.
import { type Paint, paintCss, surfaces, type wordmark } from '../source.ts';
import {
  type ContrastCase,
  flatCss,
  springEasing,
  type TokenValue,
  type Version,
} from './version.ts';

const ink = (alpha: number): Paint => ({ of: 'Ink', alpha });
const ground = (alpha: number): Paint => ({ of: 'Ground', alpha });
const mint = (alpha: number): Paint => ({ of: 'Mint', alpha });
const c = (paint: Paint) => paintCss(paint);

/** Ground with a breath of Mint. Solid, so what sits on it composites the same way everywhere. */
const TINT: readonly Paint[] = ['Ground', mint(0.07)];

/** `offset-x offset-y blur spread paint`, as many as it takes. */
const shadow = (...layers: [string, Paint][]) =>
  layers.map(([geometry, paint]) => `${geometry} ${c(paint)}`).join(', ');

/** Film grain as a tile: fractal noise, in one primitive's colour, at a very low alpha. */
const grain = ([r, g, b]: [number, number, number], alpha: number) => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};
const INK_GRAIN: [number, number, number] = [0.09, 0.09, 0.09];
const LIGHT_GRAIN: [number, number, number] = [1, 1, 1];

const glass = (from: Paint, to: Paint) => `linear-gradient(145deg, ${c(from)}, ${c(to)})`;
const glow = (paint: Paint, at = '100% 0%', reach = '46%') =>
  `radial-gradient(circle at ${at}, ${c(paint)}, transparent ${reach})`;
const blob = (paint: Paint) => `radial-gradient(circle closest-side, ${c(paint)}, transparent)`;
const rules = (paint: Paint, step: number) =>
  `repeating-linear-gradient(90deg, ${c(paint)} 0 1px, transparent 1px ${step}px), repeating-linear-gradient(0deg, ${c(paint)} 0 1px, transparent 1px ${step}px)`;

/** Muted words get a little firmer, because what's behind them is no longer plain. */
const MUTED = { ground: ink(0.68), ink: ground(0.8), mint: ink(0.8) } as const;

const FIELD_RADIUS = 26;
const FIELD_INSET = 8;

const groups = {
  // Petals' corners stay straight in the drawings. Softness lives on the things you touch.
  radius: {
    sm: '13px',
    md: '18px',
    lg: '26px',
    xl: '30px',
    pill: '999px',
    field: `${FIELD_RADIUS}px`,
    /** Concentric: the field's radius less the space around the button. */
    'field-nested': `${FIELD_RADIUS - FIELD_INSET}px`,
  },
  paint: {
    ground: flatCss(TINT),
    muted: { ground: c(MUTED.ground), ink: c(MUTED.ink), mint: c(MUTED.mint) },
    hairline: { ground: c(ink(0.14)), ink: c(ground(0.18)), mint: c(ink(0.22)) },
    edge: { ground: c(ink(0.1)), ink: c(ground(0.16)), mint: c(ink(0.14)) },
    'edge-strong': { ground: c(ink(0.32)), ink: c(ground(0.4)), mint: c(ink(0.4)) },
    'action-wash': {
      ground: c(ground(0.06)),
      ink: c(ground(0.14)),
      mint: c(ground(0.08)),
    },
    'chip-wash': { ground: c(mint(0.22)), ink: c(mint(0.18)), mint: c(ground(0.4)) },
    'nav-line': c(ink(0.12)),
  },
  shadow: {
    box: {
      ground: shadow(
        ['0 1px 2px', ink(0.06)],
        ['0 22px 62px', ink(0.07)],
        ['inset 0 1px 0', ground(0.9)],
      ),
      ink: shadow(['0 1px 2px', ink(0.5)], ['inset 0 1px 0', ground(0.12)]),
      mint: shadow(
        ['0 1px 2px', ink(0.1)],
        ['0 22px 62px', ink(0.1)],
        ['inset 0 1px 0', ground(0.6)],
      ),
    },
    'box-lift': {
      ground: shadow(['0 2px 4px', ink(0.05)], ['0 34px 84px', ink(0.14)]),
      ink: shadow(['0 2px 4px', ink(0.5)], ['0 28px 80px', mint(0.16)]),
      mint: shadow(['0 2px 4px', ink(0.08)], ['0 34px 84px', ink(0.16)]),
    },
    action: {
      ground: shadow(
        ['0 1px 2px', ink(0.24)],
        ['0 10px 24px', ink(0.14)],
        ['inset 0 1px 0', ground(0.2)],
      ),
      ink: shadow(['0 1px 2px', ink(0.6)], ['inset 0 1px 0', ground(0.5)]),
      mint: shadow(
        ['0 1px 2px', ink(0.3)],
        ['0 10px 24px', ink(0.2)],
        ['inset 0 1px 0', ground(0.2)],
      ),
    },
    'action-lift': {
      ground: shadow(['0 2px 5px', ink(0.2)], ['0 18px 40px', ink(0.24)]),
      ink: shadow(['0 2px 5px', ink(0.6)], ['0 14px 44px', mint(0.32)]),
      mint: shadow(['0 2px 5px', ink(0.26)], ['0 18px 40px', ink(0.3)]),
    },
    'action-press': {
      ground: shadow(['0 0 1px', ink(0.4)], ['inset 0 1px 3px', ink(0.7)]),
      ink: shadow(['0 0 1px', ink(0.6)], ['inset 0 1px 3px', ink(0.3)]),
      mint: shadow(['0 0 1px', ink(0.4)], ['inset 0 1px 3px', ink(0.7)]),
    },
    chip: {
      ground: shadow(
        ['0 1px 2px', ink(0.06)],
        ['0 6px 16px', ink(0.05)],
        ['inset 0 1px 0', ground(0.9)],
      ),
      ink: shadow(['0 1px 2px', ink(0.5)], ['inset 0 1px 0', ground(0.14)]),
      mint: shadow(
        ['0 1px 2px', ink(0.08)],
        ['0 6px 16px', ink(0.08)],
        ['inset 0 1px 0', ground(0.7)],
      ),
    },
    'chip-lift': {
      ground: shadow(['0 2px 4px', ink(0.06)], ['0 12px 28px', ink(0.11)]),
      ink: shadow(['0 2px 4px', ink(0.5)], ['0 12px 28px', mint(0.18)]),
      mint: shadow(['0 2px 4px', ink(0.08)], ['0 12px 28px', ink(0.14)]),
    },
    'chip-press': {
      ground: shadow(['0 0 1px', ink(0.14)], ['inset 0 1px 2px', ink(0.1)]),
      ink: shadow(['0 0 1px', ink(0.5)], ['inset 0 1px 2px', ground(0.1)]),
      mint: shadow(['0 0 1px', ink(0.14)], ['inset 0 1px 2px', ink(0.12)]),
    },
    field: {
      ground: shadow(
        ['inset 0 1px 3px', ink(0.1)],
        ['inset 0 8px 18px -10px', ink(0.14)],
        ['0 1px 0', ground(0.8)],
        ['0 18px 48px', ink(0.05)],
      ),
      ink: shadow(['inset 0 1px 3px', ink(0.1)], ['inset 0 8px 18px -10px', ink(0.14)]),
      mint: shadow(['inset 0 1px 3px', ink(0.1)], ['inset 0 8px 18px -10px', ink(0.14)]),
    },
    'field-lift': shadow(['0 2px 6px', ink(0.05)], ['0 26px 64px', ink(0.12)]),
    ring: {
      ground: shadow(['0 0 0 1px', ink(0.55)], ['0 0 0 5px', mint(0.42)]),
      ink: shadow(['0 0 0 1px', ground(0.8)], ['0 0 0 5px', mint(0.42)]),
      mint: shadow(['0 0 0 1px', ink(0.7)], ['0 0 0 5px', ground(0.5)]),
    },
    'field-ring': shadow(['0 0 0 4px', mint(0.32)], ['0 0 42px 2px', mint(0.46)]),
    'field-ring-on-mint': shadow(['0 0 0 4px', ground(0.5)], ['0 0 42px 2px', ground(0.5)]),
  },
  gradient: {
    band: {
      ground: `radial-gradient(90% 70% at 88% 0%, ${c(mint(0.08))}, transparent)`,
      ink: `radial-gradient(80% 100% at 90% 0%, ${c(mint(0.1))}, transparent), linear-gradient(180deg, ${c(ground(0.03))}, transparent 60%)`,
      mint: `radial-gradient(70% 100% at 84% 0%, ${c(ground(0.34))}, transparent), linear-gradient(165deg, ${c(ground(0.1))}, ${c(ink(0.05))})`,
    },
    glow: { ground: glow(mint(0.2)), ink: glow(mint(0.05)), mint: glow(ground(0.4)) },
    gloss: {
      ground: `linear-gradient(180deg, ${c(ground(0.16))}, transparent 62%)`,
      ink: `linear-gradient(180deg, ${c(ground(0.3))}, transparent 70%)`,
      mint: `linear-gradient(180deg, ${c(ground(0.16))}, transparent 62%)`,
    },
    /** The sheen inside an action, which follows the pointer. */
    sheen: { ground: blob(ground(0.15)), ink: blob(ground(0.42)), mint: blob(ground(0.15)) },
    'chip-sheen': { ground: blob(mint(0.34)), ink: blob(mint(0.26)), mint: blob(ground(0.5)) },
    /** The page's own spotlight, under the content. */
    spot: { ground: blob(mint(0.17)), ink: blob(mint(0.1)), mint: blob(ground(0.3)) },
    /** A box's spotlight, inside it. */
    'box-spot': { ground: blob(mint(0.34)), ink: blob(mint(0.06)), mint: blob(ground(0.42)) },
    'row-wash': {
      ground: `linear-gradient(90deg, ${c(mint(0.15))}, transparent 88%)`,
      ink: `linear-gradient(90deg, ${c(mint(0.14))}, transparent 88%)`,
      mint: `linear-gradient(90deg, ${c(ground(0.3))}, transparent 88%)`,
    },
    /** Lays over ruled paper, so its lines fade out before the box's edge. */
    'paper-fade': `radial-gradient(closest-side, transparent 28%, ${c(ground(0.92))} 100%)`,
  },
  glass: {
    fill: {
      ground: glass(ground(0.96), ground(0.76)),
      ink: glass(ground(0.03), ground(0.01)),
      mint: glass(ground(0.62), ground(0.32)),
    },
    field: glass(ground(1), ground(0.9)),
    nav: c(ground(0.82)),
    blur: 'blur(18px) saturate(1.08)',
  },
  texture: {
    grain: {
      ground: grain(INK_GRAIN, 0.05),
      ink: grain(LIGHT_GRAIN, 0.06),
      mint: grain(INK_GRAIN, 0.07),
    },
    rules: {
      ground: rules(ink(0.06), 24),
      ink: rules(ground(0.05), 24),
      mint: rules(ink(0.06), 24),
    },
  },
  dur: {
    quick: '.18s',
    base: '.24s',
    slow: '.42s',
    reveal: '.7s',
    spring: '.64s',
    bloom: '.9s',
    sweep: '.95s',
    draw: '1.5s',
    notes: '1.1s',
    blink: '1.06s',
    fold: '.42s',
  },
  ease: {
    color: 'ease',
    move: 'cubic-bezier(.2, .72, .24, 1)',
    reveal: 'cubic-bezier(.2, .7, .2, 1)',
    spring: springEasing(),
    draw: 'cubic-bezier(.45, .05, .2, 1)',
    blink: 'steps(1)',
  },
  // How far things move. Reduced motion takes all of these to nothing.
  move: {
    zero: '0px',
    none: '0',
    lift: '-1px',
    'lift-box': '-6px',
    press: '1px',
    'press-scale': '.985',
    rise: '20px',
    'rise-small': '10px',
    blur: 'blur(6px)',
    indent: '8px',
    'wash-bleed': '-12px',
    swell: '1.035',
    'swell-glyph': '1.14',
    slide: '3px',
    tilt: '3deg',
    perspective: '900px',
    stagger: '70ms',
    'stagger-row': '110ms',
    'bloom-from': '.5',
    'arrive-from': '.92',
    dim: '.26',
    'nav-shift': '-24px',
    'nav-row': '-12px',
    'nav-mark': '.88',
    'nav-clear': '84px',
    'underline-at': '-3px',
    'card-underline': '6px',
    'sign-turn': '90deg',
    'sign-rest': '0deg',
    'none-s': '0s',
    'fold-closed': '0px',
    z: '40',
  },
  // Sizes of the pools of light, each with the offset that centres it on the pointer.
  light: {
    'spot-size': '900px',
    'spot-offset': '-450px',
    'sheen-size': '170px',
    'sheen-offset': '-85px',
    'box-size': '420px',
    'box-offset': '-210px',
  },
} satisfies Record<string, Record<string, TokenValue>>;

/** The behaviours JoyLayer runs, in numbers CSS has no use for. */
export interface V2Script {
  /** Most of how far a primary leans, in pixels, and how quickly it follows. */
  magnet: number;
  follow: number;
  /** How far a petal leans out, as a fraction of its size, and over how wide an angle. */
  lean: number;
  leanWidth: number;
  /** The most a drawing's front layer moves, in pixels. */
  parallax: number;
  /** A drawing under this many pixels wide stays whole and arrives as one. */
  splitFrom: number;
  /** How close the pointer has to be, in multiples of a mark's height, before it starts to open. */
  markReach: number;
  /** How quickly a mark resolves after arriving, a fraction of the distance per frame. */
  markSettle: number;
  /** What the wordmark's layers open toward: the cells become four-point shapes (ELSH 80). */
  markOpen: Record<keyof typeof wordmark.layers, Record<string, number>>;
  /** And the numerals, from Bitcount's axes at rest. */
  numeralOpen: Record<string, number>;
  /** How close the pointer has to be, in pixels, for a cell in a field to open, and how much. */
  fieldReach: number;
  fieldOpen: number;
  /** How long a note stays lit after the pointer slips off what lit it, so crossing a gap doesn't flicker. */
  linkHold: number;
  /** Past this many pixels of scroll the nav tightens. */
  tightAt: number;
  /** How long after a reveal a drawing's lines go back to one path. */
  settleMs: number;
}

const TEXT = surfaces;
const GROUND_BAND: readonly Paint[] = [...TINT, mint(0.08), ink(0.03)];
const INK_BAND: readonly Paint[] = ['Ink', mint(0.1), ground(0.03), ground(0.03)];
const MINT_BAND: readonly Paint[] = ['Mint', ink(0.05), ink(0.035)];
const TERMINAL: readonly Paint[] = [...INK_BAND, ground(0.03), mint(0.05), mint(0.06)];

/**
 * Every text on what's really behind it, at the worst stop of what's behind it. The grain is counted at
 * its strongest, which is a little over twice its alpha's mean. All of them hold to source.ts's minimum.
 */
const contrast: ContrastCase[] = [
  { name: 'ground: text-primary', text: TEXT.ground['text-primary'], over: GROUND_BAND },
  { name: 'ground: muted', text: MUTED.ground, over: GROUND_BAND },
  { name: 'ground: muted on a row wash', text: MUTED.ground, over: [...GROUND_BAND, mint(0.15)] },
  {
    name: 'ground: muted under the spotlight',
    text: MUTED.ground,
    over: [...GROUND_BAND, mint(0.17)],
  },
  // Primary on ground: gloss and sheen together at their brightest. The hard case.
  {
    name: 'ground: action-text on gloss and sheen',
    text: TEXT.ground['action-text'],
    over: [TEXT.ground['action-background'], ground(0.16), ground(0.06), ground(0.15)],
  },
  {
    name: 'ground: action-accent on gloss',
    text: TEXT.ground['action-accent'],
    over: [TEXT.ground['action-background'], ground(0.16)],
  },
  {
    name: 'ground: text-primary on a chip wash',
    text: TEXT.ground['text-primary'],
    over: [...TINT, ground(0.76), mint(0.22), mint(0.34)],
  },
  // The nav's glass when the ink band passes under it.
  {
    name: 'nav: text-primary over ink',
    text: TEXT.ground['text-primary'],
    over: ['Ink', ground(0.82)],
  },
  // The ink band: its glow is the lightest thing behind words.
  { name: 'ink: text-primary', text: TEXT.ink['text-primary'], over: [...INK_BAND, mint(0.1)] },
  { name: 'ink: muted', text: MUTED.ink, over: [...INK_BAND, mint(0.1)] },
  { name: 'ink: accent', text: TEXT.ink.accent, over: [...INK_BAND, mint(0.1)] },
  // Glass on the ink band: the terminal, under its own spotlight.
  { name: 'ink: text-primary on glass', text: TEXT.ink['text-primary'], over: TERMINAL },
  { name: 'ink: muted on glass', text: MUTED.ink, over: TERMINAL },
  { name: 'ink: accent on glass', text: TEXT.ink.accent, over: TERMINAL },
  {
    name: 'ink: action-text on gloss and sheen',
    text: TEXT.ink['action-text'],
    over: [TEXT.ink['action-background'], ground(0.3), ground(0.14), ground(0.42)],
  },
  // The mint band: darkest where the gradient ends, and the grain on top.
  { name: 'mint: text-primary', text: TEXT.mint['text-primary'], over: MINT_BAND },
  { name: 'mint: muted', text: MUTED.mint, over: MINT_BAND },
  {
    name: 'mint: action-text on gloss and sheen',
    text: TEXT.mint['action-text'],
    over: [TEXT.mint['action-background'], ground(0.16), ground(0.08), ground(0.15)],
  },
];

export const v2: Version<V2Script> = {
  id: '2',
  inherits: 'v1',
  groups,
  reduced: {
    ...Object.fromEntries(Object.keys(groups.dur).map((n) => [`--joy-dur-${n}`, '0s'])),
    '--joy-move-lift': '0px',
    '--joy-move-lift-box': '0px',
    '--joy-move-press': '0px',
    '--joy-move-press-scale': '1',
    '--joy-move-rise': '0px',
    '--joy-move-rise-small': '0px',
    '--joy-move-blur': 'none',
    '--joy-move-indent': '0px',
    '--joy-move-swell': '1',
    '--joy-move-swell-glyph': '1',
    '--joy-move-slide': '0px',
    '--joy-move-tilt': '0deg',
    '--joy-move-stagger': '0ms',
    '--joy-move-stagger-row': '0ms',
    '--joy-move-bloom-from': '1',
    '--joy-move-arrive-from': '1',
  },
  contrast,
  script: {
    magnet: 5,
    follow: 0.16,
    lean: 0.09,
    leanWidth: 0.34,
    parallax: 4,
    splitFrom: 140,
    markReach: 3.2,
    markSettle: 0.035,
    markOpen: {
      back: { CRSV: 0.11, ELSH: 60, ELXP: 80, slnt: -8, wght: 358 },
      middle: { CRSV: 0.11, ELSH: 80, ELXP: 40, slnt: -8, wght: 358 },
      front: { CRSV: 0.5, ELSH: 80, ELXP: 20, slnt: -8, wght: 250 },
    },
    numeralOpen: { CRSV: 0, ELSH: 80, ELXP: 40 },
    fieldReach: 150,
    fieldOpen: 0.09,
    linkHold: 140,
    tightAt: 12,
    settleMs: 3200,
  },
};

export default v2;
