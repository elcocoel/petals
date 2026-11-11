// /make for someone not logged in (Elco, 11 Nov, #78: "i dont think signed out make has a reason to exist? if
// should be a oops, your no logged in with some illustration of petals shrugging and a bouncer… + a button to
// copy the setup prompt to the agent"). Petals' unit, closed, shrugs behind a velvet rope (public/brand/
// shrug.svg, from design/petals-motion), then Connect and the setup prompt the landing's section 4 copies.
// Props only; the words are drafts (lib/door-words.ts).
import { doorWords, notSignedInWords } from '../../lib/door-words.ts';
import { landingCopy } from '../../lib/landing-copy.ts';
import { publicOrigin } from '../../lib/site-links.ts';
import { CopyPrompt } from '../CopyPrompt.tsx';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';

const setup = landingCopy.giveToAgent;

export function NotSignedIn({
  question,
  busy,
  failed,
  onConnect,
}: {
  /** a question that came with the link: it waits in the conversation once they're in */
  question: string;
  busy: boolean;
  /** why the last try didn't work */
  failed: string | null;
  onConnect: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-block-gap bg-surface p-block-gap text-center">
      <img src="/brand/shrug.svg" alt="" width={260} height={230} />
      <div className="flex max-w-content-width flex-col items-center gap-text-gap">
        <h1 className="my-0 type-title">{notSignedInWords.title}</h1>
        <p className="my-0 type-body whitespace-pre-line">{notSignedInWords.body}</p>
        {question && <p className="my-0 type-ui wrap-anywhere text-muted">{question}</p>}
      </div>
      <ActionRow gap="tight">
        {/* the one Connect, as everywhere else: primary, with its arrow (Elco, 10 Nov) */}
        <Button arrow disabled={busy} onClick={onConnect}>
          {doorWords.connect}
        </Button>
        <CopyPrompt
          prompt={setup.prompt(publicOrigin)}
          originIn={publicOrigin}
          label={setup.copy}
          copied={setup.copied}
          variant="secondary"
          bare
        />
      </ActionRow>
      {failed && <p className="error my-0">{failed}</p>}
    </div>
  );
}
