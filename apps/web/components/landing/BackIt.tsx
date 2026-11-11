// Back it, on what was Figma's Join the community (66:2346): the ways to help, v1 drafts (Elco, 9 Nov). Ways
// that take money (merch, donations, sponsoring) wait for Elco. Its figure, the old look's repeated cell, went
// with one-source.md's step 8 (10 Nov); the text keeps its side of the split. `columns` is LANDING's lean for
// the half that's left empty (11 Nov, in /lab/landing-hero): the three ways side by side under the headline,
// until a picture (one of Elco's power quotes, illustrated) can take that half.
import { landingCopy } from '../../lib/landing-copy.ts';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';

const copy = landingCopy.backIt;

function Way({ way }: { way: (typeof copy.ways)[number] }) {
  return (
    <>
      <h3 className="my-0 type-heading">{way.title}</h3>
      <p className="mt-space-16 mb-0 type-body">{way.body}</p>
    </>
  );
}

export function BackIt({ layout = 'split' }: { layout?: 'split' | 'columns' }) {
  if (layout === 'columns')
    return (
      <Section layout="columns" head={<SectionHead title={copy.title} />}>
        {copy.ways.map((way) => (
          <div key={way.title}>
            <Way way={way} />
          </div>
        ))}
      </Section>
    );
  return (
    <Section layout="split">
      <div>
        <SectionHead title={copy.title} />
        <ul className="mt-column-gap mb-0 flex list-none flex-col gap-block-gap p-0">
          {copy.ways.map((way) => (
            <li key={way.title}>
              <Way way={way} />
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
