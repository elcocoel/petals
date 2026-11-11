// Give this to your agent, the Copy doc's section 4, Version 4 draft (Elco, 11 Nov): Figma's "Section 4 · V3
// textured invitation" (203:2343 desktop, 203:2359 mobile) on the mint band, with Petals' agent leading two
// agents by the hand (design/section-4-illustration/). One button copies the one setup prompt
// (agentWords.setup, CONNECTORS's), which any chatbot can follow before sign-in to walk the person to
// Petals' agent, and which brings the agent in after. Wide, the words take the split's text side and the
// drawing the other; narrow, the drawing sits between the headline and the paragraph, as Figma's mobile has it.
import { landingCopy } from '../../lib/landing-copy.ts';
import { publicOrigin } from '../../lib/site-links.ts';
import { CopyPrompt } from '../CopyPrompt.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';

const copy = landingCopy.giveToAgent;

export function GiveToAgent() {
  return (
    <Section kind="mint">
      <div className="grid grid-cols-1 items-center gap-block-gap lg:grid-cols-split lg:gap-x-column-gap lg:gap-y-0">
        <div className="text-balance lg:col-start-1 lg:row-start-1 lg:self-end">
          <SectionHead title={copy.title} />
        </div>
        {/* biome-ignore lint/performance/noImgElement: a still illustration, served as it is */}
        <img
          className="block h-auto w-full lg:col-start-2 lg:row-span-2 lg:row-start-1"
          src="/landing/give-to-agent/petals-leading-agents.webp"
          width={1200}
          height={800}
          loading="lazy"
          alt=""
        />
        <div className="lg:col-start-1 lg:row-start-2 lg:mt-block-gap lg:self-start">
          <p className="my-0 text-pretty type-body">{copy.body}</p>
          <div className="mt-space-32">
            <CopyPrompt
              prompt={copy.prompt(publicOrigin)}
              originIn={publicOrigin}
              label={copy.copy}
              copied={copy.copied}
              arrow
              bare
            />
          </div>
        </div>
      </div>
    </Section>
  );
}
