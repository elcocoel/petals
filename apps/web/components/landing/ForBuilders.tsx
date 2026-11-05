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
    <Section kind="ink" layout="split">
      <div>
        <SectionHead
          eyebrow={copy.eyebrow}
          eyebrowTone="accent"
          title={copy.title}
          body={copy.body}
        />
        <div className="mt-space-32">
          <Button href={siteLinks.connect}>{copy.action}</Button>
        </div>
      </div>
      <Terminal {...copy.terminal} />
    </Section>
  );
}
