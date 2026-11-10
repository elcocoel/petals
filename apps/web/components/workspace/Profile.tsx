// The Profile card (Elco, 9 and 10 Nov; the redo's frame, "Build it"; the profile kept in Petals): the
// profile Petals keeps, or the account's NEAR Social profile before it keeps one, with its bio and the
// links it declares, each with a badge that says only that, and a line saying where it is and who sees
// it; or, with none anywhere, what goes there and the one thing to do; or that it's still being read, or
// that it couldn't be read. NEAR Social's words are the account's own, shown as plain text; the links are never
// followed, checked or trusted. Edit and Create show only when there's something to open them.
// Props only: viewmodels/useProfile.ts reads it. Words from lib/lobby-view.ts, drafts.
import { editorWords, profileWords, type SocialState } from '../../lib/lobby-view.ts';
import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';

export function Profile({
  social,
  onEdit,
  saved,
}: {
  social: SocialState;
  /** Opens the editor: Edit with a profile, Create without one. */
  onEdit?: () => void;
  /** The person just published a change and NEAR Social took it. */
  saved?: boolean;
}) {
  const profile = social.kind === 'profile' ? social.profile : null;
  return (
    <Card
      title={profileWords.title}
      labelledBy="lobby-profile"
      action={
        profile && onEdit ? (
          <Button variant="secondary" onClick={onEdit}>
            {profileWords.edit}
          </Button>
        ) : undefined
      }
    >
      {profile?.about && (
        <p className="my-0 type-body whitespace-pre-wrap wrap-anywhere">{profile.about}</p>
      )}
      {profile && profile.links.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {profile.links.map((l) => (
            <li
              key={l.service}
              className="flex items-center gap-text-gap border-t border-hairline py-text-gap"
            >
              <span className="w-1/5 shrink-0 type-caption text-muted wrap-anywhere">
                {l.service}
              </span>
              <span className="min-w-0 flex-1 type-label wrap-anywhere">{l.value}</span>
              <Badge>{profileWords.declared}</Badge>
            </li>
          ))}
        </ul>
      )}
      {social.kind === 'profile' && (
        <p className="my-0 type-caption text-muted">
          {social.source === 'petals' ? profileWords.notePetals : profileWords.noteSocial}
        </p>
      )}
      {saved && (
        <p className="my-0 flex flex-wrap items-center gap-space-8">
          <Badge tone="accent">{editorWords.saved}</Badge>
          <span className="type-caption">{editorWords.savedLine}</span>
        </p>
      )}
      {social.kind === 'none' && (
        <>
          <p className="my-0 type-body">{profileWords.none}</p>
          {onEdit && (
            <div>
              <Button variant="primary" onClick={onEdit}>
                {profileWords.create}
              </Button>
            </div>
          )}
        </>
      )}
      {social.kind === 'reading' && (
        <p className="my-0 type-caption text-muted">{profileWords.reading}</p>
      )}
      {social.kind === 'unread' && (
        <p className="my-0 type-caption text-muted">{profileWords.unread}</p>
      )}
    </Card>
  );
}
