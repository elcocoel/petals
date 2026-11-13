// The profile's editor (Elco, 10 Nov: people create and edit their profile inside Petals; "hold the same
// data shape as near.social in our DB ... and have a publish button"). Save keeps the whole profile in
// Petals (PUT /api/v1/me/profile), the picture as a data: URI the server stores; it costs nothing. The first
// time, the editor starts from the account's NEAR Social profile when there is one.
// Publish, off until it's set up on mainnet (PUBLISH_TO_NEAR_SOCIAL), puts it on NEAR Social, in order:
//   1. The wallet that's connected must be the account the lobby shows, or nothing is sent.
//   2. A new picture, made square and small in the browser, goes first: one `__fastdata_fastfs` call to
//      `social` that the wallet approves, then NEAR Social's indexer confirms it and FastFS serves it.
//   3. The fields go in one `__fastdata_kv` call to `social` that the wallet approves, and the indexer
//      confirms each key.
//   4. The profile is read again, and the card says it's saved.
// `social` has no contract, so every receipt fails with CodeDoesNotExist, as expected: confirmation comes
// from the indexer (GET /v1/tx/{hash}), never from the receipt. The waits ask a few times, a moment apart,
// and only after the person pressed Publish. lib/near-social.ts holds the data and lib/lobby-view.ts the words.
import { useCallback, useState } from 'react';
import { readKeptPicture, saveMyProfile } from '../lib/agent-client.ts';
import type { EditPhase, ProfileEditorView, SocialState } from '../lib/lobby-view.ts';
import { editorWords, PUBLISH_TO_NEAR_SOCIAL, shownAccount } from '../lib/lobby-view.ts';
import {
  dataUri,
  draftOf,
  FASTFS_METHOD,
  fastfsPath,
  fastfsSimple,
  fastfsUri,
  fastfsUrl,
  isPetalsMedia,
  KV_METHOD,
  keptAvatar,
  type PetalsProfile,
  type ProfileDraft,
  profileArgs,
  toPetals,
} from '../lib/near-social.ts';
import { connectWallet } from '../lib/wallet.ts';
import { accepted, confirmed, message, Stop, send, served } from './socialWrite.ts';

