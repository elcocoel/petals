'use client';
// How it works: Elco's seven illustrated scenes (Figma 181:2343, 10 Nov), as a row of cards that slides
// sideways (Elco: "a row of cards"), with two arrows beside the title and the one way in under it. The row
// moves by itself under a trackpad or a finger; the arrows move it a card at a time (viewmodels/useCardRow).
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { useCardRow } from '../../viewmodels/useCardRow.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/Icon.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { Scene } from './Scene.tsx';

const copy = landingCopy.howItWorks;

export function HowItWorks() {
  const { row, atStart, atEnd, back, next } = useCardRow<HTMLUListElement>();
  return (
    <Section
      tone="paper"
      rule="top"
      id="how-it-works"
      foot={
        <div className="flex justify-center">
          <Button href={siteLinks.make}>{copy.action}</Button>
        </div>
      }
    >
      <div className="mb-column-gap flex flex-wrap items-end justify-between gap-block-gap">
        <SectionHead size="compact" title={copy.title} />
        <div className="flex gap-text-gap">
          <Button variant="secondary" onClick={back} disabled={atStart}>
            <Icon name="back" />
            <span className="sr-only">{copy.back}</span>
          </Button>
          <Button variant="secondary" onClick={next} disabled={atEnd}>
            <Icon name="arrow" />
            <span className="sr-only">{copy.next}</span>
          </Button>
        </div>
      </div>
      <ul
        ref={row}
        className="m-0 flex list-none snap-x snap-mandatory gap-column-gap overflow-x-auto p-0 pb-block-gap"
      >
        {copy.scenes.map((s) => (
          <Scene key={s.id} {...s} />
        ))}
      </ul>
    </Section>
  );
}
