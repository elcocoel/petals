// Figma's Questions Petals answers (66:2289): the FAQ's cards, from the FAQ tab. The little drawings beside
// them were placeholders from the old look, and went with one-source.md's step 8 (10 Nov): nothing
// petal-shaped comes from lib/figures.ts. Since Elco's walk (12 Nov: "the FAQ section will need more
// styling"; fewer numbers) its title stands in a column of its own, held in view while the questions pass on
// a wide window, and the questions run without their numbers. 13 Nov (Elco): the title just says FAQ and
// takes a narrower column; one answer is open at a time (FaqItem, row.peek).
import { landingCopy } from '../../lib/landing-copy.ts';
import { FaqItem } from '../ui/FaqItem.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionName } from '../ui/SectionName.tsx';

const copy = landingCopy.questions;

export function Questions() {
  return (
    <Section tone="stone" rule="top">
      <div className="grid grid-cols-1 gap-column-gap lg:grid-cols-6">
        <div>
          <div className="lg:sticky lg:top-section-padding">
            <SectionName name={copy.title} look="pixel" />
          </div>
        </div>
        <div className="border-t border-hairline lg:col-span-5">
          {copy.items.map(({ index, ...item }) => (
            <FaqItem key={index} {...item} />
          ))}
        </div>
      </div>
    </Section>
  );
}
