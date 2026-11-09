// Use it anywhere, on the mint band that was Figma's Closing ask (66:2336): how your own agents work with
// Petals' agent (C, 9 Nov). The prompt copies from here, in one click; keeping Petals in an agent is /connect's.
import { agentPrompt } from '../../lib/agent-prompt.ts';
import { landingCopy } from '../../lib/landing-copy.ts';
import { publicOrigin, siteLinks } from '../../lib/site-links.ts';
import { CopyPrompt } from '../CopyPrompt.tsx';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { Terminal } from '../ui/Terminal.tsx';

const copy = landingCopy.useAnywhere;

export function UseAnywhere() {
  return (
    <Section kind="mint" layout="split">
      <div>
        <SectionHead size="compact" title={copy.title} body={copy.body} />
        <div className="mt-space-32 flex flex-col items-start gap-text-gap">
          <ActionRow gap="tight">
            <CopyPrompt
              variant="secondary"
              prompt={agentPrompt(publicOrigin)}
              originIn={publicOrigin}
              label={copy.actions.prompt}
              bare={{ readHref: siteLinks.doors.prompt }}
            />
            <Button variant="secondary" href={siteLinks.doors.claudeCode}>
              {copy.actions.keep}
            </Button>
          </ActionRow>
          <p className="my-0 type-caption">{copy.promptNote}</p>
        </div>
      </div>
      <Terminal {...copy.terminal} />
    </Section>
  );
}
