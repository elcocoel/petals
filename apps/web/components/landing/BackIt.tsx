// Back it, on what was Figma's Join the community (66:2346): the ways to help, v1 drafts (Elco, 9 Nov). Since
// 12 Nov (Elco's walk: "it's the one that needs the most work", "the sensation of a real project that people can
// join", less text, whatever leads to action) the landing lays them out as tiles you press: each a glass plate
// with its few words, and under it where it goes. The community and the merch pre-sale wait for Elco's
// addresses: until then their tiles show without a link, so nothing goes nowhere. `split`, the old list beside
// an empty half, stays for the lab.
import { landingCopy } from '../../lib/landing-copy.ts';
import { PlateLink } from '../ui/PlateLink.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';

const copy = landingCopy.backIt;
type WayCopy = (typeof copy.ways)[number];

function Way({ way }: { way: WayCopy }) {
  return (
    <>
      <h3 className="my-0 type-heading">{way.title}</h3>
      {way.body && <p className="mt-space-16 mb-0 type-body">{way.body}</p>}
    </>
  );
}

/** A way as a tile: its words on the plate, and under it where it goes. */
function WayTile({ way }: { way: WayCopy }) {
  return (
    <PlateLink href={way.href || undefined} action={way.action}>
      <span className="min-h-drawing-144 type-title">{way.title}</span>
      {way.body && <span className="type-body">{way.body}</span>}
    </PlateLink>
  );
}

export function BackIt({ layout = 'split' }: { layout?: 'split' | 'columns' }) {
  if (layout === 'columns')
    return (
      <Section head={<SectionHead title={copy.title} />}>
        <ul className="m-0 grid list-none grid-cols-1 gap-column-gap p-0 md:grid-cols-2 lg:grid-cols-3">
          {copy.ways.map((way) => (
            <li key={way.title} className="min-w-0">
              <WayTile way={way} />
            </li>
          ))}
        </ul>
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
