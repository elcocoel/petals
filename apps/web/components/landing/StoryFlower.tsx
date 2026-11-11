// The hero story's flower (HERO ART's V2, Elco 11 Nov): one symbolic flower that changes with the story, not a
// reading and not the live renderer, so it never goes out of date as the look evolves. 24 petals round a centre,
// straight sides and arc tops with a fine line between them, in the look's keys. Per beat (lib/hero-story.ts):
// it opens; the petals grow apart and the strongest come forward; two groups take shared colours with a few lines
// between them; the heights move against a faint earlier outline; a proposal's arc and its vote marks appear; it
// pulls back as two other communities appear, linked to it. Every number here comes from that file; this only
// draws. Under version 2 the petals' colours change softly (figure.grow, app/versions/v2.css).
import { KEYS } from '@petal/core/wedge/keys';
import type { CSSProperties } from 'react';
import {
  atPetal,
  type Fill,
  flowerScale,
  ghostLengths,
  layerOpacity,
  PETALS,
  petalFill,
  petalLengths,
  relations,
  sector,
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

/** Where the main flower sits in the drawing, and where the two it leads to sit. */
const CENTRE = { x: 300, y: 205 };
const OTHERS = [
  { x: 92, y: 235 },
  { x: 490, y: 134 },
];
const LINKS = ['M138 232 C179 183 193 264 243 229', 'M356 186 C415 198 401 112 447 133'];
/** The proposal's ring and its arc, over the top of the flower. */
const ORBIT = 187;

function Other({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {Array.from({ length: 14 }, (_, i) => (
        <path
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed petals, one per position
          key={i}
          d={sector(i, 30 + 18 * (0.5 + 0.5 * Math.cos(i * 0.55)), 12, 14)}
          fill={i < 3 ? PAINT.accent : PAINT.petal}
          stroke="var(--surface)"
          strokeWidth={1}
        />
      ))}
      <circle r={11} fill="var(--surface)" />
    </g>
  );
}

export function StoryFlower({ beat, t }: { beat: number; t: number }) {
  const lengths = petalLengths(beat, t);
  const scale = flowerScale(beat, t);
  const y = CENTRE.y + (1 - (scale - 0.65) / 0.35) * 8;
  return (
    <svg
      data-b="figure"
      data-kind="symbol"
      aria-hidden="true"
      viewBox="0 0 600 440"
      className="block size-full overflow-visible"
      style={KEYED}
    >
      {/* In groups, so the joy layer's split of a drawing's own paths leaves these to React. */}
      <g opacity={layerOpacity(5, beat, t)}>
        {LINKS.map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke="var(--text-primary)"
            strokeWidth={1.2}
            strokeDasharray="4 5"
            opacity={0.4}
          />
        ))}
        {OTHERS.map((o) => (
          <Other key={`${o.x},${o.y}`} {...o} />
        ))}
      </g>
      <g transform={`translate(${CENTRE.x} ${y}) scale(${scale})`}>
        <g opacity={layerOpacity(3, beat, t)}>
          {ghostLengths.map((r, i) => (
            <path
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed petals, one per position
              key={i}
              d={sector(i, r)}
              fill="none"
              stroke="var(--hairline)"
              strokeWidth={1}
              opacity={0.6}
            />
          ))}
        </g>
        <g>
          {lengths.map((r, i) => (
            <path
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed petals, one per position
              key={i}
              data-part="wedge"
              d={sector(i, r)}
              fill={PAINT[petalFill(beat, i)]}
              stroke="var(--surface)"
              strokeWidth={2.2}
            />
          ))}
        </g>
        <circle r={34} fill="var(--surface)" stroke="var(--hairline)" strokeWidth={1} />
        <g opacity={layerOpacity(2, beat, t)}>
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
                opacity={0.45}
              />
            );
          })}
        </g>
        <g opacity={layerOpacity(4, beat, t)}>
          <circle r={ORBIT} fill="none" stroke="var(--hairline)" strokeWidth={1} opacity={0.6} />
          <path
            d={`M-132 -132 A${ORBIT} ${ORBIT} 0 0 1 132 -132`}
            fill="none"
            stroke="var(--figure-accent)"
            strokeWidth={2.5}
          />
          <circle
            cy={-ORBIT}
            r={6}
            fill="var(--figure-accent)"
            stroke="var(--surface)"
            strokeWidth={2}
          />
          {Array.from({ length: PETALS }, (_, i) => {
            const vote = voteOf(i);
            if (!vote) return null;
            const [cx, cy] = atPetal(i, 28);
            return (
              <circle
                // biome-ignore lint/suspicious/noArrayIndexKey: one mark per petal position
                key={i}
                cx={cx}
                cy={cy}
                r={3.2}
                fill={vote === 'against' ? AGAINST : PAINT.accent}
                stroke="var(--surface)"
                strokeWidth={1.5}
              />
            );
          })}
        </g>
        <circle r={3.5} fill="var(--text-primary)" />
      </g>
    </svg>
  );
}
