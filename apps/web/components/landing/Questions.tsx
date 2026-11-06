// Figma's Questions Petals answers (66:2289): the FAQ's cards, the whole width of the band. The little
// drawings are placeholders Elco will change, so they repeat for now.
import type { GlyphKind } from '../../lib/figures.ts';
import { landingCopy } from '../../lib/landing-copy.ts';
import { FaqItem } from '../ui/FaqItem.tsx';
import { Section } from '../ui/Section.tsx';

const copy = landingCopy.questions;
const GLYPHS: readonly GlyphKind[] = [
  'concentration',
  'flows',
  'bloc',
  'same-hands',
  'empty-quorum',
  'payout',
];

export function Questions() {
  return (
    <Section tone="stone" rule="top">
      <div className="border-t border-hairline">
        {copy.items.map((item, i) => (
          <FaqItem
            key={item.index}
            glyph={GLYPHS[i % GLYPHS.length] ?? 'concentration'}
            {...item}
          />
        ))}
      </div>
    </Section>
  );
}
