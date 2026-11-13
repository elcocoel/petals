'use client';
import {
  type CSSProperties,
  memo,
  type ReactNode,
  type RefObject,
  useEffect,
  useState,
} from 'react';
import {
  answerPin,
  flowerAt,
  type Pin,
  questionPin,
  TOOLS_REACH,
  toolsPin,
} from '../../lib/hero-shots.ts';
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
import { publicOrigin, siteLinks } from '../../lib/site-links.ts';
import { type HeroStoryClock, useHeroStory } from '../../viewmodels/useHeroStory.ts';
import { CopyPrompt } from '../CopyPrompt.tsx';
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
/** The one setup prompt, as the Give-to-your-agent section hands it out (CONNECTORS's piece, LANDING's words). */
const setup = landingCopy.giveToAgent;
/** The socials, in Elco's order (13 Nov: "github telegram twitter and youtube"). */
const SOCIALS = ['github', 'telegram', 'twitter', 'youtube'] as const;

/** Which layers show: all of them on the page; the lab can look at the words or the flower alone. */
export type StoryLayer = 'all' | 'words' | 'petals';

/** A blur only while there is one, so settled words are drawn as plain text. */
const soft = (px: number) => (px > 0.05 ? `blur(${px.toFixed(2)}px)` : 'none');
const n2 = (x: number) => x.toFixed(2);

/** A pin's height as CSS: px below the column's top, its % of the column, or within its cap of the middle. */
const topOf = (p: Pin) =>
  p.py !== undefined
    ? `${n2(p.py)}px`
    : p.cap === undefined
      ? `${p.y}cqh`
      : `calc(50cqh + clamp(-${p.cap}px, ${p.y - 50}cqh, ${p.cap}px))`;

/** The column's depth of field: how far the viewer stands from it, in px. */
const PERSPECTIVE = 900;

/**
 * How far past the column's right edge the Tools box reaches: to the frame's edge less a gutter (the window's
 * margin round the page plus the page's inset), never further than TOOLS_REACH.
 */
const REACH = `min((100vw - min(100vw, var(--spacing-page-width))) / 2 + var(--spacing-page-inset) - var(--spacing-block-gap), ${TOOLS_REACH}px)`;

/**
 * Where a pin's point is across the column, as CSS: its % of the column; with `onScreen`, that % as seen on screen;
 * or, with `inFromReach`, where that point is to land on screen, undone through the column's perspective at the box's depth, so a box in front, which depth
 * pushes outwards, still lands there (`deep`: the box is in the column's perspective; the Tools box is flat).
 */
const leftOf = (p: Pin, z: number, deep: boolean) => {
  const undo = deep ? ((PERSPECTIVE - z) / PERSPECTIVE).toFixed(4) : '1';
  if (p.inFromReach !== undefined)
    return `(50cqw + (50cqw + ${REACH} - ${p.inFromReach}px) * ${undo})`;
  return p.onScreen ? `(50cqw + ${p.x - 50}cqw * ${undo})` : `${p.x}cqw`;
};

/**
 * A box on its pin: that corner of it on that point of the column, moved by its motion, at its depth, turned
 * towards the flower (Elco, 12 Nov: the 3D "more for the messages").
 */
