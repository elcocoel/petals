// Figma's "A flower, already read" (66:2232). The flower is illustrative, so asking about it goes to a
// fresh conversation rather than handing the real agent a question it can't place.
import type { ThumbKind } from '../../lib/figures.ts';
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';
import { Drawing } from '../ui/Drawing.tsx';
import { Mono } from '../ui/Mono.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { TextLink } from '../ui/TextLink.tsx';
import { Transcript } from '../ui/Transcript.tsx';

const copy = landingCopy.flowerRead;
/** Figma's Heroes strip (66:2396): five flowers, the first one marked. */
const HEROES: readonly ThumbKind[] = ['blocs', 'even', 'tower', 'blocs', 'even'];

export function FlowerRead() {
  return (
    <Section rule="top" layout="split" figure="start">
      <figure className="flex flex-col gap-block-gap">
        <Drawing kind="reading-flower" />
        <div className="flex flex-wrap items-end gap-text-gap">
          {HEROES.map((kind, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the same kind can appear twice, and nothing moves
            <div key={i} className="flex flex-col gap-space-8">
              <div className={i === 0 ? '' : 'opacity-inactive'}>
                <Drawing kind={kind} size={72} />
              </div>
              <div
                className={`w-full border-t-heavy ${i === 0 ? 'border-accent' : 'border-hairline'}`}
              />
            </div>
          ))}
        </div>
        <Mono as="figcaption">{copy.caption}</Mono>
      </figure>
      <div>
        <SectionHead eyebrow={copy.eyebrow} title={copy.title} />
        <div className="mt-column-gap">
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
    </Section>
  );
}
