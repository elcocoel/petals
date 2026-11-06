// Figma's How it works (66:2268).
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { ActionRow } from '../ui/ActionRow.tsx';
import { AskBox } from '../ui/AskBox.tsx';
import { Button } from '../ui/Button.tsx';
import { Callout } from '../ui/Callout.tsx';
import { Drawing } from '../ui/Drawing.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { TextLink } from '../ui/TextLink.tsx';
import { Step } from './Step.tsx';

const copy = landingCopy.howItWorks;
const [ask, see, question] = copy.steps;

export function HowItWorks() {
  return (
    <Section
      tone="paper"
      rule="top"
      id="how-it-works"
      layout="columns"
      head={<SectionHead eyebrow={copy.eyebrow} title={copy.title} />}
      foot={
        <ActionRow>
          <Button href={siteLinks.make}>{copy.ask}</Button>
          <TextLink href={siteLinks.gallery} arrow>
            {copy.gallery}
          </TextLink>
        </ActionRow>
      }
    >
      <Step {...ask}>
        <div className="w-full figure-scale">
          <AskBox
            placeholder={copy.stepOneQuestion}
            label={landingCopy.ask.action}
            action={landingCopy.ask.action}
            to={siteLinks.make}
          />
        </div>
      </Step>
      <Step {...see}>
        <Drawing kind="even" size={144} />
      </Step>
      <Step {...question}>
        <Drawing kind="concentration" size={144} />
        <Callout size="compact" who={copy.stepThree.who}>
          {copy.stepThree.text}
        </Callout>
      </Step>
    </Section>
  );
}
