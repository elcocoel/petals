// Use it anywhere, on the mint band that was Figma's Closing ask (66:2336). Each button goes to its door on
// /connect, which says plainly what that app asks you to do. The prompt copies from here, in one click.
import { agentPrompt } from '../../lib/agent-prompt.ts';
import { landingCopy } from '../../lib/landing-copy.ts';
import { publicOrigin, siteLinks } from '../../lib/site-links.ts';
import { CopyPrompt } from '../CopyPrompt.tsx';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';
import { Drawing } from '../ui/Drawing.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';

const copy = landingCopy.useAnywhere;

export function UseAnywhere() {
  return (
    <Section kind="mint" layout="split">
      <div>
        <SectionHead size="compact" title={copy.title} body={copy.body} />
        <div className="mt-space-32 flex flex-col items-start gap-text-gap">
          <ActionRow gap="tight">
            <Button variant="secondary" href={siteLinks.doors.claude}>
              {copy.actions.claude}
            </Button>
            <Button variant="secondary" href={siteLinks.doors.chatgpt}>
              {copy.actions.chatgpt}
            </Button>
            <Button variant="secondary" href={siteLinks.doors.claudeCode}>
              {copy.actions.claudeCode}
            </Button>
          </ActionRow>
          <CopyPrompt
            variant="secondary"
            prompt={agentPrompt(publicOrigin)}
            label={copy.actions.prompt}
            bare={{ readHref: siteLinks.doors.prompt }}
          />
          <p className="my-0 type-caption">{copy.promptNote}</p>
        </div>
      </div>
      <div className="lg:justify-self-end">
        <Drawing kind="cell" size={240} />
      </div>
    </Section>
  );
}
