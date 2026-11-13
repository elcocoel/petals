// One press over many maps (lib/press-all.ts): read, while the Mapping box has no single map in front, which maps
// the person has something on (GET /api/v1/publish/data?maps=all, nothing kept); on the press, prepare every
// map's version and the one text (its nonce lasts minutes, so only then), have the wallet sign it once, and send
// the proof. NEAR signs in NEAR's own picker, a phone's row included. `landed` reads the Power Map again.
import { useCallback, useEffect, useState } from 'react';
import {
  type PressAll,
  preparePress,
  publishPress,
  readPressAll,
  readWallets,
} from '../lib/agent-client.ts';
import { pressAllView, pressAllWords } from '../lib/press-all.ts';
import type { ProvenWallet } from '../lib/profile-view.ts';
import { signPublication } from '../lib/publication-sign.ts';
import { type PublishPhase, publishWords, signerOf } from '../lib/publish-press.ts';

export function usePressAll(active: boolean, landed: () => void) {
  const [read, setRead] = useState<PressAll | null>(null);
  const [wallets, setWallets] = useState<ProvenWallet[]>([]);
  const [phase, setPhase] = useState<PublishPhase>('ready');
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    let gone = false;
    setPhase('ready');
    setSaid(null);
    void Promise.all([readPressAll(), readWallets()])
      .then(([got, mine]) => {
        if (gone) return;
        setRead(got);
        setWallets(mine ?? []);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [active]);
  const signer = signerOf(wallets);
  const publish = useCallback(async () => {
    if (!signer || !read?.maps.length) return;
    setPhase('signing');
    try {
      const p = await preparePress({ maps: 'all', author: signer.author });
      const proof = await signPublication(signer.wallet, {
        publication: p.manifest,
        sha256: p.sha256,
        text: p.text,
        ...(p.recipient ? { recipient: p.recipient } : {}),
        ...(p.nonce ? { nonce: p.nonce } : {}),
      });
      const out = await publishPress(p.sha256, proof);
      if ('refused' in out) {
        setSaid(out.refused === 401 ? publishWords.otherWallet : publishWords.failed);
        setPhase('failed');
        return;
      }
      setSaid(pressAllWords.published(out.publications.length));
      setPhase('published');
      landed();
    } catch {
      setSaid(publishWords.failed);
      setPhase('failed');
    }
  }, [signer, read, landed]);
  return { view: active ? pressAllView(read, phase, said) : null, publish };
}
