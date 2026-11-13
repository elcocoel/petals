// /make for someone not logged in: a signed-out workspace has nothing to show, so it says so with the bouncer
// illustration (components/Oops.tsx), then offers Connect and the same setup prompt the landing's setup band
// copies, for a person's own agent to walk them in. Props only; the words live in lib/door-words.ts.
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
  onConnectSolana,
}: {
  /** a question that came with the link: it waits in the conversation once they're in */
  question: string;
  busy: boolean;
  /** why the last try didn't work */
  failed: string | null;
  onConnect: () => void;
  /** an Ethereum wallet's way in, where the page has one */
  onConnectEvm?: (() => void) | undefined;
  /** a Solana wallet's way in, where the page has one */
  onConnectSolana?: (() => void) | undefined;
}) {
  return (
    <Oops
      title={notSignedInWords.title}
      body={
        onConnectSolana
          ? notSignedInWords.bodyAll
          : onConnectEvm
            ? notSignedInWords.bodyAny
            : notSignedInWords.body
      }
      note={question && <p className="my-0 type-ui wrap-anywhere text-muted">{question}</p>}
      primary={
        // the one Connect, as everywhere else: primary, with its arrow
        <span className="flex flex-wrap items-center gap-text-gap">
          <Button arrow disabled={busy} onClick={onConnect}>
            {onConnectEvm || onConnectSolana ? notSignedInWords.near : doorWords.connect}
          </Button>
          {onConnectEvm && (
            <Button variant="secondary" disabled={busy} onClick={onConnectEvm}>
              {notSignedInWords.evm}
            </Button>
          )}
          {onConnectSolana && (
            <Button variant="secondary" disabled={busy} onClick={onConnectSolana}>
              {notSignedInWords.solana}
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
            next={setup.next}
            variant="quiet"
            bare
          />
        </span>
      }
      after={failed && <p className="error my-0">{failed}</p>}
    />
  );
}
