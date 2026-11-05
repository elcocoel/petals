// Figma's Closing ask (66:2336): the mint band.
import { landingCopy } from '../../lib/landing-copy.ts';
import { AskBlock } from '../ui/AskBlock.tsx';
import { Cell } from '../ui/Cell.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';

const copy = landingCopy.closing;

export function ClosingAsk() {
  return (
    <Section kind="mint">
      <div className="flex flex-col gap-section-inset lg:flex-row lg:items-center lg:justify-between">
        <div className="w-full min-w-0 lg:max-w-closing-ask-width lg:flex-1">
          <SectionHead size="compact" title={copy.title} />
          <div className="mt-space-40">
            <AskBlock
              placeholder={landingCopy.ask.placeholder}
              action={landingCopy.ask.action}
              starters={copy.starters}
            />
          </div>
        </div>
        <div className="w-full max-w-cell-width shrink-0">
          <Cell />
        </div>
      </div>
    </Section>
  );
}
