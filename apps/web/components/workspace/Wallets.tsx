// The Wallets card (the profile page as the investigator's card): the wallets the person proved by
// signing in with them, each with its chain and when it signed, and the badge PROVEN, set against a link's
// DECLARED, so it reads what backs the person and what's only their word. Null while it's read; with no
// answer, it says so. Its one action, Add a wallet, asks another wallet to sign, as signing in does. With
// several wallets of one kind in this browser, it asks which, each by its own name and icon; while a wallet is
// asked it names it, with a way to stop waiting; what the wallet answers, a no included, shows plainly.
// Props only: viewmodels/useLobby.ts reads it and adds. Words from lib/profile-view.ts.
import {
  type AddWalletPhase,
  profilePageWords,
  type WalletKind,
  type WalletRow,
} from '../../lib/profile-view.ts';
import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { Mono } from '../ui/Mono.tsx';

export function Wallets({
  wallets,
  adding = { kind: 'ready' },
  onAdd,
  onStop,
}: {
  wallets: WalletRow[] | 'reading' | 'unread';
  adding?: AddWalletPhase;
  /** Asks another wallet to sign, a NEAR, an EVM or a Solana one, the one picked by its id; absent, no buttons. */
  onAdd?: (kind: WalletKind, pick?: string) => void;
  /** Stops waiting, or puts the pick away. */
  onStop?: () => void;
}) {
  const rows = Array.isArray(wallets) ? wallets : [];
  return (
    <Card
      title={profilePageWords.wallets}
      labelledBy="profile-wallets"
      badge={rows.length > 0 ? <Badge>{rows.length}</Badge> : undefined}
    >
      {wallets === 'reading' && (
        <p className="my-0 type-caption text-muted">{profilePageWords.reading}</p>
      )}
      {wallets === 'unread' && (
        <p className="my-0 type-caption text-muted">{profilePageWords.unread}</p>
      )}
      {rows.length > 0 && (
        <>
          <ul className="m-0 flex list-none flex-col p-0">
            {rows.map((w) => (
              <li
                key={w.key}
                className="flex flex-col gap-space-4 border-t border-hairline py-text-gap"
              >
                <div className="flex flex-wrap items-center gap-text-gap">
                  <span title={w.full} className="min-w-0 wrap-anywhere">
                    <Mono as="span">{w.shown}</Mono>
                  </span>
                  <Badge>{w.chain}</Badge>
                  <Badge>{profilePageWords.proven}</Badge>
                </div>
                <span className="type-caption text-muted">{w.when}</span>
              </li>
            ))}
          </ul>
          <p className="my-0 type-caption text-muted">{profilePageWords.walletsNote}</p>
        </>
      )}
      {onAdd && (
        <div className="flex flex-wrap items-center gap-text-gap">
          <Button
            variant="secondary"
            disabled={adding.kind === 'adding'}
            onClick={() => onAdd('near')}
          >
            {profilePageWords.connectNear}
          </Button>
          <Button
            variant="secondary"
            disabled={adding.kind === 'adding'}
            onClick={() => onAdd('evm')}
          >
            {profilePageWords.connectEvm}
          </Button>
          <Button
            variant="secondary"
            disabled={adding.kind === 'adding'}
            onClick={() => onAdd('solana')}
          >
            {profilePageWords.connectSolana}
          </Button>
        </div>
      )}
      {adding.kind === 'choose' && onAdd && (
        <div className="flex flex-col gap-space-8 border-t border-hairline pt-text-gap">
          <p className="my-0 type-label">{profilePageWords.whichWallet}</p>
          <div className="flex flex-wrap items-center gap-text-gap">
            {adding.wallets.map((w) => (
              <Button key={w.id} variant="secondary" onClick={() => onAdd(adding.chain, w.id)}>
                {w.icon && (
                  // biome-ignore lint/performance/noImgElement: the wallet's own icon, as it announced it
                  <img className="block size-icon-size" src={w.icon} alt="" />
                )}
                {w.name}
              </Button>
            ))}
            {onStop && (
              <Button variant="quiet" onClick={onStop}>
                {profilePageWords.cancel}
              </Button>
            )}
          </div>
        </div>
      )}
      {adding.kind === 'adding' && (
        <p className="my-0 flex flex-wrap items-baseline gap-text-gap">
          <span className="type-body">{profilePageWords.waitingFor(adding.wallet)}</span>
          {onStop && (
            <Button variant="quiet" onClick={onStop}>
              {profilePageWords.stop}
            </Button>
          )}
        </p>
      )}
      {adding.kind === 'failed' && <p className="my-0 type-body">{adding.why}</p>}
    </Card>
  );
}
