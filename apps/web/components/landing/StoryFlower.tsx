// The hero story's flower (HERO ART's V2, Elco 11 Nov; HERO MOTION's choreography): one symbolic flower that
// changes with the story, not a reading and not the live renderer, so it never goes out of date as the look
// evolves. 24 petals round a centre, straight sides and arc tops with a fine line of one width between them, in
// the look's keys; in a world the camera moves through (Elco, 12 Nov): the far map the story opens and closes on,
// my community and its two neighbours, each drawn from far as the real far map draws one (lib/hero-map.ts). Per
// beat (lib/hero-story.ts): the camera dives in from the far map and my community bursts out of its wave; the
// heights part, petal after petal, and the strongest take the highlight; two groups take shared colours and a few
// lines draw between them; the heights move against an earlier outline that draws itself round; a proposal's ring
// opens, its arc draws over the top and the vote marks land; the camera pulls back as two neighbours bloom, reached
// by running lines, and then all the way out to the far map. A light behind it moves less than it does, for depth.
// Every number comes from those files; this only draws.
import { KEYS } from '@petal/core/wedge/keys';
import type { CSSProperties } from 'react';
import { useId } from 'react';
import { type Community, MINE, NEIGHBOURS, OTHERS } from '../../lib/hero-map.ts';
import {
  atPetal,
  camera,
  type Fill,
  GUTTER,
  ghostDrawn,
  ghostLengths,
  glow,
  INNER,
  layerOpacity,
  network,
  PETALS,
  petalLengths,
  petalLit,
  petalPaint,
  petalPath,
  proposal,
  relationDrawn,
  relations,
  voteOf,
  world,
} from '../../lib/hero-story.ts';

/** The look's own keys, handed over as data on the drawing (as the flower's fills are), and painted from there. */
const key = (name: string) => KEYS.find((k) => k.name === name)?.hex ?? '';
const KEYED = { '--story-second': key('blue'), '--story-against': key('pink') } as CSSProperties;
const PAINT: Record<Fill, string> = {
  petal: 'var(--figure-petal)',
  accent: 'var(--figure-accent)',
  second: 'var(--story-second)',
};
const AGAINST = 'var(--story-against)';

/** A colour on its way from one key to another, mixed by the browser so a theme's keys are kept. */
const mix = (from: Fill, to: Fill, k: number) =>
  k >= 1
    ? PAINT[to]
    : k <= 0
      ? PAINT[from]
      : `color-mix(in srgb, ${PAINT[to]} ${(k * 100).toFixed(1)}%, ${PAINT[from]})`;

/**
 * The highlight (default-system-vnext.md, highlight-style-v1.json): a fine stroke inside, the fill × 0.62;
 * softened corners; light from the upper left (the fill × 1.15) and shade from the lower right (× 0.78), feathered.
 * Here in the drawing's units, about 1.3 px each on a wide window.
 */
const HL = { stroke: 0.8, round: 2, offset: 1.2, blur: 2 };
const darker = (fill: string) => `color-mix(in srgb, ${fill} 62%, black)`;

/** Where my community sits in the drawing when the camera is on it. */
const CENTRE = { x: 300, y: 205 };
/** The proposal's ring and its arc, over the top of the flower. */
const ORBIT = 187;
/** How far out my community's petals reach at most, for the lines and the focus ring. */
const REACH = 215;

const seen = (v: number) => (v > 0.001 ? undefined : 'hidden');

/** A community from far: its soft wave, the hole in it, and a dark mark where its logo would be. */
function FarCommunity({ c, opacity = 1 }: { c: Community; opacity?: number }) {
  return (
    <g transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`} opacity={opacity}>
      <path d={c.wave} fill={PAINT.petal} fillRule="evenodd" />
      <circle r={c.inner * 0.55} fill="var(--text-primary)" />
    </g>
  );
}

/** A neighbour up close: its petals bursting out of its wave, the biggest few in the accent. */
function Neighbour({ c, bloom }: { c: Community; bloom: (j: number) => number }) {
  const n = c.heights.length;
  return (
    <g transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`}>
      {c.heights.map((h, j) => (
        <path
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed petals, one per position
          key={j}
          d={petalPath(j, c.inner + h * bloom(j), { inner: c.inner, count: n, gutter: GUTTER })}
          fill={j < 3 ? PAINT.accent : PAINT.petal}
        />
      ))}
      <circle r={c.inner - 0.5} fill="var(--surface)" />
      <circle r={c.inner * 0.55} fill="var(--text-primary)" />
    </g>
  );
}

