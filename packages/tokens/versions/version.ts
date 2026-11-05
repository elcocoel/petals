// What a version of the system is. source.ts is the seed and stays as it is; a version only adds, under
// its own root selector, so with the version off every page is v1 to the pixel. An alternative is one new
// file beside this one, `inherit(v2, 'a', { … })`: it's discovered by emit.ts, and it writes only what it
// changes under `:root[data-version="2"][data-alt="a"]`, so v2's stylesheet still applies to it.
import {
  type Paint,
  type Primitive,
  primitives,
  type SurfaceName,
  surfaceNames,
} from '../source.ts';

/** The same on every surface, or one value per surface, which flips with `data-surface`. */
export type TokenValue = string | Record<SurfaceName, string>;
/** Group, then name: `radius.sm` is `--joy-radius-sm`. */
export type TokenGroups = Record<string, Record<string, TokenValue>>;

/** One piece of text over what's really behind it, back to front. */
export interface ContrastCase {
  name: string;
  text: Paint;
  over: readonly Paint[];
}

export interface Version<Script = unknown> {
  /** The base number, what `data-version` says. */
  id: string;
  /** Set on an alternative: what `data-alt` says. */
  alt?: string;
  /** What it grew from, for the lab. */
  inherits: string;
  groups: TokenGroups;
  /** What `prefers-reduced-motion` sets instead: durations to 0, distances to nothing. */
  reduced: Record<string, string>;
  contrast: readonly ContrastCase[];
  /** Numbers only JoyLayer reads, which CSS has no use for. */
  script: Script;
}

export const tokenName = (group: string, name: string) => `--joy-${group}-${name}`;

export const rootSelector = (v: Pick<Version, 'id' | 'alt'>) =>
  `:root[data-version="${v.id}"]${v.alt ? `[data-alt="${v.alt}"]` : ''}`;

const block = (selector: string, lines: string[]) =>
  [`${selector} {`, ...lines.map((l) => `  ${l}`), '}'].join('\n');

/** The version's whole token block. Pure. Nothing here styles anything: it only names values. */
export function emitVersion(v: Version): string {
  const root = rootSelector(v);
  const entries = Object.entries(v.groups).flatMap(([group, values]) =>
    Object.entries(values).map(([name, value]) => [tokenName(group, name), value] as const),
  );
  const same = entries.filter(([, value]) => typeof value === 'string') as [string, string][];
  const flipping = entries.filter(([, value]) => typeof value !== 'string') as [
    string,
    Record<SurfaceName, string>,
  ][];
  const onSurface = (kind: SurfaceName) =>
    flipping.filter(([, value]) => value[kind] !== undefined).map(([n, v]) => `${n}: ${v[kind]};`);
  const reduced = Object.entries(v.reduced).map(([n, value]) => `  ${n}: ${value};`);
  // An alternative writes only what it changes, so any of these can be empty.
  const flips = flipping.length > 0;
  return [
    `/* Version ${v.id}${v.alt ?? ''}, from ${v.inherits}. */`,
    same.length > 0
      ? block(
          root,
          same.map(([n, value]) => `${n}: ${value};`),
        )
      : '',
    flips ? block(`${root},\n${root} [data-surface="ground"]`, onSurface('ground')) : '',
    ...surfaceNames
      .filter((kind) => flips && kind !== 'ground')
      .map((kind) => block(`${root} [data-surface="${kind}"]`, onSurface(kind))),
    reduced.length > 0
      ? `@media (prefers-reduced-motion: reduce) {\n${block(`  ${root}`, reduced).replace(/\n}$/, '\n  }')}\n}`
      : '',
    '',
  ]
    .filter((part, i, all) => part !== '' || i === all.length - 1)
    .join('\n\n');
}

/**
 * A new version from an old one: everything comes along, and `changes` wins, group by group, name by
 * name. It writes only what it changes, because its selector sits over its parent's.
 */
export function inherit<S>(
  parent: Version<S>,
  alt: string,
  changes: { groups?: TokenGroups; reduced?: Record<string, string> },
): Version<S> {
  return {
    ...parent,
    alt,
    inherits: `v${parent.id}${parent.alt ?? ''}`,
    groups: changes.groups ?? {},
    reduced: changes.reduced ?? {},
  };
}

const rgb = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

/** Paints laid on each other, back to front, as the one colour they come to. */
export function flatten(
  stack: readonly Paint[],
  from: Record<Primitive, string> = primitives,
): [number, number, number] {
  let out: [number, number, number] = [255, 255, 255];
  for (const paint of stack) {
    const top = typeof paint === 'string' ? rgb(from[paint]) : rgb(from[paint.of]);
    const alpha = typeof paint === 'string' ? 1 : paint.alpha;
    out = [
      top[0] * alpha + out[0] * (1 - alpha),
      top[1] * alpha + out[1] * (1 - alpha),
      top[2] * alpha + out[2] * (1 - alpha),
    ];
  }
  return out;
}

export const flatCss = (stack: readonly Paint[]) => {
  const [r, g, b] = flatten(stack).map(Math.round);
  return `rgb(${r} ${g} ${b})`;
};

const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: [number, number, number]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** WCAG contrast of text over a stack of paints, however many are translucent. */
export function stackContrast(c: ContrastCase): number {
  const [a, b] = [luminance(flatten([...c.over, c.text])), luminance(flatten(c.over))];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** A damped spring as a CSS `linear()` easing, sampled across its settling time. */
export function springEasing(damping = 0.58, frequency = 9, samples = 28): string {
  const damped = frequency * Math.sqrt(1 - damping * damping);
  const at = (t: number) =>
    1 -
    Math.exp(-damping * frequency * t) *
      (Math.cos(damped * t) + ((damping * frequency) / damped) * Math.sin(damped * t));
  const points = Array.from({ length: samples + 1 }, (_, i) =>
    i === samples ? 1 : Number(at(i / samples).toFixed(3)),
  );
  return `linear(${points.join(', ')})`;
}
