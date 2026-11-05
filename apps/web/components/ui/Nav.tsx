// Figma's Nav (66:2181), the one nav of every page. Links into the landing start with /, so they work
// from anywhere.
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { Button } from './Button.tsx';
import { Section } from './Section.tsx';
import { TextLink } from './TextLink.tsx';
import { Wordmark } from './Wordmark.tsx';

export function Nav() {
  const copy = landingCopy.nav;
  return (
    <Section as="nav" padding="nav" rule="bottom">
      <div className="flex flex-wrap items-center justify-between gap-x-block-gap gap-y-text-gap">
        <a href={siteLinks.home} aria-label="Petals, home" className="flex no-underline">
          <Wordmark />
        </a>
        <div className="flex flex-wrap items-center gap-x-space-32 gap-y-text-gap">
          <TextLink href={siteLinks.howItWorks}>{copy.howItWorks}</TextLink>
          <TextLink href={siteLinks.gallery}>{copy.gallery}</TextLink>
          <TextLink href={siteLinks.connect}>{copy.docs}</TextLink>
          <Button href={siteLinks.make}>{copy.ask}</Button>
        </div>
      </div>
    </Section>
  );
}