/** A line from my community's edge out to a neighbour's, bending a little to one side. */
function linkTo(c: Community, side: number): string {
  const far = Math.hypot(c.x, c.y);
  const ux = c.x / far;
  const uy = c.y / far;
  const out = Math.max(...c.heights) + c.inner;
  const [x1, y1] = [ux * REACH, uy * REACH];
  const [x2, y2] = [c.x - ux * out * 1.05, c.y - uy * out * 1.05];
  const bend = 0.18 * far * side;
  const [mx, my] = [(x1 + x2) / 2 - uy * bend, (y1 + y2) / 2 + ux * bend];
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}
const LINKS = NEIGHBOURS.map((c, n) => linkTo(c, n % 2 ? 1 : -1));

export function StoryFlower({
  beat,
  t,
  fresh = false,
}: {
  beat: number;
  t: number;
  fresh?: boolean;
}) {
  const id = useId().replace(/[^\w-]/g, '');
  const lengths = petalLengths(beat, t);
  const cam = camera(beat, t);
  const w = world(beat, t);
  const vote = proposal(beat, t);
  const net = network(beat, t);
  const ghosts = layerOpacity(3, beat, t);
  const blocs = layerOpacity(2, beat, t);
  const votes = layerOpacity(4, beat, t);
  const links = layerOpacity(5, beat, t);
  // strokes that keep one width on screen whatever the camera's zoom
  const px = (n: number) => n / w.zoom;
  return (
    <svg
      data-b="figure"
      data-kind="symbol"
      aria-hidden="true"
      viewBox="0 0 600 440"
      className="block size-full overflow-visible"
      style={KEYED}
    >
      <defs>
        {/* the highlight's surface: what the petal, moved and blurred, leaves uncovered of itself, toned */}
        <filter
          id={`${id}-surface`}
          x="-10%"
          y="-10%"
          width="120%"
          height="120%"
          colorInterpolationFilters="sRGB"
        >
          {(
            [
              ['light', 1.15, 0.65, HL.offset],
              ['shade', 0.78, 0.32, -HL.offset],
            ] as const
          ).map(([name, slope, opacity, d]) => (
            <g key={name}>
              <feOffset in="SourceAlpha" dx={d} dy={d} result={`${name}-o`} />
              <feGaussianBlur in={`${name}-o`} stdDeviation={HL.blur} result={`${name}-b`} />
              <feComposite
                in="SourceAlpha"
                in2={`${name}-b`}
                operator="arithmetic"
                k1={-1}
                k2={1}
                k3={0}
                k4={0}
                result={`${name}-e`}
              />
              <feComponentTransfer in="SourceGraphic" result={`${name}-c`}>
                <feFuncR type="linear" slope={slope} />
                <feFuncG type="linear" slope={slope} />
                <feFuncB type="linear" slope={slope} />
                <feFuncA type="linear" slope={opacity} />
              </feComponentTransfer>
              <feComposite in={`${name}-c`} in2={`${name}-e`} operator="in" result={name} />
            </g>
          ))}
          <feMerge>
            <feMergeNode in="light" />
            <feMergeNode in="shade" />
          </feMerge>
        </filter>
        {LINKS.map((d, n) => (
          <mask key={d} id={`${id}-link-${n}`} maskUnits="userSpaceOnUse">
            <path
              d={d}
              fill="none"
              stroke="white"
              strokeWidth={px(10)}
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={1 - net.link(n)}
            />
          </mask>
        ))}
      </defs>
      {/* the camera on the world: zoomed round the point it looks at, which it puts where my community sits */}
      <g
        transform={`translate(${CENTRE.x} ${CENTRE.y}) scale(${w.zoom.toFixed(5)}) translate(${(-w.x).toFixed(2)} ${(-w.y).toFixed(2)})`}
      >
        {/* In groups, so the joy layer's split of a drawing's own paths leaves these to React. */}
        <g opacity={w.map} visibility={seen(w.map)}>
          {OTHERS.map((c) => (
            <FarCommunity key={`${c.x},${c.y}`} c={c} />
          ))}
        </g>
        <g>
          {NEIGHBOURS.map((c, n) => {
            const open = net.bloom(n, 0);
            // on the map from far; up close only when the connections beat goes to them
            const there = beat === 5 ? 1 : w.map;
            return (
              <g key={`${c.x},${c.y}`}>
                <FarCommunity c={c} opacity={there * (1 - Math.min(1, open * 1.5))} />
                {open > 0.001 && <Neighbour c={c} bloom={(j) => net.bloom(n, j)} />}
              </g>
            );
          })}
        </g>
        <g opacity={links} visibility={seen(links)}>
          {LINKS.map((d, n) => (
            <path
              key={d}
              d={d}
              mask={`url(#${id}-link-${n})`}
              fill="none"
              stroke="var(--text-primary)"
              strokeWidth={px(1.2)}
              strokeDasharray={`${px(4)} ${px(5)}`}
              strokeDashoffset={px(net.flow)}
              opacity={0.45}
            />
          ))}
        </g>
        {/* my community from far, its wave, until it bursts open */}
        <g visibility={seen(w.wave)}>
          <FarCommunity c={MINE} opacity={w.wave} />
        </g>
        {/* the dashed focus ring that picks it out on the far map */}
        <circle
          r={REACH * 1.25}
          fill="none"
          stroke="var(--text-primary)"
          strokeWidth={px(1.2)}
          strokeDasharray={`${px(5)} ${px(4)}`}
          opacity={0.55 * w.ring}
          visibility={seen(w.ring)}
        />
        <g
          transform={`rotate(${cam.rotate.toFixed(3)})`}
          opacity={1 - w.wave}
          visibility={seen(1 - w.wave)}
        >
          <g opacity={ghosts} visibility={seen(ghosts)}>
            {ghostLengths.map((r, i) => (
              <path
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed petals, one per position
                key={i}
                d={petalPath(i, r)}
                fill="none"
                stroke="var(--hairline)"
                strokeWidth={1}
                pathLength={1}
                strokeDasharray="1 1"
                strokeDashoffset={1 - ghostDrawn(beat, t, i)}
                opacity={0.75}
              />
            ))}
          </g>
          {/* each petal's thickness, a darker slab just under it, lit from the upper left like its highlight */}
          <g transform="translate(1.4 3)">
            {lengths.map((r, i) => {
              const paint = petalPaint(beat, t, i, fresh);
              return (
                <path
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed petals, one per position
                  key={i}
                  d={petalPath(i, r)}
                  fill={`color-mix(in srgb, ${mix(paint.from, paint.to, paint.k)} 68%, black)`}
                />
              );
            })}
          </g>
          <g>
            {lengths.map((r, i) => {
              const paint = petalPaint(beat, t, i, fresh);
              const fill = mix(paint.from, paint.to, paint.k);
              const lit = petalLit(beat, t, i);
              const d = petalPath(i, r, { round: HL.round * lit });
              return (
                <g
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed petals, one per position
                  key={i}
                >
                  {/* colours are moved here, frame by frame, so the joy layer's softening stands aside */}
                  <path data-part="wedge" d={d} fill={fill} style={{ transition: 'none' }} />
                  {lit > 0.001 && (
                    <>
                      <path d={d} fill={fill} filter={`url(#${id}-surface)`} opacity={lit} />
                      <path
                        d={petalPath(i, r - HL.stroke / 2, {
                          inner: INNER + HL.stroke / 2,
                          gutter: GUTTER + HL.stroke / 2,
                          round: Math.max(0, HL.round - HL.stroke / 2) * lit,
                        })}
                        fill="none"
                        stroke={darker(fill)}
                        strokeWidth={HL.stroke}
                        strokeLinejoin="round"
                        opacity={lit}
                      />
                    </>
                  )}
                </g>
              );
            })}
          </g>
          <circle r={34} fill="var(--surface)" />
          <circle r={34} fill="none" stroke="var(--hairline)" strokeWidth={1} />
          <g opacity={blocs} visibility={seen(blocs)}>
            {relations.map(([a, b], n) => {
              const [x1, y1] = atPetal(a, 35);
              const [x2, y2] = atPetal(b, 35);
              return (
                <path
                  key={`${a}-${b}`}
                  d={`M${x1.toFixed(2)} ${y1.toFixed(2)} Q${n % 2 ? 9 : -9} 4 ${x2.toFixed(2)} ${y2.toFixed(2)}`}
                  fill="none"
                  stroke="var(--text-primary)"
                  strokeWidth={1.2}
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray="1 1"
                  strokeDashoffset={1 - relationDrawn(beat, t, n)}
                  opacity={0.45}
                />
              );
            })}
          </g>
          <g opacity={votes} visibility={seen(votes)}>
            <circle
              r={ORBIT}
              fill="none"
              stroke="var(--hairline)"
              strokeWidth={1}
              opacity={0.6 * vote.ring}
              transform={`scale(${(0.92 + 0.08 * vote.ring).toFixed(4)})`}
            />
            <path
              d={`M-132 -132 A${ORBIT} ${ORBIT} 0 0 1 132 -132`}
              fill="none"
              stroke="var(--figure-accent)"
              strokeWidth={2.5}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={1 - vote.arc}
            />
            <circle
              cy={-ORBIT}
              r={6 * vote.point}
              fill="var(--figure-accent)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
            {Array.from({ length: PETALS }, (_, i) => {
              const v = voteOf(i);
              if (!v) return null;
              const [cx, cy] = atPetal(i, 28);
              return (
                <circle
                  // biome-ignore lint/suspicious/noArrayIndexKey: one mark per petal position
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={3.2 * vote.vote(i)}
                  fill={v === 'against' ? AGAINST : PAINT.accent}
                  stroke="var(--surface)"
                  strokeWidth={1.5}
                />
              );
            })}
          </g>
          <circle r={3.5} fill="var(--text-primary)" />
        </g>
      </g>
    </svg>
  );
}

