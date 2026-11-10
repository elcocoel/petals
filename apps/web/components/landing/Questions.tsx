// Figma's Questions Petals answers (66:2289): the FAQ's cards, the whole width of the band, from the FAQ
// tab. The little drawings beside them were placeholders from the old look, and went with one-source.md's
// step 8 (10 Nov): nothing petal-shaped comes from lib/figures.ts.
import { landingCopy } from '../../lib/landing-copy.ts';
import { FaqItem } from '../ui/FaqItem.tsx';
import { Section } from '../ui/Section.tsx';

const copy = landingCopy.questions;

export function Questions() {
  return (
    <Section tone="stone" rule="top">
      <div className="border-t border-hairline">
        {copy.items.map((item) => (
          <FaqItem key={item.index} {...item} />
        ))}
      </div>
    </Section>
  );
}