/** A profile picture's longest side, in pixels: well under FastFS's 1 MiB for one call. */
const PICTURE_SIDE = 512;

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The chosen picture, cropped to its centre square and drawn at PICTURE_SIDE, as WebP where it can be. */
async function squarePicture(
  file: File,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; mime: string }> {
  const image = await createImageBitmap(file);
  const side = Math.min(image.width, image.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(PICTURE_SIDE, side);
  canvas.height = canvas.width;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('No canvas here.');
  g.drawImage(
    image,
    (image.width - side) / 2,
    (image.height - side) / 2,
    side,
    side,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/webp', 0.9));
  if (!blob) throw new Error('The picture could not be made.');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type || 'image/png' };
}

export function useProfileEditor(
  account: string | null,
  social: SocialState,
  /** Petals' own copy as it's kept; null before it keeps one. */
  kept: PetalsProfile | null,
  reload: () => Promise<void>,
): {
  open: (() => void) | undefined;
  view: ProfileEditorView | null;
  saved: boolean;
  published: boolean;
} {
  const profile = social.kind === 'profile' ? social.profile : null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(draftOf(null));
  const [picture, setPicture] = useState<{
    src: string | null;
    bytes?: Uint8Array<ArrayBuffer>;
    mime?: string;
  }>({ src: null });
  const [phase, setPhase] = useState<EditPhase>('editing');
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [published, setPublished] = useState(false);

  const open = useCallback(() => {
    setDraft(draftOf(profile));
    setPicture({ src: profile?.avatar ?? null });
    setPhase('editing');
    setProblem(null);
    setSaved(false);
    setPublished(false);
    setEditing(true);
  }, [profile]);

  const save = useCallback(async () => {
    setProblem(null);
    setPhase('saving');
    try {
      const avatar =
        picture.bytes && picture.mime
          ? dataUri(picture.mime, picture.bytes)
          : (kept?.avatar ?? keptAvatar(picture.src));
      await saveMyProfile(toPetals(draft, avatar, kept));
      await reload();
      setEditing(false);
      setSaved(true);
      setPublished(false);
      setPhase('editing');
    } catch (e) {
      setProblem(editorWords.notKept(message(e)));
      setPhase('failed');
    }
  }, [picture, kept, draft, reload]);

  const publish = useCallback(async () => {
    if (!account) return;
    setProblem(null);
    try {
      const wallet = await connectWallet('mainnet').catch(() => {
        throw new Stop(editorWords.refused);
      });
      if (wallet !== account) throw new Stop(editorWords.otherWallet(wallet, account));
      // the picture to store: a new one, or the one Petals keeps at its own address (a fastfs:// one is
      // on NEAR Social already, so it stays as it is)
      let bytes = picture.bytes;
      let mime = picture.mime;
      if (!bytes && picture.src && isPetalsMedia(picture.src)) {
        const stored = await readKeptPicture(picture.src).catch((e) => {
          throw new Stop(editorWords.notKept(message(e)));
        });
        bytes = stored.bytes;
        mime = stored.mime;
      }
      let avatar: string | null = null;
      if (bytes && mime) {
        setPhase('picturing');
        const path = fastfsPath(await sha256Hex(bytes), mime);
        const hash = await send(FASTFS_METHOD, fastfsSimple(path, mime, bytes));
        setPhase('storing');
        accepted(await confirmed(hash));
        if (!(await served(fastfsUrl(account, path)))) throw new Stop(editorWords.slow);
        avatar = fastfsUri(account, path);
      }
      setPhase('signing');
      const hash = await send(KV_METHOD, profileArgs(profile, draft, avatar));
      setPhase('checking');
      accepted(await confirmed(hash));
      // Petals keeps what was published, the picture at its fastfs:// address, so the two say the same
      await saveMyProfile(toPetals(draft, avatar ?? kept?.avatar ?? keptAvatar(picture.src), kept));
      await reload();
      setEditing(false);
      setSaved(false);
      setPublished(true);
      setPhase('editing');
    } catch (e) {
      setProblem(e instanceof Stop ? e.message : editorWords.refused);
      setPhase('failed');
    }
  }, [account, picture, profile, draft, kept, reload]);

  const view: ProfileEditorView | null =
    editing && account
      ? {
          creating: !profile,
          account: shownAccount(account),
          draft,
          picture: picture.src,
          phase,
          problem,
          setName: (v) => setDraft((d) => ({ ...d, name: v })),
          setAbout: (v) => setDraft((d) => ({ ...d, about: v })),
          setLink: (i, part, v) =>
            setDraft((d) => ({
              ...d,
              links: d.links.map((l, j) => (j === i ? { ...l, [part]: v } : l)),
            })),
          addLink: () =>
            setDraft((d) => ({ ...d, links: [...d.links, { service: '', value: '' }] })),
          removeLink: (i) => setDraft((d) => ({ ...d, links: d.links.filter((_, j) => j !== i) })),
          choosePicture: (file) => {
            void squarePicture(file).then(
              ({ bytes, mime }) =>
                setPicture({
                  src: URL.createObjectURL(new Blob([bytes], { type: mime })),
                  bytes,
                  mime,
                }),
              (e) => setProblem(message(e)),
            );
          },
          save: () => void save(),
          ...(PUBLISH_TO_NEAR_SOCIAL ? { publish: () => void publish() } : {}),
          cancel: () => setEditing(false),
        }
      : null;

  // Opening needs an account whose profile has been read: a profile, or none there yet.
  const canOpen = account && (social.kind === 'profile' || social.kind === 'none');
  return { open: canOpen ? open : undefined, view, saved, published };
}
