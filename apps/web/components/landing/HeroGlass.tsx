// The hero's glass (Elco, 11 Nov: "making it feel like Minority Report ... simulating a 3D dimensionality
// material"): the material behind its two bubbles, drawn rather than styled, like the flower, so it can be as
// free as the story needs. A soft shadow under it; a body of glass, light for the person's question, smoked
// ink for Petals' answer; a rim of light round its edge, brightest on the side the light comes from (the upper
// left for the question, the flower's side for the answer, in the flower's own mint); faint scan lines in the dark
// one; and a glint that passes across as the panel lands. It fills the box it's put in; the words sit over it.
import { useId } from 'react';

export type GlassTone = 'light' | 'dark';

/** Its corners, in px: the glass's own, not a version's, as the flower's geometry is its own. */
const CORNER = 18;

export function Glass({
  tone,
  facing = 'left',
  glint = 1,
  glow = 1,
}: {
  tone: GlassTone;
  /** The side its light comes from: the upper left, or the flower's side. */
  facing?: 'left' | 'right';
  /** How far the glint has crossed it, 0 to 1; at 1 it has gone. */
  glint?: number;
  /** How bright its rim and inner light are, 0 to 1. */
  glow?: number;
}) {
  const id = useId().replace(/[^\w-]/g, '');
  const dark = tone === 'dark';
  const body = dark ? 'var(--action-background)' : 'var(--surface)';
  const rim = dark ? 'var(--figure-accent)' : 'var(--surface)';
  const from = facing === 'left' ? '0' : '1';
  const to = facing === 'left' ? '1' : '0';
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 block size-full overflow-visible"
    >
      <defs>
        <linearGradient id={`${id}-body`} x1={from} y1="0" x2={to} y2="1">
          <stop offset="0" stopColor={body} stopOpacity={dark ? 0.94 : 0.92} />
          <stop offset="1" stopColor={body} stopOpacity={dark ? 0.82 : 0.62} />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1={from} y1="0" x2={to} y2="1">
          <stop offset="0" stopColor={rim} stopOpacity={0.95 * glow} />
          <stop offset="0.45" stopColor={rim} stopOpacity={0.1 * glow} />
          <stop
            offset="1"
            stopColor={dark ? 'var(--action-text)' : 'var(--hairline)'}
            stopOpacity={dark ? 0.18 : 0.7}
          />
        </linearGradient>
        <radialGradient
          id={`${id}-inner`}
          cx={facing === 'left' ? '0' : '1'}
          cy="0.2"
          r="0.9"
          gradientTransform={`translate(${facing === 'left' ? 0 : 1} 0.2) scale(0.6 1) translate(${facing === 'left' ? 0 : -1} -0.2)`}
        >
          <stop
            offset="0"
            stopColor="var(--figure-accent)"
            stopOpacity={(dark ? 0.32 : 0.12) * glow}
          />
          <stop offset="1" stopColor="var(--figure-accent)" stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`${id}-glint`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--surface)" stopOpacity={0} />
          <stop
            offset="0.5"
            stopColor={dark ? 'var(--action-text)' : 'var(--surface)'}
            stopOpacity={dark ? 0.16 : 0.9}
          />
          <stop offset="1" stopColor="var(--surface)" stopOpacity={0} />
        </linearGradient>
        <pattern id={`${id}-lines`} width="4" height="3" patternUnits="userSpaceOnUse">
          <rect width="4" height="1" fill="var(--action-text)" opacity={0.045} />
        </pattern>
        <clipPath id={`${id}-shape`}>
          <rect width="100%" height="100%" rx={CORNER} />
        </clipPath>
        {/* the glass's own edge shows only outside its face: what a thick pane shows when it's turned */}
        <mask
          id={`${id}-outside`}
          maskUnits="userSpaceOnUse"
          x="-20%"
          y="-20%"
          width="140%"
          height="160%"
        >
          <rect x="-20%" y="-20%" width="140%" height="160%" fill="white" />
          <rect width="100%" height="100%" rx={CORNER} fill="black" />
        </mask>
        <filter id={`${id}-shadow`} x="-40%" y="-40%" width="180%" height="200%">
          <feGaussianBlur stdDeviation={dark ? 18 : 14} />
        </filter>
      </defs>
      {/* the shadow it casts, further below the nearer it is */}
      <rect
        x="4%"
        y={dark ? 22 : 14}
        width="92%"
        height="100%"
        rx={CORNER}
        fill="var(--text-primary)"
        opacity={dark ? 0.32 : 0.12}
        filter={`url(#${id}-shadow)`}
      />
      <rect
        x={facing === 'left' ? 2.5 : -2.5}
        y={4}
        width="100%"
        height="100%"
        rx={CORNER}
        fill={dark ? 'var(--action-background)' : 'var(--hairline)'}
        opacity={dark ? 1 : 0.55}
        mask={`url(#${id}-outside)`}
      />
      {dark && (
        <rect
          x={facing === 'left' ? 2.5 : -2.5}
          y={4}
          width="100%"
          height="100%"
          rx={CORNER}
          fill="none"
          stroke="var(--figure-accent)"
          strokeOpacity={0.35 * glow}
          mask={`url(#${id}-outside)`}
        />
      )}
      <g clipPath={`url(#${id}-shape)`}>
        <rect width="100%" height="100%" fill={`url(#${id}-body)`} />
        <rect width="100%" height="100%" fill={`url(#${id}-inner)`} />
        {dark && <rect width="100%" height="100%" fill={`url(#${id}-lines)`} />}
        {glint > 0 && glint < 1 && (
          <rect
            x={`${(-50 + 170 * glint).toFixed(2)}%`}
            y="-20%"
            width="38%"
            height="140%"
            fill={`url(#${id}-glint)`}
            transform="skewX(-18)"
          />
        )}
      </g>
      <rect
        x="0.5"
        y="0.5"
        width="100%"
        height="100%"
        rx={CORNER}
        fill="none"
        stroke={`url(#${id}-rim)`}
        strokeWidth={1}
        transform="translate(-0.5 -0.5)"
      />
    </svg>
  );
}
