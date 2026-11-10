// The profile's editor (Elco, 10 Nov: people create and edit their profile inside Petals, in NEAR Social's
// shape, "and have a publish button"; the Figma frame "Lobby · editing the public profile", approved): the
// picture, the name, the bio and the links on the left; on the right a preview, whose profile it is, and
// the plain lines that Save keeps it in Petals and that publishing puts it on NEAR Social, where earlier
// versions stay public. Then Save, the one main action, Cancel, and Publish as its own button, off until
// it's set up on mainnet, with the line beside it saying so. The Profile card opens into this.
// Props only: viewmodels/useProfileEditor.ts holds it. Words from lib/lobby-view.ts, drafts.
import {
  busyPhase,
  type EditPhase,
  editorWords,
  type ProfileEditorView,
  profileWords,
} from '../../lib/lobby-view.ts';
import { PROFILE_LIMITS } from '../../lib/near-social.ts';
import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { ChooseFile } from '../ui/ChooseFile.tsx';
import { Field } from '../ui/Field.tsx';
import { Mono } from '../ui/Mono.tsx';

/** Publish's words while it works, step by step. */
const PUBLISHING: Partial<Record<EditPhase, string>> = {
  picturing: editorWords.picturing,
  storing: editorWords.storing,
  signing: editorWords.signing,
  checking: editorWords.checking,
};

export function ProfileEditor({ view }: { view: ProfileEditorView }) {
  const busy = busyPhase(view.phase);
  const { draft } = view;
  const links = draft.links.filter((l) => l.service.trim() && l.value.trim());
  return (
    <Card title={view.creating ? editorWords.create : editorWords.edit} labelledBy="lobby-editor">
      <div className="grid grid-cols-1 gap-space-32 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-block-gap lg:col-span-2">
          <div className="flex flex-col gap-space-8">
            <span className="type-label">{editorWords.picture}</span>
            <div className="flex items-center gap-space-16">
              <Picture src={view.picture} size="72" />
              <div className="flex flex-col items-start gap-space-8">
                <ChooseFile
                  label={editorWords.choose}
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={busy}
                  onFile={view.choosePicture}
                />
                <span className="type-caption text-muted">{editorWords.pictureNote}</span>
              </div>
            </div>
          </div>
          <Field
            id="profile-name"
            label={editorWords.name}
            value={draft.name}
            onChange={view.setName}
            maxLength={PROFILE_LIMITS.name}
            disabled={busy}
          />
          <Field
            id="profile-about"
            label={editorWords.about}
            value={draft.about}
            onChange={view.setAbout}
            lines="several"
            maxLength={PROFILE_LIMITS.about}
            disabled={busy}
          />
          <div className="flex flex-col gap-space-8">
            <span className="type-label">{editorWords.links}</span>
            {draft.links.map((l, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a row is its place in the list while it's edited
              <div key={i} className="flex items-center gap-text-gap">
                <div className="w-1/4 shrink-0">
                  <Field
                    id={`profile-link-service-${i}`}
                    label={editorWords.service}
                    hideLabel
                    value={l.service}
                    onChange={(v) => view.setLink(i, 'service', v)}
                    disabled={busy}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <Field
                    id={`profile-link-value-${i}`}
                    label={editorWords.handle}
                    hideLabel
                    value={l.value}
                    onChange={(v) => view.setLink(i, 'value', v)}
                    maxLength={PROFILE_LIMITS.link}
                    disabled={busy}
                  />
                </div>
                <Button variant="quiet" disabled={busy} onClick={() => view.removeLink(i)}>
                  {editorWords.remove}
                </Button>
              </div>
            ))}
            <div>
              <Button variant="quiet" disabled={busy} onClick={view.addLink}>
                {editorWords.addLink}
              </Button>
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-space-16">
          <span className="type-caption text-muted">{editorWords.preview}</span>
          <div className="flex flex-col gap-text-gap border border-hairline p-space-16">
            <div className="flex items-center gap-text-gap">
              <Picture src={view.picture} size="48" />
              <div className="flex min-w-0 flex-col">
                <span className="type-label wrap-anywhere">
                  {draft.name.trim() || view.account.shown}
                </span>
                <span title={view.account.full}>
                  <Mono as="span" tone="muted">
                    {view.account.shown}
                  </Mono>
                </span>
              </div>
            </div>
            {draft.about.trim() && (
              <p className="my-0 type-caption whitespace-pre-wrap wrap-anywhere">
                {draft.about.trim()}
              </p>
            )}
            {links.length > 0 && (
              <p className="my-0 type-caption text-muted wrap-anywhere">
                {links.map((l) => `${l.service.trim()} ${l.value.trim()}`).join('   ·   ')}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-space-8 border border-hairline p-space-16">
            <div className="flex flex-wrap items-center gap-space-8">
              <span className="type-caption text-muted">{editorWords.keptAs}</span>
              <span title={view.account.full}>
                <Mono as="span">{view.account.shown}</Mono>
              </span>
              <Badge>{profileWords.chain}</Badge>
            </div>
            <p className="my-0 type-caption">{editorWords.keptNote}</p>
            <p className="my-0 type-caption text-muted">{editorWords.publicNote}</p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-block-gap">
        <Button variant="primary" disabled={busy} onClick={view.save}>
          {view.phase === 'saving' ? editorWords.saving : editorWords.save}
        </Button>
        <Button variant="quiet" disabled={busy} onClick={view.cancel}>
          {editorWords.cancel}
        </Button>
        <span className="flex flex-wrap items-center gap-text-gap">
          <Button variant="secondary" disabled={busy || !view.publish} onClick={view.publish}>
            {PUBLISHING[view.phase] ?? editorWords.publish}
          </Button>
          {!view.publish && (
            <span className="type-caption text-muted">{editorWords.publishLater}</span>
          )}
        </span>
        {view.phase === 'failed' && (
          <span className="flex items-center gap-space-8">
            <Badge>{editorWords.notSaved}</Badge>
            {view.problem && <span className="type-caption">{view.problem}</span>}
          </span>
        )}
      </div>
    </Card>
  );
}

function Picture({ src, size }: { src: string | null; size: '48' | '72' }) {
  const box = size === '72' ? 'size-drawing-72' : 'size-drawing-48';
  return src ? (
    // biome-ignore lint/performance/noImgElement: the person's own picture, from NEAR Social or just chosen
    <img className={`block ${box} shrink-0 border border-hairline object-cover`} src={src} alt="" />
  ) : (
    <span
      aria-hidden="true"
      className={`block ${box} shrink-0 border border-dashed border-hairline`}
    />
  );
}
