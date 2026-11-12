// Version 2, the joy layer: tactile, animated, responsive to what the person is interested in. It grows
// from source.ts (v1) and adds; it never changes a v1 token. Every value that gives the page softness or
// motion is here: apps/web/app/versions/v2.css only says var(). Measured from dearsaintelmo.com for the
// way it feels, on Petals' own palette: nothing here is Saint Elmo's paper or ember.
import {
  type Paint,
  type Primitive,
  paintCss,
  primitives,
  surfaces,
  type wordmark,
} from '../source.ts';
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
const gray = (alpha: number): Paint => ({ of: 'Gray', alpha });
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
const LIGHT_GRAIN: [number, number, number] = [1, 1, 1];

// Elco's soft textures, drawn by code: Brand guide, "Image generations", 33:646, 33:647 and 33:648. Each
// is a PNG of megabytes there; each tile here is under 2 KB and stays sharp at any density. Elco, on the
// first pass: "Everything has a texture", so they're faint now, and only where a band needs one. What
// moves is in apps/web/app/versions/drift.ts, from `script.drift` below, or runs in the compositor.

/** An SVG as a CSS image, escaping only what url("") really needs, so a small tile stays small. */
const tile = (width: number, height: number, body: string) => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'>${body}</svg>`;
  return `url("data:image/svg+xml,${svg.replace(/[%#<>"]/g, (ch) => encodeURIComponent(ch))}")`;
};

/** A colour matrix that turns what it's given into one primitive, at that primitive's alpha. */
const inkIn = (of: Primitive, alpha: number) => {
  const [r, g, b] = [1, 3, 5].map((at) =>
    (Number.parseInt(primitives[of].slice(at, at + 2), 16) / 255).toFixed(3),
  );
  return `0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 ${alpha} 0`;
};

/**
 * Texture 02, Mint noise: short fibres lying on a slant, both lighter and darker than what's under them,
 * so a felt changes no colour on average. Its tile doesn't stitch, because the slant wouldn't repeat: the
 * fibres are too fine and too faint for an edge to show.
 */
const felt = (alpha: number) => {
  const row = '2.4 0 0 0 -.7';
  const flip = "type='discrete' tableValues='.09 1'";
  return tile(
    300,
    300,
    `<filter id='f' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'><feTurbulence type='fractalNoise' baseFrequency='.2 .85' numOctaves='2' seed='7'/><feColorMatrix values='${row} ${row} ${row} ${row}'/><feComponentTransfer><feFuncR ${flip}/><feFuncG ${flip}/><feFuncB ${flip}/><feFuncA type='table' tableValues='${alpha} 0 ${alpha}'/></feComponentTransfer></filter><rect x='-300' y='-300' width='900' height='900' filter='url(#f)' transform='rotate(-20 150 150)'/>`,
  );
};

/**
 * Static seen from far away, for the stone band: the felt's two-sided noise, but with no slant and no
 * length to it. Elco on the felt there: "It looks right now like brushed metal". Its tile stitches, so two
 * of them can slide over each other in the compositor with no edge.
 */
const speckle = (alpha: number) => {
  const row = '2.4 0 0 0 -.7';
  const flip = "type='discrete' tableValues='.09 1'";
  return tile(
    256,
    256,
    `<filter id='f' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'><feTurbulence type='fractalNoise' baseFrequency='.7' numOctaves='2' seed='9' stitchTiles='stitch'/><feColorMatrix values='${row} ${row} ${row} ${row}'/><feComponentTransfer><feFuncR ${flip}/><feFuncG ${flip}/><feFuncB ${flip}/><feFuncA type='table' tableValues='${alpha} 0 ${alpha}'/></feComponentTransfer></filter><rect width='256' height='256' filter='url(#f)'/>`,
  );
};

/** A seeded walk, so the emitted CSS is the same every time. */
const walk = (seed: number) => {
  let at = seed;
  return () => {
    at = (at * 16807) % 2147483647;
    return at / 2147483647;
  };
};

/**
 * Texture 03, Offset screen: a stochastic dot screen, in Mint with Ink printed a little off register,
 * across the rows so it doesn't smear dots into dashes. The lattice is a square one turned 26.6 degrees,
 * basis (6,3) and (-3,6), which fits a 45px cell. Each dot is nudged on its own, and slow noise bends the
 * whole thing, so no row stays straight and the cell doesn't show. Elco's second ink is blue; ours aren't.
 * Elco: "Especially the green dotted one". It's barely there now, so content reads as on a clean page.
 */
