// Petals / Thumb: a flower in miniature, one component with a kind. Inline, in role paints.
import { type ThumbKind, thumbs } from '../../lib/figures.ts';
import { Drawing } from './Drawing.tsx';

const SIZES = {
  strip: 'size-drawing-72',
  step: 'size-drawing-144',
  card: 'size-drawing-240',
} as const;

export function Thumb({ kind, size = 'card' }: { kind: ThumbKind; size?: keyof typeof SIZES }) {
  return <Drawing drawing={thumbs[kind]} className={`shrink-0 ${SIZES[size]}`} />;
}
