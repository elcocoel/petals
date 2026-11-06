// Figma's "The atlas" (66:2303), called the gallery in code. The word stays in the copy, not in paths.
// Its cards will come from the live set, with no written words or figures, once Elco says which set.
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { Button } from '../ui/Button.tsx';
import { EmptySlot } from '../ui/EmptySlot.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';

const copy = landingCopy.gallery;

export function GallerySection() {
  return (
    <Section
      tone="mist"
      rule="top"
      layout="columns"
      head={
        <div className="flex flex-wrap items-end justify-between gap-block-gap">
          <SectionHead title={copy.title} />
          <Button href={siteLinks.gallery}>{copy.open}</Button>
        </div>
      }
    >
      <EmptySlot />
      <EmptySlot />
      <EmptySlot />
    </Section>
  );
}
