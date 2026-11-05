// Figma's "The atlas" (66:2303), called the gallery in code. The word stays in the copy, not in paths.
import type { ThumbKind } from '../../lib/figures.ts';
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { Caption } from '../ui/Caption.tsx';
import { GalleryCard } from '../ui/GalleryCard.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { TextLink } from '../ui/TextLink.tsx';

const copy = landingCopy.gallery;
const THUMBS: readonly ThumbKind[] = ['blocs', 'even', 'tower'];

export function GallerySection() {
  return (
    <Section rule="top">
      <div className="flex flex-wrap items-end justify-between gap-block-gap">
        <SectionHead eyebrow={copy.eyebrow} title={copy.title} />
        <TextLink href={siteLinks.gallery} arrow>
          {copy.open}
        </TextLink>
      </div>
      <div className="mt-column-gap grid gap-block-gap md:grid-cols-3">
        {copy.cards.map((card, i) => (
          <GalleryCard
            key={card.title}
            thumb={THUMBS[i] ?? 'even'}
            href={siteLinks.gallery}
            {...card}
          />
        ))}
      </div>
      <div className="mt-block-gap">
        <Caption>{copy.caption}</Caption>
      </div>
    </Section>
  );
}
