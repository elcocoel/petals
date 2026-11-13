// Figma's Footer (66:2360), on the FAQ's grey band: the wordmark large, filling its column and pressed into the
// band's greys (mark.fill, mark.mono), with the small print under it at a lead's size, both bottom left; the site's
// own pages in two short groups bottom right. Generous room above, everything settling to the bottom. The small
// print's name links to Elementary Complexity's site. Only links that go somewhere.
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
    <Section as="footer" tone="stone">
      <div className="flex flex-col gap-column-gap md:pt-page-inset lg:flex-row lg:items-end lg:justify-between lg:gap-section-padding">
        <div className="@container flex min-w-0 flex-1 flex-col gap-block-gap">
          <Wordmark size="fill" mono />
          <p className="my-0 type-lead">
            {copy.built.split(copy.by)[0]}
            <TextLink href={siteLinks.elementaryComplexity} variant="inline">
              {copy.by}
            </TextLink>
            {copy.built.split(copy.by)[1]}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-x-section-padding gap-y-column-gap">
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
