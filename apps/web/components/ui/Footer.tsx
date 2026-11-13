// Figma's Footer (66:2360), a band on the FAQ's grey with a section's padding above its content: on the
// left, the wordmark a third of the band's width (mark.fill) with the small print under it; bottom right, the site's
// pages and the outside links. The content sits one block gap from the window's own edges (left, right, bottom),
// not on the page's inset column. Only links that go somewhere: an outside link shows once its address is set.
import type { ReactNode } from 'react';
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { Mono } from './Mono.tsx';
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
  const socials = landingCopy.hero.socials;
  const elsewhere = [
    { name: copy.links.github, href: siteLinks.github },
    { name: socials.telegram, href: siteLinks.socials.telegram },
    { name: socials.twitter, href: siteLinks.socials.twitter },
    { name: socials.youtube, href: siteLinks.socials.youtube },
    { name: copy.links.elementaryComplexity, href: siteLinks.elementaryComplexity },
  ].filter((link) => link.href);
  return (
    <footer
      data-surface="ground"
      data-tone="stone"
      data-b="surface"
      className="@container relative overflow-hidden border-t border-hairline"
    >
      <div className="flex flex-col gap-column-gap px-block-gap pt-section-padding pb-block-gap antialiased md:flex-row md:items-end md:justify-between">
        <div className="@container flex w-full flex-col gap-block-gap md:w-1/2">
          <div className="@container w-full md:w-2/3">
            <Wordmark size="fill" />
          </div>
          <p className="my-0 type-lead">
            {copy.built.split(copy.by)[0]}
            <TextLink href={siteLinks.elementaryComplexity} variant="inline">
              {copy.by}
            </TextLink>
            {copy.built.split(copy.by)[1]}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-column-gap gap-y-column-gap md:justify-end">
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
          <Group name={copy.groups.elsewhere}>
            {elsewhere.map((link) => (
              <TextLink key={link.name} href={link.href}>
                {link.name}
              </TextLink>
            ))}
          </Group>
        </div>
      </div>
    </footer>
  );
}
