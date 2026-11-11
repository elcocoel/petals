'use client';
import { historyAt, layerOpacity, words } from '../../lib/hero-story.ts';
// The landing's hero (HERO ART's V2, approved by Elco 11 Nov: "get this in the hero please";
// design/hero-illustration/): the approved eyebrow, headline, subline and Connect, and beside them a stage in
// three layers. In front, one question and Petals' answer at a time, the question in a small box, the answer in
// larger open words; both leave before the next pair, so no transcript builds up. In the middle, one symbolic
// flower that changes with each answer (StoryFlower). Behind, room for an illustration, still to be chosen.
// It plays by itself (viewmodels/useHeroStory.ts); under it, pause and the six beats, to stop and look at any.
// `HeroStoryView` only draws, so the lab can hand it a layer to isolate.
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { type HeroStoryClock, useHeroStory } from '../../viewmodels/useHeroStory.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/Icon.tsx';
import { IconButton } from '../ui/IconButton.tsx';
import { Mono } from '../ui/Mono.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { StoryFlower } from './StoryFlower.tsx';

const hero = landingCopy.hero;
const story = landingCopy.heroStory;

/** Which layers show: all of them on the page; the lab can look at the words or the flower alone. */
export type StoryLayer = 'all' | 'words' | 'petals';

export function HeroStoryView({
  clock,
  layer = 'all',
}: {
  clock: HeroStoryClock;
  layer?: StoryLayer;
}) {
  const { beat, t } = clock;
  const said = story.beats[beat] ?? story.beats[0];
  const at = words(t);
  const marker = historyAt(t);
  return (
    <Section>
      {/* A third for the words, two thirds for the stage, as the sketch has them; stacked on a phone. */}
      <div className="flex flex-col gap-column-gap lg:flex-row lg:items-center">
        <div className="lg:w-1/3 lg:shrink-0">
          <SectionHead size="hero" eyebrow={hero.eyebrow} title={hero.titleWide} body={hero.body} />
          <div className="mt-column-gap">
            <Button href={siteLinks.lobby} arrow>
              {hero.ask.action}
            </Button>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-block-gap">
          <div ref={clock.stage} className="relative aspect-3/4 w-full lg:aspect-8/5">
            {/* The middle: the flower, in its own band between the question and the answer so neither covers its
              centre, and the history beat's line from then to now. */}
            <div
              className="absolute inset-x-0 top-1/6 bottom-1/5 lg:top-1/8 lg:bottom-1/6"
              style={{ opacity: layer === 'words' ? 0.08 : 1 }}
            >
              <StoryFlower beat={beat} t={t} />
              <div
                aria-hidden="true"
                className="absolute inset-x-1/4 bottom-0 flex items-center gap-text-gap"
                style={{ opacity: layerOpacity(3, beat, t) }}
              >
                <Mono>{story.past}</Mono>
                <span className="relative block h-px flex-1 bg-hairline">
                  {/* the marker rides a layer as wide as the line, moved along by its own width */}
                  <span
                    className="absolute inset-0 block"
                    style={{ translate: `${(marker * 100).toFixed(1)}% 0` }}
                  >
                    <span className="absolute -top-space-4 -left-space-4 block size-space-8 bg-primary" />
                  </span>
                </span>
                <Mono>{story.now}</Mono>
              </div>
            </div>
            {/* In front: one question and its answer. */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{ opacity: layer === 'petals' ? 0 : 1 }}
            >
              <div
                className="absolute top-0 left-0 w-full lg:w-4/5"
                style={{ opacity: at.question.opacity, translate: `0 ${at.question.y}px` }}
              >
                <div
                  data-b="box"
                  data-kind="note"
                  className="inline-flex flex-col gap-space-4 border border-hairline bg-surface px-block-gap py-space-16"
                >
                  <Mono>{story.you}</Mono>
                  <p className="my-0 type-body lg:type-lead">{said.q}</p>
                </div>
              </div>
              <div
                className="absolute right-0 bottom-space-16 w-4/5 lg:bottom-block-gap lg:w-2/3"
                style={{ opacity: at.answer.opacity, translate: `0 ${at.answer.y}px` }}
              >
                <p className="my-0 flex items-center gap-space-8 type-mono text-muted">
                  <Icon name="petals" small />
                  {story.petals}
                </p>
                <p className="mt-space-8 mb-0 text-balance type-heading">{said.a}</p>
              </div>
            </div>
          </div>
          {/* Under the stage: pause, and the six beats to stop at any of them. */}
          <div className="flex items-start gap-space-8">
            <IconButton
              icon={clock.playing ? 'pause' : 'play'}
              label={clock.playing ? story.pause : story.play}
              onClick={clock.toggle}
            />
            <div className="flex min-w-0 flex-1">
              {story.beats.map((b, i) => (
                <Button
                  key={b.name}
                  variant="tick"
                  current={i === beat}
                  onClick={() => clock.choose(i)}
                >
                  <span className="flex w-full flex-col gap-space-8">
                    <span
                      className={`block w-full border-t-heavy ${i === beat ? 'border-primary' : 'border-hairline'}`}
                    />
                    {/* Under each tick on a wide window; read aloud everywhere. */}
                    <span className="sr-only type-caption lg:not-sr-only">{b.name}</span>
                  </span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

export function HeroStory() {
  const clock = useHeroStory<HTMLDivElement>(story.beats.length);
  return <HeroStoryView clock={clock} />;
}
