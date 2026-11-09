// Back it, on what was Figma's Join the community (66:2346): the ways to help, v1 drafts (Elco, 9 Nov). Ways
// that take money (merch, donations, sponsoring) wait for Elco.
import { landingCopy } from '../../lib/landing-copy.ts';
import { Drawing } from '../ui/Drawing.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';

const copy = landingCopy.backIt;

export function BackIt() {
  return (
    <Section layout="split">
      <div>
        <SectionHead title={copy.title} />
        <ul className="mt-column-gap mb-0 flex list-none flex-col gap-block-gap p-0">
          {copy.ways.map((way) => (
            <li key={way.title}>
              <h3 className="my-0 type-heading">{way.title}</h3>
              <p className="mt-space-16 mb-0 type-body">{way.body}</p>
            </li>
          ))}
        </ul>
      </div>
      <Drawing kind="cell-repeat" />
    </Section>
  );
}
