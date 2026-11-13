// Figma's Nav (66:2181), the one nav of every page. Links into the landing start with /, so they work
// from anywhere. On a phone the links fold behind one menu button, a native disclosure that needs no script,
// and the wordmark and Connect stay on the bar (unfolded, the links wrapped the bar onto three rows).
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { Button } from './Button.tsx';
import { Icon } from './Icon.tsx';
import { Section } from './Section.tsx';
import { TextLink } from './TextLink.tsx';
import { Wordmark } from './Wordmark.tsx';

export function Nav() {
  const copy = landingCopy.nav;
  const links = (
    <>
      <TextLink href={siteLinks.howItWorks}>{copy.howItWorks}</TextLink>
      <TextLink href={siteLinks.map}>{copy.gallery}</TextLink>
      <TextLink href={siteLinks.docs}>{copy.docs}</TextLink>
    </>
  );
  return (
    <Section as="nav" padding="bar" rule="bottom">
      <div className="relative flex items-center justify-between gap-x-space-16 md:gap-x-block-gap">
        <a href={siteLinks.home} aria-label="Petals, home" className="flex no-underline">
          <Wordmark />
        </a>
        <div className="flex items-center gap-x-space-8 md:gap-x-space-32">
          <div className="hidden items-center gap-x-space-32 md:flex">{links}</div>
          {/* The one Connect, as the hero's box has it: primary, with its arrow. */}
          <Button href={siteLinks.lobby} arrow>
            {copy.ask}
          </Button>
          <details className="md:hidden">
            <summary
              aria-label={copy.menu}
              className="flex size-control-height cursor-pointer list-none items-center justify-center text-primary"
            >
              <Icon name="menu" />
            </summary>
            <div className="absolute top-full right-0 z-10 mt-space-8 flex flex-col items-start gap-text-gap border border-hairline bg-surface p-block-gap">
              {links}
            </div>
          </details>
        </div>
      </div>
    </Section>
  );
}
