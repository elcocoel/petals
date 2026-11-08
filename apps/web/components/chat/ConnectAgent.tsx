// What a signed-in person sees where Petals' greeting and composer were, on a site that runs no agent for
// visitors: their own agent does the work, so the way to start is the prompt it needs (lib/agent-prompt.ts).
// Pasted into Claude Code, Codex or Hermes, the agent opens its conversation in this browser. Words from
// lib/door-words.ts, proposed, not approved.
import { doorWords } from '../../lib/door-words.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { CopyPrompt } from '../CopyPrompt.tsx';
import { ActionRow } from '../ui/ActionRow.tsx';
import { TextLink } from '../ui/TextLink.tsx';

export function ConnectAgent({ prompt }: { prompt: string }) {
  return (
    <div className="flex flex-col items-start gap-text-gap px-block-gap pt-text-gap pb-block-gap">
      <p className="my-0 type-body">{doorWords.pasteIt}</p>
      <ActionRow gap="tight">
        <CopyPrompt
          prompt={prompt}
          label={doorWords.copyPrompt}
          bare={{ readHref: siteLinks.doors.prompt }}
        />
        <TextLink variant="quiet" href={siteLinks.connect}>
          {doorWords.otherWays}
        </TextLink>
      </ActionRow>
    </div>
  );
}
