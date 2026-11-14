// Figma's Questions Petals answers (66:2289): the FAQ, from the copy's FAQ tab. Its name stands in a narrow column
// of its own, held in view while the questions pass on a wide window; the questions run without numbers, and one
// answer is open at a time (FaqItem, row.peek). Nothing petal-shaped comes from lib/figures.ts.
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { FaqItem } from '../ui/FaqItem.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionName } from '../ui/SectionName.tsx';

const copy = landingCopy.questions;
/** The answers' bold phrases that are links. */
const links = { 'Our Telegram chat': siteLinks.socials.telegram };

export function Questions() {
  return (
    <Section tone="stone" rule="top">
      <div className="grid grid-cols-1 gap-column-gap lg:grid-cols-6">
        <div>
          <div className="lg:sticky lg:top-section-padding">
            <SectionName name={copy.title} />
          </div>
        </div>
        <div className="border-t border-hairline lg:col-span-5">
          {copy.items.map(({ index, ...item }) => (
            <FaqItem key={index} {...item} links={links} />
          ))}
        </div>
      </div>
    </Section>
  );
}
