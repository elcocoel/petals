// What stands where the composer will be, until a wallet is connected. A question that came with the link
// waits here, and is in the composer once they've connected. Words from lib/door-words.ts.
import { doorWords } from '../../lib/door-words.ts';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';

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
    <div className="flex flex-col items-start gap-text-gap px-block-gap py-space-16">
      {question && <p className="my-0 type-ui wrap-anywhere text-muted">{question}</p>}
      <ActionRow gap="tight">
        {/* the one Connect, as the hero's box and the navbar have it: primary, with its arrow (Elco, 10 Nov) */}
        <Button arrow disabled={busy} onClick={onConnect}>
          {doorWords.connect}
        </Button>
      </ActionRow>
      {failed && <p className="error my-0">{failed}</p>}
    </div>
  );
}
