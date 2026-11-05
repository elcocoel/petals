// Petals / Thumb: a flower in miniature, one component with a kind. Inline, in role paints.
import { type ThumbKind, thumbs } from '../../lib/figures.ts';
import { Drawing } from './Drawing.tsx';

const SIZES = {
  strip: 'size-thumb-strip',
  step: 'size-thumb-step',
  card: 'size-thumb-card',
} as const;

export function Thumb({ kind, size = 'card' }: { kind: ThumbKind; size?: keyof typeof SIZES }) {
  return <Drawing drawing={thumbs[kind]} className={`shrink-0 ${SIZES[size]}`} />;
}
