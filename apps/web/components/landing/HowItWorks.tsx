// Figma's How it works (66:2268). The first step's box is the real one, empty, and it asks.
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { AskBox } from '../ui/AskBox.tsx';
import { Button } from '../ui/Button.tsx';
import { Drawing } from '../ui/Drawing.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { Step } from './Step.tsx';

const copy = landingCopy.howItWorks;
const ask = landingCopy.hero.ask;
const [nameIt, counts, questionIt] = copy.steps;

export function HowItWorks() {
  return (
    <Section
      tone="paper"
      rule="top"
      id="how-it-works"
      layout="columns"
      head={<SectionHead title={copy.title} />}
      foot={<Button href={siteLinks.make}>{copy.action}</Button>}
    >
      <Step {...nameIt}>
        <div className="w-full figure-scale">
          <AskBox placeholder="" label={ask.label} action={ask.action} to={siteLinks.make} />
        </div>
      </Step>
      <Step {...counts}>
        <Drawing kind="even" size={144} />
      </Step>
      <Step {...questionIt}>
        <Drawing kind="concentration" size={144} />
      </Step>
    </Section>
  );
}
