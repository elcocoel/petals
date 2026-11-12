'use client';
import { type CSSProperties, memo } from 'react';
import { flowerAt, type Pin, shotOf } from '../../lib/hero-shots.ts';
import {
  answer,
  answerWord,
  beatMs,
  historyLine,
  kick,
  layerOpacity,
  type Motion,
  OVERLAP_MS,
  pulse,
  question,
} from '../../lib/hero-story.ts';
// The landing's hero (HERO ART's V2, approved by Elco 11 Nov: "get this in the hero please"; HERO MOTION's
// choreography): the approved eyebrow, headline, subline and Connect, and beside them a stage of four separate
// layers, each placed by the beat's shot (lib/hero-shots.ts), so the page can compose them for a phone or a wide
// screen (Elco, 11 Nov). Behind, a light that moves less than the flower, for depth. In the middle, one symbolic
// flower that performs each answer (StoryFlower); the camera whips it from shot to shot on each beat's one and is
// punched in by every hit, and the depth is the camera's own, never the visitor's pointer (Elco, 12 Nov). In
// front, the question
// in a light bubble and Petals' answer in a dark one, on opposite sides, swapping sides from beat to beat; the
// question comes in, the flower answers, the answer comes in word by word, and it is still leaving as the next
// question arrives, so no transcript builds up and there is no dead air. Under the hero, apart from the stage, the
// chapters: pause, and the six beats with the current one filling as it plays.
// It plays by itself (viewmodels/useHeroStory.ts). `HeroStoryView` only draws, so the lab can hand it a layer to
// isolate. Only the stage and the chapters redraw each frame.
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { type HeroStoryClock, useHeroStory } from '../../viewmodels/useHeroStory.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/Icon.tsx';
import { IconButton } from '../ui/IconButton.tsx';
import { Mono } from '../ui/Mono.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { Glass } from './HeroGlass.tsx';
import { StoryFlower, StoryLight } from './StoryFlower.tsx';

const hero = landingCopy.hero;
const story = landingCopy.heroStory;

/** Which layers show: all of them on the page; the lab can look at the words or the flower alone. */
export type StoryLayer = 'all' | 'words' | 'petals';

/** A blur only while there is one, so settled words are drawn as plain text. */
const soft = (px: number) => (px > 0.05 ? `blur(${px.toFixed(2)}px)` : 'none');
const n2 = (x: number) => x.toFixed(2);

/** A bubble on its pin: that corner of it on that point of the stage, moved by its motion, at its depth, turned towards the flower. */
const pinned = (pin: Pin, m: Motion): CSSProperties => {
  const side = pin.ax > 0.5 ? -1 : 1;
  return {
    opacity: m.opacity,
    translate: `calc(${pin.x}cqw - ${pin.ax * 100}% + ${n2(m.x * side)}px) calc(${pin.y}cqh - ${pin.ay * 100}% + ${n2(m.y)}px) ${n2(m.z)}px`,
    scale: m.scale.toFixed(4),
    transform: `rotateY(${n2(side * m.turn)}deg)`,
    // a bubble grows and turns from the point it is pinned by
    transformOrigin: `${pin.ax * 100}% ${pin.ay * 100}%`,
    filter: soft(m.blur),
  };
};

/**
 * Where the flower's centre is in its own layer, in %: the drawing's 205 of 440, fitted to the stage's shape; and
 * where the history beat's line runs, just under its tallest petal.
 */
const centreY = (wide: boolean) => (wide ? 46.59 : 48.33);
const trackY = (wide: boolean) => (wide ? 86 : 70);

/** The words beside the stage: they never move, so they never redraw with it. */
const Intro = memo(function Intro() {
  return (
    <div className="lg:w-1/3 lg:shrink-0">
      <SectionHead size="hero" eyebrow={hero.eyebrow} title={hero.titleWide} body={hero.body} />
      <div className="mt-column-gap">
        <Button href={siteLinks.lobby} arrow>
          {hero.ask.action}
        </Button>
      </div>
    </div>
  );
});

