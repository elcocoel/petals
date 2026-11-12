// The hero story's flower (HERO ART's V2, Elco 11 Nov; HERO MOTION's choreography): one symbolic flower that
// changes with the story, not a reading and not the live renderer, so it never goes out of date as the look
// evolves; closer to the real thing (Elco, 12 Nov): flat petals in the look's keys, straight sides and arc tops
// with a fine line of one width between them, a wide white centre, no light, shade or glow. In a world the camera
// moves through: the far map the story opens and closes on, my community and its two neighbours, each drawn from
// far as the real far map draws one (lib/hero-map.ts). Per beat (lib/hero-story.ts): the camera dives in from the
// far map and my community bursts out of its wave; the heights part, and the strongest three keep their colour as
// everyone else recedes, their shares on leader lines; one voting bloc lights, then another; the petals travel
// round the circle to the order of who voted last; proposals stack over the petals of whoever put them up, one is
// pressed and its voters' dots land at their petals' feet; the camera pulls back as two neighbours bloom, reached
// by running lines, and then all the way out to the far map. Every number comes from those files; this only draws.
import { GREY, KEYS } from '@petal/core/wedge/keys';
import type { CSSProperties } from 'react';
import { useId } from 'react';
import { type Community, MINE, NEIGHBOURS, OTHERS } from '../../lib/hero-map.ts';
import {
  atPetal,
  camera,
  type Fill,
  GUTTER,
  INNER,
  layerOpacity,
  network,
  PETALS,
  PRESSED,
  PROPOSALS,
  petalLengths,
  petalLit,
  petalPaint,
  petalPath,
  placeOf,
  proposal,
  STACK_FOLD,
  sharePercent,
  voteOf,
  world,
} from '../../lib/hero-story.ts';

/** The look's own keys, handed over as data on the drawing (as the flower's fills are), and painted from there. */
const key = (name: string) => KEYS.find((k) => k.name === name)?.hex ?? '';
const FILLS: readonly Fill[] = ['mint', 'blue', 'coral', 'apricot', 'pink'];
const KEYED = Object.fromEntries([
  ...FILLS.map((f) => [`--story-${f}`, key(f)]),
  ['--story-grey', GREY.hex],
]) as CSSProperties;
const PAINT: Record<Fill, string> = {
  mint: 'var(--story-mint)',
  blue: 'var(--story-blue)',
  coral: 'var(--story-coral)',
  apricot: 'var(--story-apricot)',
  pink: 'var(--story-pink)',
  grey: 'var(--story-grey)',
};

/** A colour on its way from one key to another, mixed by the browser so a theme's keys are kept. */
const mix = (from: Fill, to: Fill, k: number) =>
  k >= 1
    ? PAINT[to]
    : k <= 0
      ? PAINT[from]
      : `color-mix(in srgb, ${PAINT[to]} ${(k * 100).toFixed(1)}%, ${PAINT[from]})`;

/** Where my community sits in the drawing when the camera is on it. */
const CENTRE = { x: 300, y: 205 };
/** How far out my community's petals reach at most, for the lines and the focus ring. */
const REACH = 185;
/** The faint circle round my community, where the labels of its strongest sit. */
const OUTER = 196;
/** How far apart a petal's proposals stack outward, and how far over its top the first sits (the real STACK_GAP). */
const STACK = { gap: 6, over: 6 };
const STEP = (2 * Math.PI) / PETALS;

const seen = (v: number) => (v > 0.001 ? undefined : 'hidden');
/** A community's mark from far, as much of the hole in its wave as a logo fills on the real map. */
const MARK = 0.72;

/** A neighbour's petals by kind, as my community's are: mostly mint. */
const NEIGHBOUR_KINDS: readonly Fill[] = [
  'mint',
  'mint',
  'blue',
  'mint',
  'coral',
  'mint',
  'apricot',
  'blue',
];

/** A vote's colour, as the real legend says it: mint for, pink against, grey abstained or neither. */
const VOTE_PAINT = { for: 'mint', against: 'pink', abstain: 'grey' } as const;

