// The lobby's profile part (Elco, 9 and 10 Nov). The page's top is the person: their name on NEAR Social, or
// the wallet they signed in with, in the page's title size, with their picture and the way out (Elco, 10 Nov:
// the person's own name above and larger than "Profile"). Under it the Profile section: their bio and links
// from NEAR Social, or a line saying there's none or that NEAR Social didn't answer. NEAR Social's words are
// the account's own, shown as plain text; the links are what it declares, never followed, checked or
// trusted. What the person holds comes last, as `children`.
// Props only: viewmodels/useProfile.ts reads it. Words from lib/lobby-view.ts, drafts.
import type { ReactNode } from 'react';
import {
  NEAR_SOCIAL_SITE,
  profileWords,
  type SocialState,
  shownAccount,
} from '../../lib/lobby-view.ts';
import { Button } from '../ui/Button.tsx';
import { Mono } from '../ui/Mono.tsx';
import { TextLink } from '../ui/TextLink.tsx';

export function Profile({
  account,
  social,
  disconnectLabel,
  onDisconnect,
  children,
}: {
  /** The wallet this session signed in with; null until the server says. */
  account: string | null;
  social: SocialState;
  disconnectLabel: string;
  onDisconnect: () => void;
  /** What else belongs to the profile part: what the person holds. */
  children?: ReactNode;
}) {
  const who = account ? shownAccount(account) : null;
  const profile = social.kind === 'profile' ? social.profile : null;
  return (
    <>
      <header className="flex items-start justify-between gap-text-gap px-column-gap pt-column-gap">
        <div className="flex min-w-0 items-center gap-text-gap">
          {profile?.avatar && (
            // biome-ignore lint/performance/noImgElement: a picture the account chose, from NEAR Social's storage
            <img
              className="block size-drawing-48 shrink-0 border border-hairline object-cover"
              src={profile.avatar}
              alt=""
            />
          )}
          {who && (
            <div className="flex min-w-0 flex-col gap-space-4">
              <h1 title={who.full} className="m-0 type-title wrap-anywhere">
                {profile?.name ?? who.shown}
              </h1>
              {profile?.name && (
                <span title={who.full} className="min-w-0">
                  <Mono as="span" tone="muted">
                    {who.shown}
                  </Mono>
                </span>
              )}
            </div>
          )}
        </div>
        <Button variant="quiet" onClick={onDisconnect}>
          {disconnectLabel}
        </Button>
      </header>
      <section
        aria-labelledby="lobby-profile"
        className="flex flex-col gap-text-gap px-column-gap pt-column-gap"
      >
        <h2 id="lobby-profile" className="m-0 type-heading">
          {profileWords.title}
        </h2>
        {profile?.about && (
          <p className="my-0 type-caption whitespace-pre-wrap wrap-anywhere">{profile.about}</p>
        )}
        {profile && profile.links.length > 0 && (
          <div className="flex flex-col gap-space-4">
            <span className="type-caption text-muted">{profileWords.declared}</span>
            <ul className="m-0 flex list-none flex-wrap gap-x-space-16 gap-y-space-4 p-0">
              {profile.links.map((l) => (
                <li key={l.service} className="type-caption wrap-anywhere">
                  {profileWords.link(l.service, l.value)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {social.kind === 'none' && (
          <p className="my-0 flex flex-wrap items-baseline gap-x-space-8 type-caption text-muted">
            <span>{profileWords.none}</span>
            <TextLink variant="quiet" href={NEAR_SOCIAL_SITE} target="_blank" rel="noopener">
              {profileWords.open}
            </TextLink>
          </p>
        )}
        {social.kind === 'unread' && (
          <p className="my-0 type-caption text-muted">{profileWords.unread}</p>
        )}
        {children}
      </section>
    </>
  );
}
