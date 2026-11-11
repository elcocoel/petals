// The hero story's flower (HERO ART's V2, Elco 11 Nov; HERO MOTION's choreography): one symbolic flower that
// changes with the story, not a reading and not the live renderer, so it never goes out of date as the look
// evolves. 24 petals round a centre, straight sides and arc tops with a fine line of one width between them, in
// the look's keys. Per beat (lib/hero-story.ts): it lands and unfurls; the heights part, petal after petal, and
// the strongest take the highlight; two groups take shared colours and a few lines draw between them; the heights
// move against an earlier outline that draws itself round; a proposal's ring opens, its arc draws over the top and
// the vote marks land; the camera pulls back as two other communities bloom, reached by running lines. A light
// behind it moves less than it does, for depth. Every number comes from that file; this only draws.
import { KEYS } from '@petal/core/wedge/keys';
import type { CSSProperties } from 'react';
import { useId } from 'react';
import {
  atPetal,
  camera,
  centre,
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

/** Where the main flower sits in the drawing, and where the two it leads to sit. */
const CENTRE = { x: 300, y: 205 };
const OTHERS = [
  { x: 92, y: 235 },
  { x: 490, y: 134 },
];
const LINKS = ['M243 229 C193 264 179 183 138 232', 'M356 186 C415 198 401 112 447 133'];
const OTHER_PETALS = 14;
const otherLength = (j: number) => 30 + 18 * (0.5 + 0.5 * Math.cos(j * 0.55));
/** The proposal's ring and its arc, over the top of the flower. */
const ORBIT = 187;

const seen = (v: number) => (v > 0.001 ? undefined : 'hidden');

function Other({
  x,
  y,
  bloom,
  scale,
}: {
  x: number;
  y: number;
  bloom: (j: number) => number;
  scale: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale.toFixed(4)})`}>
      {Array.from({ length: OTHER_PETALS }, (_, j) => (
        <path
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed petals, one per position
          key={j}
          d={petalPath(j, 12 + (otherLength(j) - 12) * bloom(j), {
            inner: 12,
            count: OTHER_PETALS,
            gutter: 0.8,
          })}
          fill={j < 3 ? PAINT.accent : PAINT.petal}
        />
      ))}
      <circle r={10.5} fill="var(--surface)" />
      <circle r={1.8 * Math.min(1, bloom(0) * 1.4)} fill="var(--text-primary)" />
    </g>
  );
}

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
  const lengths = petalLengths(beat, t, fresh);
  const cam = camera(beat, t, fresh);
  const core = centre(beat, t, fresh);
  const vote = proposal(beat, t);
  const net = network(beat, t);
  const ghosts = layerOpacity(3, beat, t);
  const blocs = layerOpacity(2, beat, t);
  const votes = layerOpacity(4, beat, t);
  const others = layerOpacity(5, beat, t);
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
              strokeWidth={8}
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={1 - net.link(n)}
            />
          </mask>
        ))}
      </defs>
      {/* In groups, so the joy layer's split of a drawing's own paths leaves these to React. */}
      <g opacity={others} visibility={seen(others)}>
        {LINKS.map((d, n) => (
          <path
            key={d}
            d={d}
            mask={`url(#${id}-link-${n})`}
            fill="none"
            stroke="var(--text-primary)"
            strokeWidth={1.2}
            strokeDasharray="4 5"
            strokeDashoffset={net.flow}
            opacity={0.45}
          />
        ))}
        {OTHERS.map((o, n) => (
          <Other key={`${o.x},${o.y}`} {...o} bloom={(j) => net.bloom(n, j)} scale={net.scale} />
        ))}
      </g>
      <g
        transform={`translate(${CENTRE.x} ${(CENTRE.y + cam.y).toFixed(2)}) scale(${cam.scale.toFixed(4)}) rotate(${cam.rotate.toFixed(3)})`}
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
        <circle r={34 * (0.6 + 0.4 * core.dot)} fill="var(--surface)" />
        <circle
          r={34}
          fill="none"
          stroke="var(--hairline)"
          strokeWidth={1}
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={1 - core.ring}
          transform="rotate(-90)"
        />
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
        <circle r={3.5 * core.dot} fill="var(--text-primary)" />
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