/** The question, in a light bubble. */
function Question({
  beat,
  u,
  fresh,
  wide,
}: {
  beat: number;
  u: number;
  fresh: boolean;
  wide: boolean;
}) {
  const said = story.beats[beat] ?? story.beats[0];
  const pin = shotOf(beat, wide).question;
  const m = question(beat, u, fresh);
  if (m.opacity < 0.002) return null;
  return (
    <div className="absolute top-0 left-0 w-max max-w-4/5 lg:max-w-3/5" style={pinned(pin, m)}>
      <Glass tone="light" facing="left" glint={m.glint} glow={m.glow} />
      <div className="relative flex flex-col gap-space-4 px-block-gap py-space-16">
        <Mono>{story.you}</Mono>
        <p className="my-0 type-body lg:type-lead">{said.q}</p>
      </div>
    </div>
  );
}

/** Petals' answer, in a dark bubble, word by word into one line; the sentence is the approved one, whole. */
function Answer({ beat, u, wide }: { beat: number; u: number; wide: boolean }) {
  const said = story.beats[beat] ?? story.beats[0];
  const pin = shotOf(beat, wide).answer;
  const m = answer(beat, u);
  if (m.opacity < 0.002) return null;
  const label = answerWord(u, -2);
  return (
    <div className="absolute top-0 left-0 w-max max-w-9/10 lg:max-w-2/5" style={pinned(pin, m)}>
      {/* its rim lit from the flower's side */}
      <Glass tone="dark" facing={pin.ax > 0.5 ? 'left' : 'right'} glint={m.glint} glow={m.glow} />
      <div className="relative flex flex-col gap-space-8 px-block-gap py-space-16 text-on-action">
        <p
          className="my-0 flex items-center gap-space-8 type-mono"
          style={{ opacity: label.opacity * 0.7, filter: soft(label.blur) }}
        >
          <Icon name="petals" small />
          {story.petals}
        </p>
        <p className="my-0 text-pretty type-heading">
          {said.a.split(' ').map((w, j) => {
            const word = answerWord(u, j);
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: a word's place in its fixed sentence
              <span key={j}>
                {j > 0 && ' '}
                <span
                  className="inline-block"
                  style={{
                    opacity: word.opacity,
                    translate: `0 ${n2(word.y)}px`,
                    filter: soft(word.blur),
                  }}
                >
                  {w}
                </span>
              </span>
            );
          })}
        </p>
      </div>
    </div>
  );
}

/**
 * The chapters, apart from the stage (Elco, 11 Nov: "a separate element of the animation, not stuck in it"):
 * pause, and the six beats to stop at any of them, the current one filling as it plays.
 */