const SCREEN_DOT = 0.15;
const SCREEN_OFFSET = 0.02;
const screen = () => {
  const next = walk(11);
  const cell = 45;
  const width = 2.6;
  const inside = (v: number) => Math.min(cell - width / 2 - 0.1, Math.max(width / 2 + 0.1, v));
  let d = '';
  for (let u = -cell; u < cell; u++) {
    for (let v = -cell; v < cell; v++) {
      const x = u * 6 - v * 3;
      const y = u * 3 + v * 6;
      if (x < 0 || y < 0 || x >= cell || y >= cell) continue;
      const dotX = inside(x + 1.5 + (next() - 0.5) * 4);
      const dotY = inside(y + 1.5 + (next() - 0.5) * 4);
      d += `M${dotX.toFixed(1)} ${dotY.toFixed(1)}h0`;
    }
  }
  return tile(
    315,
    315,
    `<defs><pattern id='d' width='${cell}' height='${cell}' patternUnits='userSpaceOnUse'><path d='${d}' stroke='#000' stroke-width='${width}' stroke-linecap='round'/></pattern><filter id='s' filterUnits='userSpaceOnUse' x='-20' y='-20' width='355' height='355' color-interpolation-filters='sRGB'><feTurbulence x='0' y='0' width='315' height='315' type='fractalNoise' baseFrequency='.06' numOctaves='1' seed='4' stitchTiles='stitch' result='n'/><feDisplacementMap in='SourceGraphic' in2='n' scale='5' xChannelSelector='R' yChannelSelector='G'/><feGaussianBlur stdDeviation='.35' result='g'/><feColorMatrix in='g' values='${inkIn('Ink', SCREEN_OFFSET)}'/><feOffset dx='-.5' dy='.8' result='o'/><feColorMatrix in='g' values='${inkIn('Mint', SCREEN_DOT)}'/><feMerge><feMergeNode in='o'/><feMergeNode/></feMerge></filter></defs><rect x='-20' y='-20' width='355' height='355' fill='url(#d)' filter='url(#s)'/>`,
  );
};

/**
 * Texture 01, Countergrain: four-point stars, the shape the wordmark's cells open into. Far fewer than his,
 * and a mask keeps them to the corners (`star-fade`), so content stays clean: Elco, "there's not so many of
 * them, or at least some form of a gradient opacity". The script reads where they are, to connect them.
 */
const STAR_ALPHA = 0.6;
const STAR_TILE = 233;
const STARS: readonly (readonly [number, number])[] = (() => {
  const next = walk(5);
  const side = 3;
  const step = STAR_TILE / side;
  return Array.from({ length: 7 }, (_, i) => {
    const edge = 6;
    const at = (cell: number) =>
      Math.round(Math.min(STAR_TILE - edge, Math.max(edge, (cell + next()) * step)));
    return [at(i % side), at(Math.floor(i / side))] as const;
  });
})();
const countergrain = () => {
  const next = walk(29);
  let d = '';
  for (const [x, y] of STARS) {
    const r = 3.2 + next() * 1.6;
    const turn = ((45 + (next() - 0.5) * 26) * Math.PI) / 180;
    const at = (angle: number, reach: number) =>
      `${(x + Math.cos(angle) * reach).toFixed(1)} ${(y + Math.sin(angle) * reach).toFixed(1)}`;
    d += `M${at(turn, r)}`;
    for (let k = 1; k <= 4; k++) {
      const angle = turn + (k * Math.PI) / 2;
      d += `Q${at(angle - Math.PI / 4, r * 0.17)} ${at(angle, r)}`;
    }
    d += 'z';
  }
  return tile(
    STAR_TILE,
    STAR_TILE,
    `<path d='${d}' fill='${primitives.Gray}' fill-opacity='${STAR_ALPHA}'/>`,
  );
};

/**
 * Where the stars show on a band, as ellipses in fractions of it, each fading from its centre. The stylesheet
 * draws this as a mask, and the script reads it, so a line only ever connects stars that can be seen.
 */
const STAR_FADE = [
  { x: 1, y: 0, across: 0.62, down: 0.34 },
  { x: 1, y: 1, across: 0.62, down: 0.26 },
] as const;

