'use client';
// How it works: Elco's seven illustrated scenes (Figma 181:2343, 10 Nov), as a row of cards (Elco: "a row of
// cards") that keeps time (Elco: "automated cycling on a loop and the focused card could be highlighted").
// The scene in focus sits in the middle of a row that runs to the window's edges, and comes forward; the
// others step back either side. Under version 2 a line fills under it and the row
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
      bleed
      id="how-it-works"
      foot={
        <div className="flex justify-center">
          <Button href={siteLinks.make} arrow>
            {copy.action}
          </Button>
        </div>
      }
    >
      <div className="mb-column-gap">
        <SectionHead size="compact" title={copy.title} />
      </div>
      <div data-paused={cycle.held ? '' : undefined} {...cycle.holder}>
        {/* The row runs out to the window's edges, past the page's column, with one scene in focus in its
            middle and the next ones either side, stepped back (Elco, 10 Nov: "it should go to the edges of
            the composition and perhaps one clearly focused card is better"). A spacer at each end lets the
            first and the last scene come to the middle too. It leaves room under the cards, so the scene in
            focus can lift and its shadow fade out before the row ends, and the ticks and arrows under it
            are its scrollbar, so it shows none of its own. */}
        <ul
          ref={cycle.row}
          className="relative left-1/2 -mt-column-gap -mb-section-padding flex w-screen -translate-x-1/2 list-none snap-x snap-mandatory gap-block-gap overflow-x-auto px-0 lg:gap-column-gap pt-column-gap pb-section-padding [scrollbar-width:none]" /* token-exempt: no scrollbar of its own, the ticks and arrows are its scrollbar */
        >
          <li aria-hidden="true" className="shrink-0 basis-1/2" />
          {copy.scenes.map((s, i) => (
            <Scene
              key={s.id}
              {...s}
              numeral={String(i + 1).padStart(2, '0')}
              current={i === cycle.current}
              onTimeUp={cycle.timeUp}
              onPress={(half) =>
                i !== cycle.current ? cycle.go(i) : half === 'next' ? cycle.next() : cycle.back()
              }
            />
          ))}
          <li aria-hidden="true" className="shrink-0 basis-1/2" />
        </ul>
        <div className="mt-block-gap flex items-start gap-block-gap">
          <div className="flex min-w-0 flex-1 items-start gap-space-4">
            {copy.scenes.map((s, i) => (
              <Button
                key={s.id}
                variant="tick"
                current={i === cycle.current}
                onClick={() => cycle.go(i)}
              >
                <span className="flex w-full flex-col gap-space-8">
                  <span
                    className={`block w-full border-t-heavy ${i === cycle.current ? 'border-primary' : 'border-hairline'}`}
                  />
                  {/* Under each tick on a wide window; read aloud everywhere. */}
                  <span className="sr-only type-caption lg:not-sr-only">{s.tick}</span>
                </span>
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
