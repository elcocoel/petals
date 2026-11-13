// What stands where the composer will be, until a wallet is connected. A question that came with the link
// waits here, and is in the composer once they've connected. NEAR, Ethereum and Solana, as the signed-out
// page offers them (components/workspace/NotSignedIn.tsx; flow 1, 13 Nov). Words from lib/door-words.ts.
import type { ReactNode } from 'react';
import { doorWords, notSignedInWords } from '../../lib/door-words.ts';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';

export function ConnectWallet({
  question,
  busy,
  failed,
  onConnect,
  onConnectEvm,
  onConnectSolana,
  ask,
}: {
  question: string;
  busy: boolean;
  /** why the last try didn't work */
  failed: string | null;
  onConnect: () => void;
  /** an Ethereum wallet's way in, where the page has one */
  onConnectEvm?: (() => void) | undefined;
  /** a Solana wallet's way in, where the page has one */
  onConnectSolana?: (() => void) | undefined;
  /** which wallet, or the one being asked (WalletAsk) */
  ask?: ReactNode;
}) {
  const others = Boolean(onConnectEvm || onConnectSolana);
  return (
    <div className="flex flex-col items-start gap-text-gap px-block-gap py-space-16">
      {question && <p className="my-0 type-ui wrap-anywhere text-muted">{question}</p>}
      <ActionRow gap="tight">
        {/* the one Connect, as the hero's box and the navbar have it: primary, with its arrow */}
        <Button arrow disabled={busy} onClick={onConnect}>
          {others ? notSignedInWords.near : doorWords.connect}
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
      </ActionRow>
      {ask}
      {failed && <p className="error my-0">{failed}</p>}
    </div>
  );
}
