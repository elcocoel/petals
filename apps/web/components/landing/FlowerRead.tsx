// Figma's "A flower, already read" (66:2232). The flower is illustrative, so asking about it goes to a
// fresh conversation rather than handing the real agent a question it can't place.
import { readingFlower } from '../../lib/figures.ts';
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';
import { Caption } from '../ui/Caption.tsx';
import { Drawing } from '../ui/Drawing.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { TextLink } from '../ui/TextLink.tsx';
import { Transcript } from '../ui/Transcript.tsx';
import { HeroesStrip } from './HeroesStrip.tsx';

const copy = landingCopy.flowerRead;

export function FlowerRead() {
  return (
    <Section rule="top">
      <div className="flex flex-col gap-section-inset lg:flex-row lg:items-center">
        <figure className="flex w-full min-w-0 flex-col gap-space-20 lg:max-w-figure-width lg:flex-1">
          <Drawing drawing={readingFlower} className="h-auto w-full" />
          <HeroesStrip thumbs={['blocs', 'even', 'tower', 'blocs', 'even']} />
          <Caption as="figcaption">{copy.caption}</Caption>
        </figure>
        <div className="w-full min-w-0 lg:flex-1">
          <SectionHead eyebrow={copy.eyebrow} title={copy.title} />
          <div className="mt-space-40">
            <Transcript
              start={copy.transcript.start}
              end={copy.transcript.end}
              lines={copy.transcript.lines}
            />
          </div>
          <div className="mt-space-32">
            <ActionRow>
              <Button href={siteLinks.gallery}>{copy.open}</Button>
              <TextLink href={siteLinks.make} arrow>
                {copy.keepAsking}
              </TextLink>
            </ActionRow>
          </div>
        </div>
      </div>
    </Section>
  );
}
