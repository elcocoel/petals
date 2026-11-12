'use client';
import { type CSSProperties, memo, type ReactNode } from 'react';
import { answerPin, flowerAt, type Pin, questionPin, toolsPin } from '../../lib/hero-shots.ts';
import {
  answerBox,
  answerLine,
  answerWord,
  kick,
  type Motion,
  pulse,
  question,
  toolsBox,
} from '../../lib/hero-story.ts';
// The landing's hero (HERO ART's V2, approved by Elco 11 Nov: "get this in the hero please"; HERO MOTION's
// choreography): the approved eyebrow, headline, subline and Connect over the left of a stage the width of the
// window, its layers apart, so the page can compose them for a phone or a wide screen (Elco, 11 Nov). In the
// middle, one symbolic flower that performs each answer (StoryFlower), flat to the screen; the camera whips it from
// shot to shot on each beat's one (lib/hero-shots.ts). Over it, the real Tools box, set as the flower is. In
// front, the conversation, in one place just right of the words (Elco, 12 Nov: "keep the messages closer to each
// other ... think of the route that an eye has to travel"): the question in a light bubble, turned in depth, and
// Petals' answer under it in a dark box that stays, its words giving way to the next answer's.
// It plays by itself (viewmodels/useHeroStory.ts). `HeroStoryView` only draws, so the lab can hand it a layer to
// isolate. Only the stage redraws each frame.
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
import { HeroTools } from './HeroTools.tsx';
import { StoryFlower } from './StoryFlower.tsx';

const hero = landingCopy.hero;
const story = landingCopy.heroStory;

/** Which layers show: all of them on the page; the lab can look at the words or the flower alone. */
export type StoryLayer = 'all' | 'words' | 'petals';

/** A blur only while there is one, so settled words are drawn as plain text. */
const soft = (px: number) => (px > 0.05 ? `blur(${px.toFixed(2)}px)` : 'none');
const n2 = (x: number) => x.toFixed(2);

/** A pin's height as CSS: its % of the column, or within its cap of the middle. */
const topOf = (p: Pin) =>
  p.cap === undefined
    ? `${p.y}cqh`
    : `calc(50cqh + clamp(-${p.cap}px, ${p.y - 50}cqh, ${p.cap}px))`;

/**
 * A box on its pin: that corner of it on that point of the column, moved by its motion, at its depth, turned
 * towards the flower (Elco, 12 Nov: the 3D "more for the messages").
 */
const pinned = (pin: Pin, m: Motion): CSSProperties => {
  const side = pin.ax > 0.5 ? -1 : 1;
  return {
    opacity: m.opacity,
    visibility: m.opacity < 0.002 ? 'hidden' : undefined,
    translate: `calc(${pin.x}cqw - ${pin.ax * 100}% + ${n2(m.x * side)}px) calc(${topOf(pin)} - ${pin.ay * 100}% + ${n2(m.y)}px) ${n2(m.z)}px`,
    scale: m.scale.toFixed(4),
    transform: `rotateY(${n2(side * m.turn)}deg)`,
    transformOrigin: `${pin.ax * 100}% ${pin.ay * 100}%`,
    filter: soft(m.blur),
  };
};

/**
 * The page's column over the stage (Elco, 12 Nov: on a wide window the messages ran onto the headline): the story
 * is composed in it, as the words are, so it stays with them however wide the window; the world runs on past it.
 */
