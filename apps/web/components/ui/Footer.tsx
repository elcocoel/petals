// Figma's Footer (66:2360), styled in the system (11 Nov, board card 104): the big wordmark and the small print
// on one side; on the other, the site's own pages in two short groups, Petals and Build. Only links that go
// somewhere: GitHub joins Build once the repo is public at the freeze.
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
    <Section as="footer" rule="top">
      <div className="flex flex-col gap-column-gap lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-block-gap">
          <Wordmark size="footer" />
          <Mono>{copy.built}</Mono>
        </div>
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
    </Section>
  );
}
