// Figma's Footer (66:2360): the big wordmark, the links, the small print. GitHub goes public before
// submission (T149, T150), and Community has no address yet.
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { Mono } from './Mono.tsx';
import { Section } from './Section.tsx';
import { TextLink } from './TextLink.tsx';
import { Wordmark } from './Wordmark.tsx';

export function Footer() {
  const copy = landingCopy.footer;
  return (
    <Section as="footer" padding="bar" rule="top">
      <div className="flex flex-col gap-column-gap">
        <div className="flex flex-col gap-block-gap lg:flex-row lg:items-end lg:justify-between">
          <Wordmark size="footer" />
          <div className="flex flex-wrap gap-x-space-32 gap-y-text-gap">
            <TextLink href={siteLinks.gallery}>{copy.links.gallery}</TextLink>
            <TextLink href={siteLinks.howItWorks}>{copy.links.howItWorks}</TextLink>
            <TextLink href={siteLinks.connect}>{copy.links.docs}</TextLink>
          </div>
        </div>
        <Mono>{copy.built}</Mono>
      </div>
    </Section>
  );
}