const glass = (from: Paint, to: Paint) => `linear-gradient(145deg, ${c(from)}, ${c(to)})`;
const glow = (paint: Paint, at = '100% 0%', reach = '46%') =>
  `radial-gradient(circle at ${at}, ${c(paint)}, transparent ${reach})`;
const rules = (paint: Paint, step: number) =>
  `repeating-linear-gradient(90deg, ${c(paint)} 0 1px, transparent 1px ${step}px), repeating-linear-gradient(0deg, ${c(paint)} 0 1px, transparent 1px ${step}px)`;

/** How much Ground an action's gloss starts from. Elco: "The shine is all too much". */
const GLOSS = { ground: 0.05, ink: 0.08, mint: 0.05 } as const;
/** How much Gray a hairline between two stars comes to, at its fullest. */
const CONNECT = 0.75;

/** Muted words get a little firmer, because what's behind them is no longer plain. */
const MUTED = { ground: ink(0.68), ink: ground(0.8), mint: ink(0.8) } as const;

/**
 * The light grounds a band can take, `<Section tone>`, so a long page has a rhythm. Each is a role-compatible
 * ground: words and actions stay what they are on ground. No tone at all is the plain ground of v2, with
 * nothing behind it: Elco wants texture to "exist where they need to exist".
 */
export const tones = ['paper', 'mist', 'stone'] as const;
export type ToneName = (typeof tones)[number];
const MIST: readonly Paint[] = ['Ground', mint(0.08)];
const STONE: readonly Paint[] = ['Ground', gray(0.28), mint(0.03)];
const MINT_FELT = 0.115;
const STONE_SPECKLE = 0.028;

/**
 * What the moving field lays over a textured band, at its two ends. `low` lays Ground over the still tile,
 * so its stars and dots sink, and `high` lets them come forward. The mint band's two ends balance, so it
 * stays Mint.
 */
type Washed = Exclude<ToneName, 'stone'> | 'mint';
const WASH: Record<Washed, { low: Paint; high: Paint }> = {
  paper: { low: ground(0.86), high: ground(0) },
  mist: { low: ground(0.5), high: ground(0) },
  mint: { low: ink(0.03), high: ground(0.05) },
};

/**
 * A floating box's glass, its strongest and weakest stop on each surface it's drawn on. On ground its weakest
 * stop holds so another box's words and buttons under it don't show through as a blur (WORKSPACE's walk,
 * 11 Nov: the pay row's button as a grey blob in the flower's box); the map still softens through the frost.
 */
const FLOAT = { ground: [0.97, 0.92], ink: [0.94, 0.82] } as const;

const FIELD_RADIUS = 26;
const FIELD_INSET = 8;

