// Figma's Footer (66:2360), a band on the FAQ's grey with two section paddings above its content. On the left, the
// wordmark a third of the band's width (mark.fill) with the small print under it in the links' type; on the right,
// the links that leave the landing, their last line level with the wordmark's foot. The site's own pages are in the
// nav, so they aren't repeated here. A social shows once its address is set. The content sits one block gap from the
// window's left and bottom edges and a column gap from its right.
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { TextLink } from './TextLink.tsx';
import { Wordmark } from './Wordmark.tsx';

export function Footer() {
  const copy = landingCopy.footer;
  const socials = landingCopy.hero.socials;
  const links = [
    { name: copy.links.docs, href: siteLinks.docs },
    { name: copy.links.github, href: siteLinks.github },
    { name: socials.telegram, href: siteLinks.socials.telegram },
    { name: socials.twitter, href: siteLinks.socials.twitter },
    { name: socials.youtube, href: siteLinks.socials.youtube },
  ].filter((link) => link.href);
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
        <nav className="flex flex-col items-start gap-text-gap md:col-start-2 md:row-start-1 md:self-end md:justify-self-end">
          {links.map((link) => (
            <TextLink key={link.name} href={link.href}>
              {link.name}
            </TextLink>
          ))}
        </nav>
      </div>
    </footer>
  );
}
