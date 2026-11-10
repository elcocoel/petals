'use client';
// How it works: Elco's seven illustrated scenes (Figma 181:2343, 10 Nov), as a row of cards (Elco: "a row of
// cards") that keeps time (Elco: "automated cycling on a loop and the focused card could be highlighted").
// The scene in focus leads the row and comes forward; under version 2 a line fills under it and the row
// moves on, round and round, while no hand is on it (viewmodels/useSceneCycle.ts). Under the row, a tick
// for each scene and the two arrows move the focus; the one way in is under them.
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { useSceneCycle } from '../../viewmodels/useSceneCycle.ts';
import { Button } from '../ui/Button.tsx';
import { IconButton } from '../ui/IconButton.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { Scene } from './Scene.tsx';

const copy = landingCopy.howItWorks;

export function HowItWorks() {
  const cycle = useSceneCycle<HTMLUListElement>(copy.scenes.length);
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
      <div className="mb-column-gap">
        <SectionHead size="compact" title={copy.title} />
      </div>
      <div data-paused={cycle.held ? '' : undefined} {...cycle.holder}>
        {/* The row runs out to the band's edges and leaves room under the cards, so the scene in focus
            can lift and its shadow fade out before the row ends. The ticks and arrows under it are its
            scrollbar, so it shows none of its own. */}
        <ul
          ref={cycle.row}
          className="-mx-block-gap -mt-column-gap -mb-section-padding flex list-none snap-x snap-mandatory scroll-px-block-gap gap-column-gap overflow-x-auto px-block-gap pt-column-gap pb-section-padding [scrollbar-width:none] md:-mx-page-inset md:scroll-px-page-inset md:px-page-inset" /* token-exempt: no scrollbar of its own, the ticks and arrows are its scrollbar */
        >
          {copy.scenes.map((s, i) => (
            <Scene key={s.id} {...s} current={i === cycle.current} onTimeUp={cycle.timeUp} />
          ))}
        </ul>
        <div className="mt-block-gap flex items-center gap-block-gap">
          <div className="flex min-w-0 flex-1 gap-space-4">
            {copy.scenes.map((s, i) => (
              <Button
                key={s.id}
                variant="tick"
                label={s.headline}
                current={i === cycle.current}
                onClick={() => cycle.go(i)}
              >
                <span
                  className={`block w-full border-t-heavy ${i === cycle.current ? 'border-primary' : 'border-hairline'}`}
                />
              </Button>
            ))}
          </div>
          <div className="flex gap-space-4">
            <IconButton icon="back" label={copy.back} onClick={cycle.back} />
            <IconButton icon="arrow" label={copy.next} onClick={cycle.next} />
          </div>
        </div>
      </div>
    </Section>
  );
}