const groups = {
  // Petals' corners stay straight in the drawings. Softness lives on the things you touch.
  radius: {
    /** A row in the side panel: soft, and still a row, not a pill. */
    item: '8px',
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
    /**
     * A row's card when the pointer's on it: its own band, a little lighter, so it's soft on any of them.
     * Solid on purpose: it's laid over the separators, so they go with an opacity alone, and no line doubles
     * up with the card's own stroke.
     */
    'row-fill': {
      ground: `color-mix(in srgb, var(--surface) 50%, ${primitives.Ground})`,
      ink: `color-mix(in srgb, var(--surface) 95%, ${primitives.Ground})`,
      mint: `color-mix(in srgb, var(--surface) 80%, ${primitives.Ground})`,
    },
    'nav-line': c(ink(0.12)),
    mist: flatCss(MIST),
    stone: flatCss(STONE),
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
        ['inset 0 1px 0', ground(0.12)],
      ),
      ink: shadow(['0 1px 2px', ink(0.6)], ['inset 0 1px 0', ground(0.2)]),
      mint: shadow(
        ['0 1px 2px', ink(0.3)],
        ['0 10px 24px', ink(0.2)],
        ['inset 0 1px 0', ground(0.12)],
      ),
    },
    'action-lift': {
      ground: shadow(['0 2px 4px', ink(0.08)], ['0 12px 26px', ink(0.07)]),
      ink: shadow(['0 2px 4px', ink(0.4)], ['0 12px 26px', ink(0.3)]),
      mint: shadow(['0 2px 4px', ink(0.1)], ['0 12px 26px', ink(0.08)]),
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
      ground: shadow(['0 2px 4px', ink(0.04)], ['0 8px 18px', ink(0.05)]),
      ink: shadow(['0 2px 4px', ink(0.4)], ['0 8px 18px', ink(0.3)]),
      mint: shadow(['0 2px 4px', ink(0.05)], ['0 8px 18px', ink(0.06)]),
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
      ground: 'none',
      ink: `radial-gradient(80% 100% at 90% 0%, ${c(mint(0.1))}, transparent), linear-gradient(180deg, ${c(ground(0.03))}, transparent 60%)`,
      mint: `radial-gradient(70% 100% at 84% 0%, ${c(ground(0.34))}, transparent), linear-gradient(165deg, ${c(ground(0.1))}, ${c(ink(0.05))})`,
    },
    glow: { ground: glow(mint(0.2)), ink: glow(mint(0.05)), mint: glow(ground(0.4)) },
    gloss: {
      ground: `linear-gradient(180deg, ${c(ground(GLOSS.ground))}, transparent 62%)`,
      ink: `linear-gradient(180deg, ${c(ground(GLOSS.ink))}, transparent 70%)`,
      mint: `linear-gradient(180deg, ${c(ground(GLOSS.mint))}, transparent 62%)`,
    },
    /** Lays over ruled paper, so its lines fade out before the box's edge. */
    'paper-fade': `radial-gradient(closest-side, transparent 28%, ${c(ground(0.92))} 100%)`,
    /** Where the stars show: a mask, so only its alpha counts. See STAR_FADE. */
    'star-fade': STAR_FADE.map(
      ({ x, y, across, down }) =>
        `radial-gradient(${across * 100}% ${down * 100}% at ${x * 100}% ${y * 100}%, ${primitives.Ink}, transparent)`,
    ).join(', '),
    /** The hero's stage: a mask, so only its alpha counts; its world fades out at the four edges (Elco, 12 Nov). */
    'stage-fade': ['90deg', '180deg']
      .map(
        (to) =>
          `linear-gradient(${to}, transparent, ${primitives.Ink} 6%, ${primitives.Ink} 94%, transparent)`,
      )
      .join(', '),
    /** A hairline between two stars, soft at both ends. */
    connect: `linear-gradient(90deg, transparent, ${c(gray(CONNECT))} 22%, ${c(gray(CONNECT))} 78%, transparent)`,
  },
  glass: {
    fill: {
      ground: glass(ground(0.96), ground(0.76)),
      ink: glass(ground(0.03), ground(0.01)),
      mint: glass(ground(0.62), ground(0.32)),
    },
    /**
     * A box over a canvas, whose words hold over Ink and the palest paint alike. On ground it's the glass
     * of `fill`. Ink's `fill` is only clear because the band behind it is ink, so this brings its own.
     */
    float: {
      ground: glass(ground(FLOAT.ground[0]), ground(FLOAT.ground[1])),
      ink: glass(ink(FLOAT.ink[0]), ink(FLOAT.ink[1])),
      mint: glass(ground(FLOAT.ground[0]), ground(FLOAT.ground[1])),
    },
    field: glass(ground(1), ground(0.9)),
    nav: c(ground(0.82)),
    blur: 'blur(18px) saturate(1.08)',
  },
  texture: {
    grain: {
      ground: 'none',
      ink: grain(LIGHT_GRAIN, 0.06),
      mint: felt(MINT_FELT),
    },
    countergrain: countergrain(),
    screen: screen(),
    speckle: speckle(STONE_SPECKLE),
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
    fold: '.62s',
    /** A section of the side panel folding: long enough for what's below to slow down into place. */
    settle: '.56s',
    /** How long a scene of How it works keeps the focus before the row moves on. */
    cycle: '7s',
    /** A hairline between stars: fades in, holds, fades out. */
    connect: '18s',
    /** Two layers of static, sliding against each other, on lengths that never line up. */
    'static-a': '83s',
    'static-b': '127s',
  },
  ease: {
    color: 'ease',
    move: 'cubic-bezier(.2, .72, .24, 1)',
    reveal: 'cubic-bezier(.2, .7, .2, 1)',
    spring: springEasing(),
    draw: 'cubic-bezier(.45, .05, .2, 1)',
    blink: 'steps(1)',
    drift: 'ease-in-out',
    /** Time kept: the line under the scene in focus fills at an even pace. */
    cycle: 'linear',
    /** A soft-close drawer: quick at first, then a long slowing to rest, with no bounce. */
    settle: 'cubic-bezier(.16, 1, .3, 1)',
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
    bleed: '-12px',
    swell: '1.035',
    'swell-glyph': '1.06',
    slide: '3px',
    tilt: '3deg',
    perspective: '900px',
    stagger: '70ms',
    'stagger-row': '110ms',
    'bloom-from': '.5',
    'arrive-from': '.92',
    dim: '.26',
    /** A scene of How it works that isn't in focus steps back to this, so the one in focus is clearly it. */
    rest: '.4',
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
    whole: '100%',
    /** How far a layer of static slides each way, and how far past the band it's cut to, so it never shows an edge. */
    'static-reach': '40px',
    'static-back': '-40px',
    'static-past': '-40px',
  },
} satisfies Record<string, Record<string, TokenValue>>;

