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
    <Section padding="hero">
      <div className="flex flex-col gap-space-40 lg:flex-row lg:items-center">
        <div className="w-full min-w-0 lg:max-w-hero-pitch-width lg:flex-1">
          <SectionHead size="display" eyebrow={copy.eyebrow} title={copy.title} body={copy.body} />
          <div className="mt-space-44">
            <AskBlock
              placeholder={landingCopy.ask.placeholder}
              action={landingCopy.ask.action}
              starterLabel={copy.starterLabel}
              starters={copy.starters}
            />
          </div>
          <div className="mt-space-40">
            <Caption>{copy.caption}</Caption>
          </div>
        </div>
        <div className="w-full min-w-0 lg:max-w-hero-figure-width lg:flex-1">
          <AnnotatedFlower />
        </div>
      </div>
    </Section>
  );
}
