// The profile under the lobby's head, as a section's paragraph and its links: the bio in the lead's size and the
// links it declares, each with a badge that says only that; or, with none anywhere, what goes there. Editing, the
// same card in place: the bio typed where it reads, each link's service and address in its row, a link added or
// removed, then Save, which puts it on NEAR Social, and Cancel. NEAR Social's words are the account's own,
// shown as plain text; the links are never followed, checked or trusted.
// Props only: viewmodels/useProfile.ts and useProfileEditor.ts hold it. Words from lib/lobby-view.ts.
import {
  busyPhase,
  type EditPhase,
  editorWords,
  type ProfileEditorView,
  profileWords,
  publicProfileWords,
  type SocialState,
} from '../../lib/lobby-view.ts';
import { PROFILE_LIMITS, SERVICES, serviceName } from '../../lib/near-social.ts';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
import { Field } from '../ui/Field.tsx';
import { IconButton } from '../ui/IconButton.tsx';
import { InlineText } from '../ui/InlineText.tsx';
import { TextLink } from '../ui/TextLink.tsx';
import { DeclaredLink } from './DeclaredLink.tsx';

export function Profile({
  social,
  onEdit,
  saved,
  published,
  publicHref,
  editor = null,
}: {
  social: SocialState;
  /** Editing in place: the same card, typed into. */
  editor?: ProfileEditorView | null;
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
  if (editor) return <Editing view={editor} />;
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
              <DeclaredLink service={l.service} value={l.value} />
              <Badge>{profileWords.declared}</Badge>
            </li>
          ))}
        </ul>
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
          {!profile && (
            <Button variant="primary" arrow onClick={onEdit}>
              {profileWords.create}
            </Button>
          )}
        </ActionRow>
      )}
    </div>
  );
}

/** Save's words while it works, step by step. */
const PUBLISHING: Partial<Record<EditPhase, string>> = {
  saving: editorWords.saving,
  picturing: editorWords.picturing,
  storing: editorWords.storing,
  signing: editorWords.signing,
  checking: editorWords.checking,
};

/** The services a link can be picked from: NEAR Social's, and the one it has when it's another. */
const servicesFor = (current: string) => [
  ...SERVICES.map((s) => ({ value: s.key, label: s.name })),
  ...(current && !SERVICES.some((s) => s.key === current)
    ? [{ value: current, label: current }]
    : []),
];

/** The card's body, edited where it reads: the bio, the links' rows, then Save and Cancel. */
function Editing({ view }: { view: ProfileEditorView }) {
  const busy = busyPhase(view.phase);
  return (
    <div className="flex flex-col gap-block-gap">
      <div className="max-w-content-width">
        <InlineText
          label={editorWords.about}
          size="lead"
          multiline
          value={view.draft.about}
          onChange={view.setAbout}
          placeholder={editorWords.about}
          maxLength={PROFILE_LIMITS.about}
          disabled={busy}
        />
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {view.draft.links.map((l, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: a row is its place in the list while it's edited
            key={i}
            className="flex items-center gap-text-gap border-t border-hairline py-text-gap last:border-b"
          >
            {/* a link's service reads as it does at rest; a new row picks one */}
            <span className="w-1/5 shrink-0 type-caption text-muted wrap-anywhere">
              {l.service ? (
                serviceName(l.service)
              ) : (
                <Field
                  id={`profile-link-service-${i}`}
                  label={editorWords.service}
                  hideLabel
                  value={l.service}
                  onChange={(v) => view.setLink(i, 'service', v)}
                  choices={[{ group: editorWords.service, choices: servicesFor(l.service) }]}
                  none={editorWords.pick}
                  disabled={busy}
                />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <InlineText
                label={editorWords.handle}
                size="label"
                value={l.value}
                onChange={(v) => view.setLink(i, 'value', v)}
                maxLength={PROFILE_LIMITS.link}
                disabled={busy}
              />
            </span>
            <IconButton
              icon="remove"
              label={editorWords.remove}
              onClick={() => view.removeLink(i)}
            />
          </li>
        ))}
      </ul>
      <ActionRow gap="tight">
        <Button variant="quiet" disabled={busy} onClick={view.addLink}>
          {editorWords.addLink}
        </Button>
      </ActionRow>
      <ActionRow>
        <Button variant="primary" disabled={busy} onClick={view.save}>
          {PUBLISHING[view.phase] ?? editorWords.save}
        </Button>
        <Button variant="quiet" disabled={busy} onClick={view.cancel}>
          {editorWords.cancel}
        </Button>
      </ActionRow>
      {view.phase === 'failed' && view.problem && <p className="my-0 type-body">{view.problem}</p>}
    </div>
  );
}
