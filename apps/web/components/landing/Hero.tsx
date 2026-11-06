// Figma's Hero (66:2188). The figure's place is held open until the hero set is chosen (T108).
import { landingCopy } from '../../lib/landing-copy.ts';
import { AskBlock } from '../ui/AskBlock.tsx';
import { EmptySlot } from '../ui/EmptySlot.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';

const copy = landingCopy.hero;

export function Hero() {
  return (
    <Section layout="split">
      <div>
        <SectionHead size="display" eyebrow={copy.eyebrow} title={copy.title} body={copy.body} />
        <div className="mt-column-gap">
          <AskBlock
            placeholder={copy.ask.placeholders[0]}
            typed={copy.ask.placeholders}
            label={copy.ask.label}
            action={copy.ask.action}
            starterLabel={copy.starterLabel}
            starters={copy.starters}
          />
        </div>
      </div>
      <EmptySlot fill />
    </Section>
  );
}
