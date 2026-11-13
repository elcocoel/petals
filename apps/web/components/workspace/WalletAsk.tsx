// While a wallet signs someone in: with several wallets of one kind in this browser, which one, each by its own
// name and icon; while one is asked, its name, so the person knows where to answer, and a way to stop waiting.
// The Wallets card asks the same way. Props only; words from lib/profile-view.ts.
import type { WalletChoice } from '../../lib/evm-wallet.ts';
import { profilePageWords } from '../../lib/profile-view.ts';
import { Button } from '../ui/Button.tsx';

export function WalletAsk({
  pick,
  waitingFor,
  onChoose,
  onStop,
}: {
  /** the wallets to pick from, or null when there's no pick to make */
  pick: WalletChoice[] | null;
  /** the wallet asked now, by name */
  waitingFor: string | null;
  onChoose: (id: string) => void;
  onStop: () => void;
}) {
  if (pick) {
    return (
      <div className="flex flex-col gap-space-8">
        <p className="my-0 type-label">{profilePageWords.whichWallet}</p>
        <div className="flex flex-wrap items-center gap-text-gap">
          {pick.map((w) => (
            <Button key={w.id} variant="secondary" onClick={() => onChoose(w.id)}>
              {w.icon && (
                // biome-ignore lint/performance/noImgElement: the wallet's own icon, as it announced it
                <img className="block size-icon-size" src={w.icon} alt="" />
              )}
              {w.name}
            </Button>
          ))}
          <Button variant="quiet" onClick={onStop}>
            {profilePageWords.cancel}
          </Button>
        </div>
      </div>
    );
  }
  if (!waitingFor) return null;
  return (
    <p className="my-0 flex flex-wrap items-baseline gap-text-gap">
      <span className="type-body">{profilePageWords.waitingFor(waitingFor)}</span>
      <Button variant="quiet" onClick={onStop}>
        {profilePageWords.stop}
      </Button>
    </p>
  );
}
