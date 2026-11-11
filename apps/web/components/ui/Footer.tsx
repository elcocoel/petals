// Figma's Footer (66:2360), styled in the system (11 Nov, board card 104): the big wordmark and, across from it,
// the site's own pages in two short groups, Petals and Build, their tops on one line; the small print closes it at
// the bottom. Tall and spacious on the mint ground (Elco, 12 Nov: "cozy, like a sensation of conclusion"). Only
// links that go somewhere: GitHub joins Build once the repo is public.
import type { ReactNode } from 'react';
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { Mono } from './Mono.tsx';
import { Section } from './Section.tsx';
import { TextLink } from './TextLink.tsx';
import { Wordmark } from './Wordmark.tsx';

function Group({ name, children }: { name: string; children: ReactNode }) {
  return (
    <nav aria-label={name} className="flex flex-col items-start gap-text-gap">
      <Mono>{name}</Mono>
      {children}
    </nav>
  );
}

export function Footer() {
  const copy = landingCopy.footer;
  return (
    <Section as="footer" kind="mint">
      <div className="flex flex-col gap-section-padding md:py-section-padding">
        <div className="flex flex-col gap-column-gap lg:flex-row lg:items-start lg:justify-between">
          <Wordmark size="footer" />
          <div className="flex flex-wrap gap-x-section-padding gap-y-column-gap">
            <Group name={copy.groups.petals}>
              <TextLink href={siteLinks.map}>{copy.links.gallery}</TextLink>
              <TextLink href={siteLinks.howItWorks}>{copy.links.howItWorks}</TextLink>
              <TextLink href={siteLinks.lobby}>{copy.links.connect}</TextLink>
            </Group>
            <Group name={copy.groups.build}>
              <TextLink href={siteLinks.docs}>{copy.links.docs}</TextLink>
              <TextLink href={`${siteLinks.docs}/connect-your-agent`}>{copy.links.agent}</TextLink>
              <TextLink href={`${siteLinks.docs}/build-it-with-us/contributing`}>
                {copy.links.contribute}
              </TextLink>
            </Group>
          </div>
        </div>
        <Mono>{copy.built}</Mono>
      </div>
    </Section>
  );
}
