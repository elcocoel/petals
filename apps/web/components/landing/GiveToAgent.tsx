// Give this to your agent, on the mint band that was Figma's Closing ask (66:2336): the Copy doc's section 4
// (Elco, 11 Nov). One button copies the one setup prompt (agentWords.setup, CONNECTORS's), which any chatbot
// can follow before sign-in to walk the person to Petals' agent, and which brings the agent in after. It has no figure, so
// it takes the band's width, and the copy's line breaks keep its lines a readable length.
import { landingCopy } from '../../lib/landing-copy.ts';
import { publicOrigin } from '../../lib/site-links.ts';
import { CopyPrompt } from '../CopyPrompt.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';

const copy = landingCopy.giveToAgent;

export function GiveToAgent() {
  return (
    <Section kind="mint">
      <SectionHead size="compact" title={copy.title} body={copy.body} />
      <div className="mt-space-32">
        <CopyPrompt
          prompt={copy.prompt(publicOrigin)}
          originIn={publicOrigin}
          label={copy.copy}
          copied={copy.copied}
          bare
        />
      </div>
    </Section>
  );
}
