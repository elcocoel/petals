// The top of the lobby's first band, as a section of the landing opens: an eyebrow in mono saying what's true
// of the account (the chain it's on, and where its profile is: in Petals, on NEAR Social, or none), then the
// person's own name in the title's size, larger than anything else on the page; a long key or address shows
// its ends, whole in its title. Their picture from NEAR Social, or the empty place for one, beside it.
// Props only: viewmodels/useProfile.ts reads it. Words from lib/lobby-view.ts.
import { shortId } from '../../lib/flower-view.ts';
import { profileWords, type SocialState } from '../../lib/lobby-view.ts';
import { Mono } from '../ui/Mono.tsx';

export function ProfileHead({
  account,
  social,
  chain,
}: {
  /** The wallet this session signed in with; null until the server says. */
  account: string | null;
  social: SocialState;
  /** The chain that wallet is on, by name; null until the server says. */
  chain: string | null;
}) {
  const profile = social.kind === 'profile' ? social.profile : null;
  const where =
    social.kind === 'profile'
      ? social.source === 'petals'
        ? profileWords.inPetals
        : profileWords.social
      : social.kind === 'none'
        ? profileWords.noProfile
        : null;
  const eyebrow = [chain, where].filter(Boolean).join('  ·  ');
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
        {eyebrow && <Mono tone="primary">{eyebrow.toUpperCase()}</Mono>}
        {account && (
          <h1 title={account} className="m-0 type-title wrap-anywhere md:type-display-compact">
            {profile?.name ?? shortId(account)}
          </h1>
        )}
        {profile?.name && account && (
          <span title={account} className="min-w-0">
            <Mono as="span" tone="muted">
              {shortId(account)}
            </Mono>
          </span>
        )}
      </div>
    </header>
  );
}