const pinned = (pin: Pin, m: Motion, deep = true): CSSProperties => {
  const side = pin.ax > 0.5 ? -1 : 1;
  return {
    opacity: m.opacity,
    visibility: m.opacity < 0.002 ? 'hidden' : undefined,
    translate: `calc(${leftOf(pin, m.z, deep)} - ${pin.ax * 100}% + ${n2(m.x * side)}px) calc(${topOf(pin)} - ${pin.ay * 100}% + ${n2(m.y)}px) ${n2(m.z)}px`,
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
          style={{ containerType: 'size', perspective: `${PERSPECTIVE}px` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** Where the flower's centre is in its own layer, in %: the drawing's 205 of 440, fitted to the stage's shape. */
const centreY = (wide: boolean) => (wide ? 46.59 : 48.2);

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
        {/* Connect the one dark button; beside it, lighter, the setup prompt to copy and a smaller one with a
            star for GitHub (Elco, 13 Nov: "connect is like the first one ... right next to it we should have
            connect setup prompt and then a smaller button with a star") */}
        <div className="flex flex-wrap items-center gap-space-8">
          <Button href={siteLinks.lobby} arrow>
            {hero.ask.action}
          </Button>
          <CopyPrompt
            prompt={setup.prompt(publicOrigin)}
            originIn={publicOrigin}
            label={setup.copy}
            copied={setup.copied}
            next={setup.next}
            variant="secondary"
            bare
          />
          <Button variant="square" href={siteLinks.github}>
            <Icon name="star" />
            <span className="sr-only">{hero.star}</span>
          </Button>
        </div>
        {/* Under them, the socials: just their icons, grey, no fill (Elco, 13 Nov: "they should be subtle
            probably gray no background just the icons"); a social with no address yet does nothing. */}
        <div className="mt-space-16 -ml-space-8 flex items-center">
          {SOCIALS.map((s) =>
            siteLinks.socials[s] ? (
              <IconButton
                key={s}
                icon={s}
                label={hero.socials[s]}
                href={siteLinks.socials[s]}
                tip="right"
              />
            ) : (
              <IconButton key={s} icon={s} label={hero.socials[s]} onClick={() => {}} tip="right" />
            ),
          )}
        </div>
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
 * How far below the stage's top the headline's top sits, in px, kept as the window, the stage or the words change
 * size (the words are centred beside the stage, so it moves with them); null until measured.
 */
function useTitleTop(stage: RefObject<HTMLElement | null>) {
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    const el = stage.current;
    const words = el?.parentElement;
    const title = words?.querySelector('h1');
    if (!el || !words || !title) return;
    const fit = () => setTop(title.getBoundingClientRect().top - el.getBoundingClientRect().top);
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    for (const part of words.querySelectorAll('[data-b="head"]')) watch.observe(part);
    return () => watch.disconnect();
  }, [stage]);
  return top;
}

/**
 * The Tools box, in the middle ground on a wide stage (Elco, 12 Nov: "it should be in the middle plane ... above the
 * petals ... behind the messages"): the map's own Tools box (HeroTools: the real ViewLegend in the real box), set as
 * the flower is, smaller than the words in front of it.
 */
function Tools({ beat, t, top }: { beat: number; t: number; top: number }) {
  const m = toolsBox(beat, t);
  return (
    // flat: it sits in its own layer, not in the column's perspective
    <div className="absolute top-0 left-0 w-1/5" style={pinned(toolsPin(top), m, false)}>
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
  const titleTop = useTitleTop(clock.stage);
  return (
    <Section bleed padding="bar">
      {/*
        The story runs the whole width of the window (Elco, 12 Nov: "it just feels like a graph in a box instead of a
        cinematic story"), sixteen by nine; on a very wide or tall window no taller than sixteen by nine of the page's
        width (Elco, 12 Nov: "a max height here that tries to stay within what would be a video aspect ratio"), and
        short of the first screen, so the next band shows, with a way down to it; on a wide window the words sit over its
        left side, in the page's column, and the story happens on the right, a little of it under the words. On a
        phone or a tablet, the headline, then the story four by five, the question above a big flower and the
        answer under it, then the rest of the words (Elco, 12 Nov: "purposefully layouted to work on mobile").
      */}
      {/* Wide, the words and the stage share one cell, so the hero is as tall as the taller of them: words that
          outgrow a short stage push the next band down rather than run onto it. */}
      <div className="relative left-1/2 flex w-screen -translate-x-1/2 flex-col lg:grid">
        <div className="contents lg:pointer-events-none lg:relative lg:z-10 lg:col-start-1 lg:row-start-1 lg:block">
          {/* The words a quarter of the way down the room the stage leaves them, not half (Elco, 13 Nov: "an
              unnecessarily large amount of padding in relations to the top ... about half the size"). */}
          <div className="contents lg:mx-auto lg:flex lg:h-full lg:w-full lg:max-w-page-width lg:flex-col lg:px-page-inset">
            <div aria-hidden="true" className="hidden lg:block lg:flex-1" />
            <div className="contents lg:pointer-events-auto lg:block lg:w-1/3">
              <Intro />
            </div>
            <div aria-hidden="true" className="hidden lg:block lg:flex-3" />
          </div>
        </div>
        <div
          ref={clock.stage}
          className="relative order-2 mt-space-16 aspect-4/5 max-h-[calc(100svh-6rem)] w-full lg:order-none lg:col-start-1 lg:row-start-1 lg:mt-0 lg:self-start lg:aspect-16/9 lg:max-h-[min(calc(100svh-12rem),calc(var(--spacing-page-width)*9/16))]" /* token-exempt: on a phone or a tablet, four by five and never taller than the screen under the nav, so the question, a big flower and the answer each have their own room; wide, sixteen by nine of the window, never taller than sixteen by nine of the page's width nor than the first screen, so the next band stays in sight */
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
              {wide && titleTop !== null && (
                <div
                  className="absolute inset-0"
                  style={{ opacity: layer === 'petals' ? 0 : back }}
                >
                  <Tools beat={beat} t={t} top={titleTop} />
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