/** A community from far: its soft wave, the hole in it, and a dark mark where its logo would be. */
function FarCommunity({ c, opacity = 1 }: { c: Community; opacity?: number }) {
  return (
    <g transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`} opacity={opacity * c.seen}>
      <path d={c.wave} fill={PAINT.mint} fillRule="evenodd" />
      <circle r={c.inner * MARK} fill="var(--text-primary)" />
    </g>
  );
}

/** A neighbour up close: its petals bursting out of its wave. */
function Neighbour({ c, bloom }: { c: Community; bloom: (j: number) => number }) {
  const n = c.heights.length;
  return (
    <g transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`}>
      {c.heights.map((h, j) => (
        <path
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed petals, one per position
          key={j}
          d={petalPath(j, c.inner + h * bloom(j), { inner: c.inner, count: n, gutter: GUTTER })}
          fill={PAINT[NEIGHBOUR_KINDS[j % NEIGHBOUR_KINDS.length] ?? 'mint']}
        />
      ))}
      <circle r={c.inner - 0.5} fill="var(--surface)" />
      <circle r={c.inner * MARK * 0.4} fill="var(--text-primary)" />
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

/** An arc over a petal's own stretch of the circle, at `r`, the fine gap kept at each end, as the real ones sit. */
function arcOver(place: number, r: number): string {
  const a0 = -Math.PI / 2 + place * STEP;
  const pad = Math.min(STEP / 4, (GUTTER + 0.6) / r);
  const [x0, y0] = [Math.cos(a0 + pad) * r, Math.sin(a0 + pad) * r];
  const [x1, y1] = [Math.cos(a0 + STEP - pad) * r, Math.sin(a0 + STEP - pad) * r];
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * The proposals, as the real flower stacks them over the petal of whoever put them up, oldest nearest; a stack of
 * more than three folds into one mark with its count. One is pressed, darker, and each voter's dot lands just inside
 * the centre, under its petal's foot, in its vote's colour; no vote, no dot.
 */
function Proposals({
  beat,
  t,
  lengths,
  places,
}: {
  beat: number;
  t: number;
  lengths: readonly number[];
  places: readonly number[];
}) {
  const p = proposal(beat, t);
  if (p.on < 0.002) return null;
  let n = 0;
  return (
    <g opacity={p.on}>
      {PROPOSALS.map(({ petal, count }) => {
        const place = places[petal] ?? petal;
        const top = (lengths[petal] ?? INNER) + STACK.over;
        const folded = count > STACK_FOLD;
        const arcs = folded ? 1 : count;
        return (
          <g key={petal}>
            {Array.from({ length: arcs }, (_, step) => {
              const k = p.arc(n++);
              if (k < 0.002) return null;
              const pressed = petal === PRESSED.petal && step === PRESSED.step;
              return (
                <path
                  // biome-ignore lint/suspicious/noArrayIndexKey: one arc per place in the stack
                  key={step}
                  d={arcOver(place, top + step * STACK.gap)}
                  fill="none"
                  stroke="var(--text-primary)"
                  strokeWidth={folded ? 3.2 : pressed ? 1.8 + 1.4 * p.pressed : 1.8}
                  opacity={k * (pressed ? 0.5 + 0.5 * p.pressed : 0.5)}
                />
              );
            })}
            {folded &&
              (() => {
                const [x, y] = atPetal(place, top + 12);
                return (
                  <text
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="type-mono"
                    fill="var(--text-primary)"
                    opacity={p.arc(n - 1)}
                  >
                    {count}
                  </text>
                );
              })()}
          </g>
        );
      })}
      {places.map((place, i) => {
        const v = voteOf(i);
        if (!v) return null;
        const [cx, cy] = atPetal(place, INNER - 7);
        return (
          <circle
            // biome-ignore lint/suspicious/noArrayIndexKey: one dot per petal
            key={i}
            cx={cx}
            cy={cy}
            r={2.8 * p.vote(i)}
            fill={PAINT[VOTE_PAINT[v]]}
          />
        );
      })}
    </g>
  );
}

export function StoryFlower({ beat, t }: { beat: number; t: number }) {
  const id = useId().replace(/[^\w-]/g, '');
  const lengths = petalLengths(beat, t);
  const places = lengths.map((_, i) => placeOf(beat, t, i));
  const cam = camera(beat, t);
  const w = world(beat, t);
  const net = network(beat, t);
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
          r={REACH * 1.35}
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
          <g>
            {lengths.map((r, i) => {
              const paint = petalPaint(beat, t, i);
              return (
                // colours are moved here, frame by frame, so the joy layer's softening stands aside
                <path
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed petals, one per wallet
                  key={i}
                  data-part="wedge"
                  d={petalPath(places[i] ?? i, r)}
                  fill={mix(paint.from, paint.to, paint.k)}
                  style={{ transition: 'none' }}
                />
              );
            })}
          </g>
          {/* the centre, wide and white as the real flower's, with a dark mark where its logo would be */}
          <circle r={INNER - 1} fill="var(--surface)" />
          <circle r={INNER - 1} fill="none" stroke="var(--hairline)" strokeWidth={1} />
          <circle r={INNER * 0.22} fill="var(--text-primary)" />
          {/* the faint circle the real flower stands in, where its labels sit */}
          <circle r={OUTER} fill="none" stroke="var(--hairline)" strokeWidth={1} opacity={0.7} />
          {/* the strongest few's shares, on leader lines from their tips, as each is highlighted */}
          {lengths.slice(0, 3).map((r, i) => {
            const lit = petalLit(beat, t, i);
            if (lit < 0.002) return null;
            const place = places[i] ?? i;
            const [x1, y1] = atPetal(place, r + 3);
            const [x2, y2] = atPetal(place, OUTER + 4);
            const right = 10 + 6 * i;
            return (
              <g
                // biome-ignore lint/suspicious/noArrayIndexKey: one label per strongest petal
                key={i}
                opacity={lit}
              >
                <circle cx={x1} cy={y1} r={2} fill="var(--text-primary)" />
                <path
                  d={`M${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)} l${right} 0`}
                  fill="none"
                  stroke="var(--text-primary)"
                  strokeWidth={0.8}
                  opacity={0.6}
                />
                <text
                  x={x2 + right + 4}
                  y={y2}
                  dominantBaseline="middle"
                  className="type-mono"
                  fill="var(--text-primary)"
                >
                  {`${(sharePercent[i] ?? 0).toFixed(1)}%`}
                </text>
              </g>
            );
          })}
          <Proposals beat={beat} t={t} lengths={lengths} places={places} />
        </g>
      </g>
    </svg>
  );
}
