// The profile under the lobby's head (the profile kept in Petals), as a section's paragraph and its links: the
// profile Petals keeps, or the account's NEAR Social profile before it keeps one, with its bio in the lead's
// size and the links it declares, each with a badge that says only that, and a line saying where it is and who
// sees it; or, with none anywhere, what goes there. Then its one action, as the landing's: Create your profile,
// or Edit. Or that it's still being read, or that it couldn't be read. NEAR Social's words are the account's
// own, shown as plain text; the links are never followed, checked or trusted. Edit and Create show only when
// there's something to open them.
// Props only: viewmodels/useProfile.ts reads it. Words from lib/lobby-view.ts.
import {
  editorWords,
  profileWords,
  publicProfileWords,
  type SocialState,
} from '../../lib/lobby-view.ts';
import { serviceName } from '../../lib/near-social.ts';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
import { TextLink } from '../ui/TextLink.tsx';

export function Profile({
  social,
  onEdit,
  saved,
  published,
  publicHref,
}: {
  social: SocialState;
  /** Where anyone reads this profile: the person's public page. */
  publicHref?: string;
  /** Opens the editor: Edit with a profile, Create without one. */
  onEdit?: () => void;
  /** The person just saved a change into Petals. */
  saved?: boolean;
  /** The person just published it and NEAR Social took it. */
  published?: boolean;
}) {
  const profile = social.kind === 'profile' ? social.profile : null;
  return (
    <div className="flex flex-col gap-block-gap">
      {profile?.about && (
        <p className="my-0 max-w-content-width type-lead whitespace-pre-wrap wrap-anywhere">
          {profile.about}
        </p>
      )}
      {social.kind === 'none' && (
        <p className="my-0 max-w-content-width type-lead">{profileWords.none}</p>
      )}
      {profile && profile.links.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {profile.links.map((l) => (
            <li
              key={l.service}
              className="flex items-center gap-text-gap border-t border-hairline py-text-gap last:border-b"
            >
              <span className="w-1/5 shrink-0 type-caption text-muted wrap-anywhere">
                {serviceName(l.service)}
              </span>
              <span className="min-w-0 flex-1 type-label wrap-anywhere">{l.value}</span>
              <Badge>{profileWords.declared}</Badge>
            </li>
          ))}
        </ul>
      )}
      {social.kind === 'profile' && (
        <p className="my-0 max-w-content-width type-caption text-muted">
          {social.source === 'petals' ? profileWords.notePetals : profileWords.noteSocial}
        </p>
      )}
      {saved && (
        <p className="my-0 flex flex-wrap items-center gap-space-8">
          <Badge tone="accent">{editorWords.saved}</Badge>
          <span className="type-caption">{editorWords.savedLine}</span>
        </p>
      )}
      {published && (
        <p className="my-0 flex flex-wrap items-center gap-space-8">
          <Badge tone="accent">{editorWords.published}</Badge>
          <span className="type-caption">{editorWords.publishedLine}</span>
        </p>
      )}
      {social.kind === 'reading' && (
        <p className="my-0 type-caption text-muted">{profileWords.reading}</p>
      )}
      {social.kind === 'unread' && (
        <p className="my-0 type-caption text-muted">{profileWords.unread}</p>
      )}
      {onEdit && (social.kind === 'profile' || social.kind === 'none') && (
        <ActionRow>
          {publicHref && social.kind === 'profile' && (
            <TextLink href={publicHref} arrow>
              {publicProfileWords.see}
            </TextLink>
          )}
          {profile ? (
            <Button variant="secondary" onClick={onEdit}>
              {editorWords.edit}
            </Button>
          ) : (
            <Button variant="primary" arrow onClick={onEdit}>
              {profileWords.create}
            </Button>
          )}
        </ActionRow>
      )}
    </div>
  );
}
