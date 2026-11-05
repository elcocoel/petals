// Figma's Questions Petals answers (66:2289).
import type { GlyphKind } from '../../lib/figures.ts';
import { landingCopy } from '../../lib/landing-copy.ts';
import { FaqItem } from '../ui/FaqItem.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';

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
    <Section rule="top" layout="split">
      <SectionHead eyebrow={copy.eyebrow} title={copy.title} body={copy.body} />
      <div className="border-t border-hairline">
        {copy.items.map((item, i) => (
          <FaqItem key={item.index} glyph={GLYPHS[i] ?? 'concentration'} {...item} />
        ))}
      </div>
    </Section>
  );
}
