// Figma's Footer (66:2360): the big wordmark, the links, the small print.
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { MetaRow } from './MetaRow.tsx';
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
            <TextLink href={siteLinks.community}>{copy.links.community}</TextLink>
            <TextLink href={siteLinks.noDestination}>{copy.links.github}</TextLink>
          </div>
        </div>
        <MetaRow start={copy.built} end={copy.tagline} />
      </div>
    </Section>
  );
}
