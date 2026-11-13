// Give this to your agent: the landing's setup band, with Petals' agent leading two agents by the hand
// (design/section-4-illustration/). One button copies the one setup prompt (agentWords.setup, lib/agents.ts), which
// any chatbot can follow before sign-in to walk the person to Petals' agent.
// The band leads to that button: one large line and under it a glass card, the button first and the line that says
// what it does under it, stacked and centred in the band's left. The drawing stands behind the band on the right,
// out of any column, on the band's lower edge; its detached tint shapes and a white patch inside the ear, which
// vanished into or stood out against the band's green, are cut out of the file (petals-leading-agents-clear.webp).
import { landingCopy } from '../../lib/landing-copy.ts';
import { publicOrigin } from '../../lib/site-links.ts';
import { CopyPrompt } from '../CopyPrompt.tsx';
import { Section } from '../ui/Section.tsx';
import { Glass } from './HeroGlass.tsx';

const copy = landingCopy.giveToAgent;

export function GiveToAgent() {
  return (
    <Section kind="mint" bleed>
      {/* The band's whole width: the drawing and the words share one cell, so the band is as tall as either. */}
      <div className="relative left-1/2 grid w-screen -translate-x-1/2">
        {/* The drawing stands on the band's lower edge, through its padding. */}
        {/* biome-ignore lint/performance/noImgElement: a still illustration, served as it is */}
        <img
          className="col-start-1 row-start-2 mt-column-gap -mb-page-inset block h-auto w-full self-end justify-self-end md:-mb-section-padding lg:row-start-1 lg:mt-0 lg:w-1/2"
          src="/landing/give-to-agent/petals-leading-agents-clear.webp"
          width={1200}
          height={800}
          loading="lazy"
          alt=""
        />
        {/* Wide, the stack takes the band's left, centred there and against the drawing, which has the right. */}
        <div className="col-start-1 row-start-1 mx-auto flex w-full max-w-page-width px-block-gap md:px-page-inset lg:items-center">
          <div className="flex w-full flex-col items-center gap-column-gap text-center lg:w-7/12">
            <h2 className="my-0 text-balance type-title lg:type-display-compact">{copy.title}</h2>
            {/* the centre of the band: the button first, and what it does under it */}
            <div className="relative w-full max-w-conversation-width">
              <Glass tone="light" />
              <div className="relative flex flex-col items-center gap-block-gap p-block-gap">
                <CopyPrompt
                  prompt={copy.prompt(publicOrigin)}
                  originIn={publicOrigin}
                  label={copy.copy}
                  copied={copy.copied}
                  next={copy.next}
                  arrow
                  bare
                />
                <p className="my-0 text-pretty type-body text-primary">{copy.body}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