/** The behaviours JoyLayer runs, in numbers CSS has no use for. */
export interface V2Script {
  /** How quickly what follows the pointer gets there, a fraction of the distance per frame. */
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
  /** The soft tone that moves over a textured band. See apps/web/app/versions/drift.ts. */
  drift: {
    /** How much page, in pixels, one cell of its canvas covers. It's soft, so this is why it's cheap. */
    cell: number;
    /** How long between drawings. It moves too slowly to need every frame. */
    frameMs: number;
    /** The two waves it's made of: how long each is, in pixels, and how many seconds one takes to pass. */
    waves: readonly [{ length: number; period: number }, { length: number; period: number }];
    wash: Record<'paper' | 'mist' | 'mint', { low: Paint; high: Paint }>;
  };
  /** The hairline that now and then connects two stars. See apps/web/app/versions/drift.ts. */
  connect: {
    /** The star tile, and the stars in it. */
    tile: number;
    stars: readonly (readonly [number, number])[];
    /** Where they show, and how strongly they must to be connected. */
    fade: readonly { x: number; y: number; across: number; down: number }[];
    least: number;
    /** How near two stars have to be, in pixels, and how long to wait between lines. */
    nearest: number;
    farthest: number;
    waitMs: readonly [number, number];
  };
  /**
   * A folded row: how long a pointer has to rest to open it, how far it can drift, in pixels, and still be at
   * rest, how long the row stays after it leaves, and how long folding takes.
   */
  peek: { restMs: number; stillPx: number; stayMs: number; foldMs: number };
  /** The ask box's placeholder: a letter in, a letter out, how long a whole line holds, and the pause between lines. */
  typed: { typeMs: number; eraseMs: number; holdMs: number; gapMs: number };
}

const TEXT = surfaces;
const INK_BAND: readonly Paint[] = ['Ink', mint(0.1), ground(0.03), ground(0.03)];
const MINT_BAND: readonly Paint[] = ['Mint', ink(0.05), ink(0.035)];
const MINT_WORST: readonly Paint[] = [...MINT_BAND, ink(MINT_FELT), WASH.mint.low];
const MIST_WORST: readonly Paint[] = [...MIST, ink(SCREEN_OFFSET), mint(SCREEN_DOT)];
const STONE_WORST: readonly Paint[] = [...STONE, ink(STONE_SPECKLE), ink(STONE_SPECKLE)];
const PAPER_WORST: readonly Paint[] = [...TINT, gray(STAR_ALPHA)];
const TERMINAL: readonly Paint[] = [...INK_BAND, ground(0.03), mint(0.05)];

/**
 * A floating box over a flower: the flower's darkest paint, its palest, then the glass at its weakest
 * stop, then the corner's glow. The flower moves under it, so all of them hold, on either glass.
 */
const FLOWER_PAINTS: readonly (readonly [string, readonly Paint[]])[] = [
  ['the flower’s Ink', ['Ink']],
  ['the flower’s Gray', ['Gray']],
  ['the flower’s ground', TINT],
];
const floatCases: ContrastCase[] = FLOWER_PAINTS.flatMap(([paint, under]) => [
  {
    name: `float: text-primary over ${paint}`,
    text: TEXT.ground['text-primary'],
    over: [...under, ground(FLOAT.ground[1]), mint(0.2)],
  },
  {
    name: `float: muted over ${paint}`,
    text: MUTED.ground,
    over: [...under, ground(FLOAT.ground[1]), mint(0.2)],
  },
  {
    name: `float, ink: text-primary over ${paint}`,
    text: TEXT.ink['text-primary'],
    over: [...under, ink(FLOAT.ink[1]), mint(0.05)],
  },
  {
    name: `float, ink: muted over ${paint}`,
    text: MUTED.ink,
    over: [...under, ink(FLOAT.ink[1]), mint(0.05)],
  },
]);