function Column({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="mx-auto h-full w-full max-w-page-width px-block-gap md:px-page-inset">
        <div
          className="relative h-full w-full"
          style={{ containerType: 'size', perspective: '900px' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** Where the flower's centre is in its own layer, in %: the drawing's 205 of 440, fitted to the stage's shape. */
const centreY = (wide: boolean) => (wide ? 46.59 : 47.2);

/** On a phone or a tablet each part of the words keeps the column's own gutter; beside the stage, the column's. */
const GUTTER = 'px-block-gap md:px-page-inset lg:px-0';

/**
 * The words: they never move, so they never redraw with the stage. Beside the stage on a wide screen; on a phone
 * or a tablet the headline, then the story, then the line under it and Connect (Elco, 12 Nov: words and stage in
 * one screen; the nav carries Connect there too), so each part is placed on its own (`order`).
 */
const Intro = memo(function Intro() {
  return (
    <>
      <div className={`order-1 ${GUTTER}`}>
        <SectionHead size="hero" eyebrow={hero.eyebrow} title={hero.titleWide} />
      </div>
      {/* the hero's body, as SectionHead sets it, rising as the head's does (head.rise) */}
      <div data-b="head" className={`order-3 ${GUTTER}`}>
        <p className="mt-block-gap mb-0 whitespace-pre-line text-pretty type-body">{hero.body}</p>
      </div>
      <div className={`order-4 mt-column-gap ${GUTTER}`}>
        <Button href={siteLinks.lobby} arrow>
          {hero.ask.action}
        </Button>
      </div>
    </>
  );
});

/**
 * The question, in a light bubble, the call: it swings in on the one and leaves on the last and. Every question sits
 * in the same cell, so the bubble is the size of the longest.
 */
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
  const m = question(beat, u, fresh);
  return (
    <div
      className="absolute top-0 left-0 w-max max-w-3/5 sm:max-w-4/5 lg:max-w-1/4"
      style={pinned(questionPin(wide), m)}
    >
      <Glass tone="light" facing="right" glint={m.glint} glow={m.glow} />
      {/* on a phone a size down and closer in, so the flower between the call and the response still shows */}
      <div className="relative flex flex-col gap-space-4 px-space-16 py-space-8 sm:px-block-gap sm:py-space-16">
        <Mono>{story.you}</Mono>
        <div className="grid">
          {story.beats.map((b, own) => (
            <p
              key={b.name}
              aria-hidden={own !== beat}
              className="col-start-1 row-start-1 my-0 text-pretty type-caption sm:type-body lg:type-lead"
              style={{ visibility: own === beat ? undefined : 'hidden' }}
            >
              {b.q}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Petals' answer, the response, in a dark box across the flower from the question, that comes with the first answer
 * and stays (Elco, 12 Nov):
 * only its words change, the last answer giving way to the next word by word. Every answer sits in the same cell,
 * so the box is the size of the longest and never changes size.
 */
function Answer({
  beat,
  t,
  fresh,
  wide,
}: {
  beat: number;
  t: number;
  fresh: boolean;
  wide: boolean;
}) {
  const m = answerBox(beat, t, fresh);
  return (
    <div
      className="absolute top-0 left-0 w-max max-w-2/3 sm:max-w-9/10 lg:max-w-1/4"
      style={pinned(answerPin(wide), m)}
    >
      {/* its rim lit from the flower's side */}
      <Glass tone="dark" facing="left" glint={m.glint} glow={m.glow} />
      <div className="relative flex flex-col gap-space-4 px-space-16 py-space-8 text-on-action sm:gap-space-8 sm:px-block-gap sm:py-space-16">
        <p className="my-0 flex items-center gap-space-8 type-mono" style={{ opacity: 0.7 }}>
          <Icon name="petals" small />
          {story.petals}
        </p>
        <div className="grid">
          {story.beats.map((b, own) => {
            const line = answerLine(own, beat, t, fresh);
            return (
              <p
                key={b.name}
                aria-hidden={own !== beat}
                className="col-start-1 row-start-1 my-0 text-pretty type-label sm:type-heading"
                style={{
                  visibility: line.opacity > 0.002 ? undefined : 'hidden',
                  opacity: line.opacity,
                  translate: `0 ${n2(line.y)}px`,
                  filter: soft(line.blur),
                }}
              >
                {line.words
                  ? b.a.split(' ').map((w, j) => {
                      const word = answerWord(beat, t, j);
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
                    })
                  : b.a}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * The Tools box, in the middle ground on a wide stage (Elco, 12 Nov: "it should be in the middle plane ... above the
 * petals ... behind the messages"): the map's own Tools box (HeroTools: the real ViewLegend in the real box), set as
 * the flower is, smaller than the words in front of it.
 */
function Tools({ beat, t }: { beat: number; t: number }) {
  const m = toolsBox(beat, t);
  return (
    <div className="absolute top-0 left-0 w-1/5" style={pinned(toolsPin, m)}>
      <HeroTools beat={beat} t={t} />
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
  const f = flowerAt(beat, t, wide, fresh);
  // punched in by each hit
  const punch = 1 + kick(beat, t);
  const cy = centreY(wide);
  const back = layer === 'words' ? 0.08 : 1;
  return (
    <Section bleed padding="bar">
      {/*
        The story runs the whole width of the window (Elco, 12 Nov: "it just feels like a graph in a box instead of a
        cinematic story"), sixteen by nine; on a very wide or tall window no taller than sixteen by nine of the page's
        width (Elco, 12 Nov: "a max height here that tries to stay within what would be a video aspect ratio"), and
        short of the first screen, so the next band shows, with a way down to it; on a wide window the words sit over its
        left side, in the page's column, and the story happens on the right, a little of it under the words. On a
        phone or a tablet, the headline, the story four by three, then the rest of the words.
      */}
      <div className="relative left-1/2 flex w-screen -translate-x-1/2 flex-col">
        <div className="contents lg:pointer-events-none lg:absolute lg:inset-0 lg:z-10 lg:block">
          <div className="contents lg:mx-auto lg:flex lg:h-full lg:w-full lg:max-w-page-width lg:items-center lg:px-page-inset">
            <div className="contents lg:pointer-events-auto lg:block lg:w-1/3">
              <Intro />
            </div>
          </div>
        </div>
        <div
          ref={clock.stage}
          className="relative order-2 mt-space-16 aspect-4/3 max-h-[max(16rem,calc(100svh-24rem))] w-full lg:order-none lg:mt-0 lg:aspect-16/9 lg:max-h-[min(calc(100svh-12rem),calc(var(--spacing-page-width)*9/16))]" /* token-exempt: on a phone, four by three, shorter on a short screen so the headline and the story share the first screen under the nav; wide, sixteen by nine of the window, never taller than sixteen by nine of the page's width nor than the first screen, so the next band stays in sight */
          style={{ containerType: 'size', perspective: '900px' }}
        >
          {/* The world stays inside the stage, so the far map never spills onto the page; the map fades its own
              edges (lib/hero-map.ts). With the stage's perspective, for the layers' depth. */}
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            style={{ perspective: '900px' }}
          >
            {/* The middle: the flower where the shot puts it, flat to the screen; over it the tools. */}
            <Column>
              <div
                className="absolute inset-0"
                style={{
                  opacity: back,
                  translate: `${n2(f.x - 50)}% ${n2(f.y - cy)}%`,
                  scale: (f.scale * punch).toFixed(4),
                  transformOrigin: `50% ${cy}%`,
                }}
              >
                <StoryFlower beat={beat} t={t} />
              </div>
              {wide && (
                <div
                  className="absolute inset-0"
                  style={{ opacity: layer === 'petals' ? 0 : back }}
                >
                  <Tools beat={beat} t={t} />
                </div>
              )}
            </Column>
            {/* Under the words, the world fades into the page, so what runs beneath them never fights them. */}
            <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-1/2 bg-linear-to-r from-surface from-35% to-transparent lg:block" />
          </div>
          {/* The way on to the rest of the page, at the stage's foot, nodding with the beat (Elco, 12 Nov: "little
              arrows pointing down for people to actually look at the rest of the website"). */}
          <div className="absolute inset-x-0 bottom-0 z-10 hidden justify-center lg:flex">
            <div style={{ translate: `0 ${n2(4 * pulse(t))}px` }}>
              <IconButton
                icon="down"
                label={landingCopy.nav.howItWorks}
                href={siteLinks.howItWorks}
                tip="right"
              />
            </div>
          </div>
          {/* In front: the call and the response, on either side of the flower. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ opacity: layer === 'petals' ? 0 : 1 }}
          >
            <Column>
              <Question beat={beat} u={t} fresh={fresh} wide={wide} />
              <Answer beat={beat} t={t} fresh={fresh} wide={wide} />
            </Column>
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
