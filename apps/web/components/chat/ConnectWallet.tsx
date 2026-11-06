// What stands where the composer will be, until a wallet is connected. A question that came with the link
// waits here, and is in the composer once they've connected. Words from lib/door-words.ts.
import { doorWords } from '../../lib/door-words.ts';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';
import { TextLink } from '../ui/TextLink.tsx';

export function ConnectWallet({
  question,
  busy,
  failed,
  onConnect,
}: {
  question: string;
  busy: boolean;
  /** why the last try didn't work */
  failed: string | null;
  onConnect: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-text-gap px-block-gap pt-text-gap pb-block-gap">
      {question && <p className="my-0 type-body wrap-anywhere text-muted">{question}</p>}
      <ActionRow gap="tight">
        <Button disabled={busy} onClick={onConnect}>
          {doorWords.connect}
        </Button>
        <TextLink variant="quiet" href="/connect">
          {doorWords.ownAgent}
        </TextLink>
      </ActionRow>
      {failed && <p className="error my-0">{failed}</p>}
    </div>
  );
}