function Chapters({
  beat,
  progress,
  playing,
  toggle,
  choose,
}: {
  beat: number;
  progress: number;
  playing: boolean;
  toggle: () => void;
  choose: (beat: number) => void;
}) {
  return (
    <div className="mt-column-gap flex items-start gap-space-8">
      <IconButton
        icon={playing ? 'pause' : 'play'}
        label={playing ? story.pause : story.play}
        onClick={toggle}
      />
      <div className="flex min-w-0 flex-1">
        {story.beats.map((b, i) => (
          <Button key={b.name} variant="tick" current={i === beat} onClick={() => choose(i)}>
            <span className="flex w-full flex-col gap-space-8">
              <span className="relative block w-full border-t-heavy border-hairline">
                {/* the beat's own length, filling as it plays */}
                <span
                  className="absolute inset-x-0 -top-px block origin-left border-t-heavy border-primary"
                  style={{ scale: `${i < beat ? 1 : i === beat ? progress.toFixed(4) : 0} 1` }}
                />
              </span>
              {/* Under each tick on a wide window; read aloud everywhere. */}
              <span className="sr-only type-caption lg:not-sr-only">{b.name}</span>
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}

export function HeroStoryView({
  clock,
  layer = 'all',
}: {
  clock: HeroStoryClock;
  layer?: StoryLayer;
}) {
  const { beat, t, fresh, wide } = clock;
  const prior = (beat + 5) % 6;
  const marker = historyLine(beat, t);
  const f = flowerAt(beat, t, wide, fresh);
  // punched in by each hit, and thumping lightly with every count
  const punch = 1 + kick(beat, t, fresh) + 0.006 * pulse(t);
  const cy = centreY(wide);
  const back = layer === 'words' ? 0.08 : 1;
  return (
    <Section>
      {/* A third for the words, two thirds for the stage, as the sketch has them; stacked on a phone. */}
      <div className="flex flex-col gap-column-gap lg:flex-row lg:items-center">
        <Intro />
        <div className="min-w-0 flex-1">
          <div
            ref={clock.stage}
            className="relative aspect-2/3 w-full lg:aspect-8/5"
            style={{ containerType: 'size', perspective: '900px' }}
          >
            {/* Behind: the light, following the flower at half its travel, so it reads as further away. */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                opacity: back,
                translate: `${n2((f.x - 50) * 0.5)}% ${n2((f.y - cy) * 0.5)}% -60px`,
                scale: (1 + (f.scale - 0.85) * 0.4).toFixed(4),
                transformOrigin: `50% ${cy}%`,
              }}
            >
              <StoryLight beat={beat} t={t} fresh={fresh} />
            </div>
            {/* The middle: the flower where the shot puts it, and the history beat's line from then to now. */}
            <div
              className="absolute inset-0"
              style={{
                opacity: back,
                translate: `${n2(f.x - 50)}% ${n2(f.y - cy)}%`,
                scale: (f.scale * punch).toFixed(4),
                // turned towards the middle of the stage, as a thing standing in it is, and leaning into the whip
                transform: `rotateY(${n2((50 - f.x) * 0.32 + f.lean)}deg) rotateX(5deg)`,
                filter: soft(f.blur),
                transformOrigin: `50% ${cy}%`,
              }}
            >
              <StoryFlower beat={beat} t={t} fresh={fresh} />
              <div
                aria-hidden="true"
                className="absolute inset-x-1/4 top-0 flex items-center gap-text-gap"
                style={{
                  opacity: layerOpacity(3, beat, t),
                  translate: `0 ${trackY(wide)}cqh`,
                }}
              >
                <Mono>{story.past}</Mono>
                <span className="relative block h-px flex-1 bg-hairline">
                  {/* the line fills behind the marker as time passes */}
                  <span
                    className="absolute inset-0 block origin-left bg-primary"
                    style={{ scale: `${Math.min(1, marker).toFixed(4)} 1` }}
                  />
                  {/* the marker rides a layer as wide as the line, moved along by its own width */}
                  <span
                    className="absolute inset-0 block"
                    style={{ translate: `${(marker * 100).toFixed(2)}% 0` }}
                  >
                    <span className="absolute -top-space-4 -left-space-4 block size-space-8 bg-primary" />
                  </span>
                </span>
                <Mono>{story.now}</Mono>
              </div>
            </div>
            {/* In front: the question, then the answer; the last answer still leaving as the next question comes. */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{ opacity: layer === 'petals' ? 0 : 1 }}
            >
              <Question beat={beat} u={t} fresh={fresh} wide={wide} />
            </div>
            <div
              className="pointer-events-none absolute inset-0"
              style={{ opacity: layer === 'petals' ? 0 : 1 }}
            >
              {/* the last answer still leaving; on arrival there is none */}
              {!(fresh && beat === 0) && t < OVERLAP_MS && (
                <Answer beat={prior} u={beatMs(prior) + t} wide={wide} />
              )}
              <Answer beat={beat} u={t} wide={wide} />
            </div>
          </div>
        </div>
      </div>
      <Chapters
        beat={beat}
        progress={Math.min(1, t / beatMs(beat))}
        playing={clock.playing}
        toggle={clock.toggle}
        choose={clock.choose}
      />
    </Section>
  );
}

export function HeroStory() {
  const clock = useHeroStory<HTMLDivElement>(story.beats.length);
  return <HeroStoryView clock={clock} />;
}
