// Figma's How it works (66:2268).
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { ActionRow } from '../ui/ActionRow.tsx';
import { AskBox } from '../ui/AskBox.tsx';
import { Button } from '../ui/Button.tsx';
import { Callout } from '../ui/Callout.tsx';
import { Glyph } from '../ui/Glyph.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { TextLink } from '../ui/TextLink.tsx';
import { Thumb } from '../ui/Thumb.tsx';
import { Step } from './Step.tsx';

const copy = landingCopy.howItWorks;
const [ask, see, question] = copy.steps;

export function HowItWorks() {
  return (
    <Section
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
        <Thumb kind="even" size="step" />
      </Step>
      <Step {...question}>
        <Glyph kind="concentration" size="step" />
        <Callout size="compact" who={copy.stepThree.who}>
          {copy.stepThree.text}
        </Callout>
      </Step>
    </Section>
  );
}
