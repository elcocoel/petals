// Figma's Hero (66:2188). The figure is a placeholder until the hero set is chosen (T108), as Elco asked on
// 6 Nov: the drawing alone, without the notes that went with it, which described things Petals doesn't draw.
import { landingCopy } from '../../lib/landing-copy.ts';
import { AskBlock } from '../ui/AskBlock.tsx';
import { Drawing } from '../ui/Drawing.tsx';
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
      <Drawing kind="hero-flower" />
    </Section>
  );
}
