// The Wallets card (#79, the profile page as the investigator's card): the wallets the person proved by
// signing in with them, each with its chain and when it signed, and the badge PROVEN, set against a link's
// DECLARED, so it reads what backs the person and what's only their word. Null while it's read; with no
// answer, it says so. Its one action, Add a wallet (Elco, 11 Nov: "allow me to add more wallets"), asks
// another wallet to sign, as signing in does. Props only: viewmodels/useLobby.ts reads it and adds. Words
// from lib/profile-view.ts, drafts.
import { type AddWalletPhase, profilePageWords, type WalletRow } from '../../lib/profile-view.ts';
import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { Mono } from '../ui/Mono.tsx';

export function Wallets({
  wallets,
  adding = { kind: 'ready' },
  onAdd,
}: {
  wallets: WalletRow[] | 'reading' | 'unread';
  adding?: AddWalletPhase;
  /** Asks another wallet to sign, a NEAR or an EVM one; absent, there are no buttons. */
  onAdd?: (kind: 'near' | 'evm') => void;
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
        </div>
      )}
      {adding.kind === 'adding' && (
        <p className="my-0 type-caption text-muted">{profilePageWords.adding}</p>
      )}
      {adding.kind === 'failed' && <p className="my-0 type-caption">{adding.why}</p>}
    </Card>
  );
}
