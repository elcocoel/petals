// The Wallets card (#79, the profile page as the investigator's card): the wallets the person proved by
// signing in with them, each with its chain and when it signed, and the badge PROVEN, set against a link's
// DECLARED, so it reads what backs the person and what's only their word. Null while it's read; with no
// answer, it says so. Props only: viewmodels/useProfilePage.ts reads it. Words from lib/profile-view.ts, drafts.
import { profilePageWords, type WalletRow } from '../../lib/profile-view.ts';
import { Badge } from '../ui/Badge.tsx';
import { Card } from '../ui/Card.tsx';
import { Mono } from '../ui/Mono.tsx';

export function Wallets({ wallets }: { wallets: WalletRow[] | 'reading' | 'unread' }) {
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
    </Card>
  );
}
