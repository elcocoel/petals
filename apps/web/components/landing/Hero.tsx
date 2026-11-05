// Figma's Hero (66:2188).
import { landingCopy } from '../../lib/landing-copy.ts';
import { AskBlock } from '../ui/AskBlock.tsx';
import { Caption } from '../ui/Caption.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { AnnotatedFlower } from './AnnotatedFlower.tsx';

const copy = landingCopy.hero;

export function Hero() {
  return (
    <Section layout="split">
      <div>
        <SectionHead size="display" eyebrow={copy.eyebrow} title={copy.title} body={copy.body} />
        <div className="mt-column-gap">
          <AskBlock
            placeholder={landingCopy.ask.placeholder}
            action={landingCopy.ask.action}
            starterLabel={copy.starterLabel}
            starters={copy.starters}
          />
        </div>
        <div className="mt-column-gap">
          <Caption>{copy.caption}</Caption>
        </div>
      </div>
      <AnnotatedFlower />
    </Section>
  );
}
