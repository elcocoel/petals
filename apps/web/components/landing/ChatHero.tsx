'use client';
// LANDING's lean for the new hero, second take (Elco, 11 Nov: "a simpler, chiller illustrated hero with a
// background illustration like this and simulated chat process with an evolving petal (symbolic, iconic) as
// it goes, just so it's not outdated as I evolve the look"), in /lab/landing-hero until Elco has seen it.
// A calm illustration covers the band, its figures to the right (HERO ART draws it; until then a stand-in,
// marked). The approved eyebrow, headline, subline and Connect sit on its quiet left; a chat card on the
// right plays a few scripted turns by itself (viewmodels/useHeroChat.ts), with the petal (HeroPetal) growing
// as Petals' agent answers. The turns are drawn as the real chat draws them (Speech).
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { useHeroChat } from '../../viewmodels/useHeroChat.ts';
import { Speech } from '../chat/Speech.tsx';
import { Button } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { Mono } from '../ui/Mono.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { HeroPetal, type PetalStage } from './HeroPetal.tsx';

const hero = landingCopy.hero;
const chat = landingCopy.heroChat;

/** The illustration, a stand-in until HERO ART's drawing for this band arrives. */
const PICTURE = '/landing/give-to-agent/petals-leading-agents.webp';

export function ChatHero() {
  const play = useHeroChat<HTMLDivElement>(chat.turns.length);
  const stage = (chat.turns[play.shown - 1]?.stage ?? 0) as PetalStage;
  return (
    // The picture lies over the band's ground and under the words and the chat: positioned first, so the
    // positioned columns after it paint above it.
    <div className="relative overflow-hidden">
      <Section layout="split">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-end justify-end"
        >
          {/* biome-ignore lint/performance/noImgElement: a still illustration, served as it is */}
          <img
            className="block h-auto w-1/2 lg:w-1/3"
            src={PICTURE}
            width={1200}
            height={800}
            alt=""
          />
          <div className="absolute right-0 bottom-0 p-space-16">
            <Mono>{chat.standIn}</Mono>
          </div>
        </div>
        <div className="relative lg:self-center">
          <SectionHead size="display" eyebrow={hero.eyebrow} title={hero.title} body={hero.body} />
          <div className="mt-column-gap">
            <Button href={siteLinks.lobby} arrow>
              {hero.ask.action}
            </Button>
          </div>
        </div>
        <div ref={play.box} className="relative lg:w-3/5">
          <Card title={chat.title} labelledBy="hero-chat">
            <div className="flex justify-center">
              <HeroPetal stage={stage} />
            </div>
            {/* Every turn holds its place from the start, unseen until it's said, so the card never grows
                and nothing around it moves. */}
            <div className="flex flex-col gap-space-16">
              {chat.turns.map((turn, i) => {
                const hidden = i >= play.shown ? 'invisible' : undefined;
                return turn.by === 'you' ? (
                  <div key={turn.text} className={hidden} aria-hidden={hidden ? true : undefined}>
                    <Speech speaker={chat.you} mine>
                      {turn.text}
                    </Speech>
                  </div>
                ) : (
                  <div key={turn.text} className={hidden} aria-hidden={hidden ? true : undefined}>
                    <Speech speaker={chat.agent} agent>
                      {turn.text}
                    </Speech>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </Section>
    </div>
  );
}
