// The profile part's public profile, from NEAR Social (Elco, 9 Nov): the account's picture, name and bio,
// and the links it declares there, labelled as declared. All of it is the account's own words, shown as
// plain text: the links aren't followed, checked or trusted. Props only: viewmodels/useSocialProfile.ts reads
// it. Words from lib/lobby-view.ts, drafts.
import { socialWords } from '../../lib/lobby-view.ts';
import type { SocialProfile as Profile } from '../../lib/near-social.ts';

export function SocialProfile({ profile }: { profile: Profile }) {
  return (
    <div className="flex items-start gap-text-gap px-block-gap pt-block-gap">
      {profile.avatar && (
        // biome-ignore lint/performance/noImgElement: a picture the account chose, from NEAR Social's storage
        <img
          className="block size-drawing-48 shrink-0 border border-hairline object-cover"
          src={profile.avatar}
          alt=""
        />
      )}
      <div className="flex min-w-0 flex-col gap-text-gap">
        {profile.name && <span className="type-label wrap-anywhere">{profile.name}</span>}
        {profile.about && (
          <p className="my-0 type-body whitespace-pre-wrap wrap-anywhere">{profile.about}</p>
        )}
        {profile.links.length > 0 && (
          <div className="flex flex-col gap-space-4">
            <span className="type-caption text-muted">{socialWords.declared}</span>
            <ul className="m-0 flex list-none flex-wrap gap-x-space-16 gap-y-space-4 p-0">
              {profile.links.map((l) => (
                <li key={l.service} className="type-caption wrap-anywhere">
                  {socialWords.link(l.service, l.value)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
