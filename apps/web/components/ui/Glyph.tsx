// Petals / Glyph: a question's small flower, one component with a kind. Inline, in role paints.
import { type GlyphKind, glyphs } from '../../lib/figures.ts';
import { Drawing } from './Drawing.tsx';

const SIZES = { row: 'size-drawing-48', step: 'size-drawing-144' } as const;

export function Glyph({ kind, size = 'row' }: { kind: GlyphKind; size?: keyof typeof SIZES }) {
  return <Drawing drawing={glyphs[kind]} className={`shrink-0 ${SIZES[size]}`} />;
}
