// Figma's How it works (66:2268): three steps, in words, and one way in. The v6 pictures (a box that asked, two
// made-up flowers) went on 10 Nov: they no longer matched the steps, and the box doubled the section's one
// action (design/minimally-good.md, rules 6 and 10). Pictures come back when there are real ones.
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { Button } from '../ui/Button.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { Step } from './Step.tsx';

const copy = landingCopy.howItWorks;

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
      {copy.steps.map((step) => (
        <Step key={step.numeral} {...step} />
      ))}
    </Section>
  );
}
