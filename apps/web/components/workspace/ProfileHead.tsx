// The top of the lobby: the person (Elco, 10 Nov: the person's own name above and larger than anything
// else; the redo's frame, "Build it"). Their picture from NEAR Social, or the empty place for one; their
// name there, or the wallet they signed in with, in the page's title size; the account under a name; and
// badges for what's true of it: the chain it's on, and whether it has a public profile. The way out is the
// side panel's Profile section, the one place to sign out (LOBBY, PANEL, 10 Nov).
// Props only: viewmodels/useProfile.ts reads it. Words from lib/lobby-view.ts, drafts.
import { profileWords, type SocialState, shownAccount } from '../../lib/lobby-view.ts';
import { Badge } from '../ui/Badge.tsx';
import { Mono } from '../ui/Mono.tsx';

export function ProfileHead({
  account,
  social,
}: {
  /** The wallet this session signed in with; null until the server says. */
  account: string | null;
  social: SocialState;
}) {
  const who = account ? shownAccount(account) : null;
  const profile = social.kind === 'profile' ? social.profile : null;
  return (
    <header className="flex items-center gap-block-gap">
      {profile?.avatar ? (
        // biome-ignore lint/performance/noImgElement: a picture the account chose, from NEAR Social's storage
        <img
          className="block size-drawing-72 shrink-0 border border-hairline object-cover"
          src={profile.avatar}
          alt=""
        />
      ) : (
        <span
          aria-hidden="true"
          className="block size-drawing-72 shrink-0 border border-dashed border-hairline"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-space-8">
        {who && (
          <h1 title={who.full} className="m-0 type-title wrap-anywhere">
            {profile?.name ?? who.shown}
          </h1>
        )}
        <div className="flex flex-wrap items-center gap-text-gap">
          {profile?.name && who && (
            <span title={who.full} className="min-w-0">
              <Mono as="span" tone="muted">
                {who.shown}
              </Mono>
            </span>
          )}
          {who && <Badge>{profileWords.chain}</Badge>}
          {social.kind === 'profile' && <Badge>{profileWords.social}</Badge>}
          {social.kind === 'none' && <Badge>{profileWords.noSocial}</Badge>}
        </div>
      </div>
    </header>
  );
}
