// Figma's Footer (66:2360), a band on the FAQ's grey with two section paddings above its content. On the left, the
// wordmark a third of the band's width (mark.fill) with the small print under it in the links' type; on the right,
// three groups of links (Petals, Build, Community), their last lines level with the wordmark's foot. Every
// destination is listed: one whose address is still empty shows as its name, greyed, until the address is set
// in siteLinks. The content sits one block gap from the window's left and bottom edges and a column
// gap from its right.
import type { ReactNode } from 'react';
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { Mono } from './Mono.tsx';
import { TextLink } from './TextLink.tsx';
import { Wordmark } from './Wordmark.tsx';

type Destination = { name: string; href: string };

function Group({ name, links }: { name: string; links: Destination[] }): ReactNode {
  return (
    <nav aria-label={name} className="flex flex-col items-start gap-text-gap">
      <Mono>{name}</Mono>
      {links.map((link) =>
        link.href ? (
          <TextLink key={link.name} href={link.href}>
            {link.name}
          </TextLink>
        ) : (
          <span key={link.name} className="type-label text-muted">
            {link.name}
          </span>
        ),
      )}
    </nav>
  );
}

export function Footer() {
  const copy = landingCopy.footer;
  const socials = landingCopy.hero.socials;
  const groups: { name: string; links: Destination[] }[] = [
    {
      name: copy.groups.petals,
      links: [
        { name: copy.links.map, href: siteLinks.map },
        { name: copy.links.leaderboard, href: siteLinks.leaderboard },
        { name: copy.links.drop, href: siteLinks.merch },
      ],
    },
    {
      name: copy.groups.build,
      links: [
        { name: copy.links.docs, href: siteLinks.docs },
        { name: copy.links.github, href: siteLinks.github },
        { name: copy.links.brandKit, href: siteLinks.brandKit },
      ],
    },
    {
      name: copy.groups.community,
      links: [
        { name: socials.telegram, href: siteLinks.socials.telegram },
        { name: socials.twitter, href: siteLinks.socials.twitter },
        { name: socials.youtube, href: siteLinks.socials.youtube },
      ],
    },
  ];
  return (
    <footer
      data-surface="ground"
      data-tone="stone"
      data-b="surface"
      className="@container relative overflow-hidden border-t border-hairline pt-section-padding"
    >
      <div className="grid grid-cols-1 gap-column-gap px-block-gap pt-section-padding pb-block-gap antialiased md:grid-cols-2 md:pr-column-gap">
        <div className="@container md:col-start-1 md:row-start-1 md:self-end">
          <div className="@container w-full md:w-2/3">
            <Wordmark size="fill" />
          </div>
        </div>
        <p className="my-0 type-label text-primary md:col-start-1 md:row-start-2">
          {copy.built.split(copy.by)[0]}
          <TextLink href={siteLinks.elementaryComplexity} variant="inline">
            {copy.by}
          </TextLink>
          {copy.built.split(copy.by)[1]}
        </p>
        <div className="flex flex-wrap gap-x-column-gap gap-y-column-gap md:col-start-2 md:row-start-1 md:self-end md:justify-self-end">
          {groups.map((group) => (
            <Group key={group.name} name={group.name} links={group.links} />
          ))}
        </div>
      </div>
    </footer>
  );
}
