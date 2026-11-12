// /make for someone not logged in (Elco, 11 Nov, #78: "i dont think signed out make has a reason to exist? if
// should be a oops, your no logged in with some illustration of petals shrugging and a bouncer… + a button to
// copy the setup prompt to the agent"). The bouncer (components/Oops.tsx), then Connect and the setup prompt
// the landing's section 4 copies. Props only; the words are drafts (lib/door-words.ts).
import { doorWords, notSignedInWords } from '../../lib/door-words.ts';
import { landingCopy } from '../../lib/landing-copy.ts';
import { publicOrigin } from '../../lib/site-links.ts';
import { CopyPrompt } from '../CopyPrompt.tsx';
import { Oops } from '../Oops.tsx';
import { Button } from '../ui/Button.tsx';

const setup = landingCopy.giveToAgent;

export function NotSignedIn({
  question,
  busy,
  failed,
  onConnect,
  onConnectEvm,
}: {
  /** a question that came with the link: it waits in the conversation once they're in */
  question: string;
  busy: boolean;
  /** why the last try didn't work */
  failed: string | null;
  onConnect: () => void;
  /** an Ethereum wallet's way in, where the page has one (wave 5) */
  onConnectEvm?: (() => void) | undefined;
}) {
  return (
    <Oops
      title={notSignedInWords.title}
      body={onConnectEvm ? notSignedInWords.bodyAny : notSignedInWords.body}
      note={question && <p className="my-0 type-ui wrap-anywhere text-muted">{question}</p>}
      primary={
        // the one Connect, as everywhere else: primary, with its arrow (Elco, 10 Nov)
        <span className="flex flex-wrap items-center gap-text-gap">
          <Button arrow disabled={busy} onClick={onConnect}>
            {onConnectEvm ? notSignedInWords.near : doorWords.connect}
          </Button>
          {onConnectEvm && (
            <Button variant="secondary" disabled={busy} onClick={onConnectEvm}>
              {notSignedInWords.evm}
            </Button>
          )}
        </span>
      }
      secondary={
        <span className="flex items-center gap-space-4 type-caption text-muted">
          {notSignedInWords.noWallet}
          <CopyPrompt
            prompt={setup.prompt(publicOrigin)}
            originIn={publicOrigin}
            label={setup.copy}
            copied={setup.copied}
            variant="quiet"
            bare
          />
        </span>
      }
      after={failed && <p className="error my-0">{failed}</p>}
    />
  );
}
