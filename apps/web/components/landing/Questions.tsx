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
    <Section rule="top">
      <div className="flex flex-col gap-section-inset lg:flex-row lg:items-start">
        <div className="w-full min-w-0 lg:max-w-intro-width lg:flex-1">
          <SectionHead eyebrow={copy.eyebrow} title={copy.title} body={copy.body} />
        </div>
        <div className="w-full min-w-0 border-t border-hairline lg:flex-1">
          {copy.items.map((item, i) => (
            <FaqItem key={item.index} glyph={GLYPHS[i] ?? 'concentration'} {...item} />
          ))}
        </div>
      </div>
    </Section>
  );
}
