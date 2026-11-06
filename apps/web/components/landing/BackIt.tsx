// Back it, on what was Figma's Join the community (66:2346). The ways to support Petals are held open
// until Elco says which go live by the freeze.
import { landingCopy } from '../../lib/landing-copy.ts';
import { Drawing } from '../ui/Drawing.tsx';
import { EmptySlot } from '../ui/EmptySlot.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';

const copy = landingCopy.backIt;

export function BackIt() {
  return (
    <Section layout="split">
      <div>
        <SectionHead title={copy.title} />
        <div className="mt-column-gap">
          <EmptySlot />
        </div>
      </div>
      <Drawing kind="cell-repeat" />
    </Section>
  );
}
