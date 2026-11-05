// Figma's Closing ask (66:2336): the mint band.
import { landingCopy } from '../../lib/landing-copy.ts';
import { AskBlock } from '../ui/AskBlock.tsx';
import { Drawing } from '../ui/Drawing.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';

const copy = landingCopy.closing;

export function ClosingAsk() {
  return (
    <Section kind="mint" layout="split">
      <div>
        <SectionHead size="compact" title={copy.title} />
        <div className="mt-column-gap">
          <AskBlock
            placeholder={landingCopy.ask.placeholder}
            action={landingCopy.ask.action}
            starters={copy.starters}
          />
        </div>
      </div>
      <div className="lg:justify-self-end">
        <Drawing kind="cell" size={240} />
      </div>
    </Section>
  );
}
