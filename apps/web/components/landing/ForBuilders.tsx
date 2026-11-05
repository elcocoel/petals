// Figma's For builders (66:2316): the ink band.
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { Button } from '../ui/Button.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { Terminal } from '../ui/Terminal.tsx';

const copy = landingCopy.builders;

export function ForBuilders() {
  return (
    <Section kind="ink">
      <div className="flex flex-col gap-section-inset lg:flex-row lg:items-center lg:gap-space-96">
        <div className="w-full min-w-0 lg:max-w-builders-pitch-width lg:flex-1">
          <SectionHead eyebrow={copy.eyebrow} title={copy.title} body={copy.body} />
          <div className="mt-space-36">
            <Button href={siteLinks.connect}>{copy.action}</Button>
          </div>
        </div>
        <div className="w-full min-w-0 lg:flex-1">
          <Terminal {...copy.terminal} />
        </div>
      </div>
    </Section>
  );
}