/**
 * Every text on what's really behind it, at the worst stop of what's behind it. The grain is counted at
 * its strongest, which is a little over twice its alpha's mean. All of them hold to source.ts's minimum.
 */
const contrast: ContrastCase[] = [
  { name: 'ground: text-primary', text: TEXT.ground['text-primary'], over: TINT },
  { name: 'ground: muted', text: MUTED.ground, over: TINT },
  // A card lightens its band, so on ground its darkest is half of the darkest tone, and on mint a fifth Ground.
  { name: 'ground: muted on a row card', text: MUTED.ground, over: [...STONE, ground(0.5)] },
  { name: 'ink: muted on a row card', text: MUTED.ink, over: ['Ink', ground(0.05)] },
  { name: 'mint: muted on a row card', text: MUTED.mint, over: ['Mint', ground(0.2)] },
  // Primary on ground, on its gloss.
  {
    name: 'ground: action-text on gloss',
    text: TEXT.ground['action-text'],
    over: [TEXT.ground['action-background'], ground(GLOSS.ground)],
  },
  {
    name: 'ground: action-accent on gloss',
    text: TEXT.ground['action-accent'],
    over: [TEXT.ground['action-background'], ground(GLOSS.ground)],
  },
  {
    name: 'ground: text-primary on a chip',
    text: TEXT.ground['text-primary'],
    over: [...TINT, ground(0.76)],
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
  // Glass on the ink band: the terminal.
  { name: 'ink: text-primary on glass', text: TEXT.ink['text-primary'], over: TERMINAL },
  { name: 'ink: muted on glass', text: MUTED.ink, over: TERMINAL },
  { name: 'ink: accent on glass', text: TEXT.ink.accent, over: TERMINAL },
  {
    name: 'ink: action-text on gloss',
    text: TEXT.ink['action-text'],
    over: [TEXT.ink['action-background'], ground(GLOSS.ink)],
  },
  // The mint band: darkest where the gradient ends, and the grain on top.
  { name: 'mint: text-primary', text: TEXT.mint['text-primary'], over: MINT_BAND },
  { name: 'mint: muted', text: MUTED.mint, over: MINT_BAND },
  {
    name: 'mint: action-text on gloss',
    text: TEXT.mint['action-text'],
    over: [TEXT.mint['action-background'], ground(GLOSS.mint)],
  },
  ...floatCases,
  // The textures, each at the darkest thing it can put behind a word: a felt's darkest fibre, a dot's core
  // with its off-register ink, a star's middle, both layers of static dark at once.
  { name: 'mint: text-primary on felt', text: TEXT.mint['text-primary'], over: MINT_WORST },
  { name: 'mint: muted on felt', text: MUTED.mint, over: MINT_WORST },
  { name: 'mist: text-primary on a dot', text: TEXT.ground['text-primary'], over: MIST_WORST },
  { name: 'mist: muted on a dot', text: MUTED.ground, over: MIST_WORST },
  { name: 'stone: text-primary on static', text: TEXT.ground['text-primary'], over: STONE_WORST },
  { name: 'stone: muted on static', text: MUTED.ground, over: STONE_WORST },
  { name: 'paper: text-primary on a star', text: TEXT.ground['text-primary'], over: PAPER_WORST },
  { name: 'paper: muted on a star', text: MUTED.ground, over: PAPER_WORST },
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
    drift: {
      cell: 24,
      frameMs: 250,
      waves: [
        { length: 720, period: 160 },
        { length: 520, period: 215 },
      ],
      wash: WASH,
    },
    connect: {
      tile: STAR_TILE,
      stars: STARS,
      fade: STAR_FADE,
      least: 0.3,
      nearest: 70,
      farthest: 190,
      waitMs: [14000, 34000],
    },
    peek: {
      restMs: 200,
      stillPx: 6,
      stayMs: 1200,
      foldMs: Number.parseFloat(groups.dur.fold) * 1000,
    },
    typed: { typeMs: 45, eraseMs: 22, holdMs: 2200, gapMs: 350 },
  },
};

export default v2;
