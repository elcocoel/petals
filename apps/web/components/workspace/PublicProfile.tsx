// A person's public profile, as anyone reads it (/u/<account>), in the lobby's own head: their picture, an
// eyebrow saying the chain and where the profile is (NEAR Social, or Petals), their name in the title's size,
// the bio in the lead's size and the links they declare, each with the badge that says only that. A profile
// from NEAR Social on another chain's page says it's the same person's. With none, it says so. Props only:
// the page reads GET /api/v1/profiles/:account. Words from lib/lobby-view.ts.
import { shortId } from '../../lib/flower-view.ts';
import {
  type PublicProfileAnswer,
  profileWords,
  publicProfileWords,
} from '../../lib/lobby-view.ts';
import { serviceName } from '../../lib/near-social.ts';
import { walletChain } from '../../lib/profile-view.ts';
import { Badge } from '../ui/Badge.tsx';
import { Mono } from '../ui/Mono.tsx';

export function PublicProfile({ answer }: { answer: PublicProfileAnswer }) {
  const { account, profile, source } = answer;
  const chain = walletChain(answer.chain === 'near' ? 'mainnet' : answer.chain);
  const where =
    source === 'near-social'
      ? publicProfileWords.onSocial
      : source === 'petals'
        ? publicProfileWords.onPetals
        : null;
  const eyebrow = [chain, where].filter(Boolean).join('  ·  ').toUpperCase();
  const links = Object.entries(profile?.links ?? {});
  return (
    <article className="flex max-w-content-width flex-col gap-space-32">
      <header className="flex items-center gap-block-gap">
        {profile?.avatar ? (
          // biome-ignore lint/performance/noImgElement: a picture the account chose, from its own storage
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
          <Mono tone="primary">{eyebrow}</Mono>
          <h1 title={account} className="m-0 type-title wrap-anywhere md:type-display-compact">
            {profile?.name ?? shortId(account)}
          </h1>
          {profile?.name && (
            <span title={account} className="min-w-0">
              <Mono as="span" tone="muted">
                {shortId(account)}
              </Mono>
            </span>
          )}
        </div>
      </header>
      {profile?.about && (
        <p className="my-0 type-lead whitespace-pre-wrap wrap-anywhere">{profile.about}</p>
      )}
      {links.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {links.map(([service, value]) => (
            <li
              key={service}
              className="flex items-center gap-text-gap border-t border-hairline py-text-gap last:border-b"
            >
              <span className="w-1/5 shrink-0 type-caption text-muted wrap-anywhere">
                {serviceName(service)}
              </span>
              <span className="min-w-0 flex-1 type-label wrap-anywhere">{value}</span>
              <Badge>{profileWords.declared}</Badge>
            </li>
          ))}
        </ul>
      )}
      {source === 'near-social' && answer.chain !== 'near' && (
        <p className="my-0 type-caption text-muted">{publicProfileWords.linked}</p>
      )}
      {!profile && <p className="my-0 type-lead text-muted">{publicProfileWords.none}</p>}
    </article>
  );
}