/**
 * Behind the flower, its own layer: a light that moves a third as much as the flower does, so the two sit at
 * different depths, tinted by the blocs' second key while they show. The page places it as it places the flower.
 */
export function StoryLight({
  beat,
  t,
  fresh = false,
}: {
  beat: number;
  t: number;
  fresh?: boolean;
}) {
  const id = useId().replace(/[^\w-]/g, '');
  const light = glow(beat, t, fresh);
  return (
    <svg
      data-b="figure"
      data-kind="symbol"
      aria-hidden="true"
      viewBox="0 0 600 440"
      className="block size-full overflow-visible"
      style={KEYED}
    >
      <defs>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor="var(--figure-accent)" stopOpacity={0.3} />
          <stop offset="0.55" stopColor="var(--figure-accent)" stopOpacity={0.08} />
          <stop offset="1" stopColor="var(--figure-accent)" stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${id}-second`}>
          <stop offset="0" stopColor="var(--story-second)" stopOpacity={0.28} />
          <stop offset="1" stopColor="var(--story-second)" stopOpacity={0} />
        </radialGradient>
      </defs>
      <g
        transform={`translate(${CENTRE.x} ${CENTRE.y}) scale(${light.scale.toFixed(4)})`}
        opacity={light.opacity}
      >
        <circle r={250} fill={`url(#${id}-glow)`} />
        <circle r={210} fill={`url(#${id}-second)`} opacity={light.second} />
      </g>
    </svg>
  );
}
