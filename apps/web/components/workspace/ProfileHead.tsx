// The top of the lobby's first band, as a section of the landing opens: an eyebrow in mono saying what's true
// of the account (the chain it's on, and where its profile is: in Petals, on NEAR Social, or none), then the
// person's own name in the title's size, larger than anything else on the page; a long key or address shows
// its ends, whole in its title. Their picture, round and large (ui/Avatar), or the empty place for one, beside it.
// Props only: viewmodels/useProfile.ts reads it. Words from lib/lobby-view.ts.
import { shortId } from '../../lib/flower-view.ts';
import {
  busyPhase,
  editorWords,
  type ProfileEditorView,
  profileWords,
  type SocialState,
} from '../../lib/lobby-view.ts';
import { PROFILE_LIMITS } from '../../lib/near-social.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { ChooseFile } from '../ui/ChooseFile.tsx';
import { InlineText } from '../ui/InlineText.tsx';
import { Mono } from '../ui/Mono.tsx';

export function ProfileHead({
  account,
  social,
  chain,
  editor = null,
}: {
  /** The wallet this session signed in with; null until the server says. */
  account: string | null;
  social: SocialState;
  /** The chain that wallet is on, by name; null until the server says. */
  chain: string | null;
  /** Editing in place: the picture pressed to choose another, the name typed where it reads. */
  editor?: ProfileEditorView | null;
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
    // on a phone the picture sits above, so the name keeps the width
    <header className="flex flex-col items-start gap-block-gap sm:flex-row sm:items-center">
      {editor ? (
        <ChooseFile
          label={editorWords.choose}
          accept="image/png,image/jpeg,image/webp,image/gif"
          disabled={busyPhase(editor.phase)}
          onFile={editor.choosePicture}
        >
          <Avatar src={editor.picture} size="large" />
        </ChooseFile>
      ) : (
        <Avatar src={profile?.avatar ?? null} size="large" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-space-8">
        {eyebrow && <p className="my-0 type-mono whitespace-nowrap">{eyebrow.toUpperCase()}</p>}
        {editor && account ? (
          <InlineText
            label={editorWords.name}
            size="title"
            value={editor.draft.name}
            onChange={editor.setName}
            placeholder={shortId(account)}
            maxLength={PROFILE_LIMITS.name}
            disabled={busyPhase(editor.phase)}
          />
        ) : (
          account && (
            <h1
              title={account}
              className={`m-0 type-title md:type-display-compact ${profile?.name ? 'wrap-anywhere' : 'whitespace-nowrap'}`}
            >
              {profile?.name ?? shortId(account)}
            </h1>
          )
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
