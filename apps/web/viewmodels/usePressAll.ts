// One press over many maps (lib/press-all.ts): read, while the Mapping box has no single map in front, which maps
// the person has something on (GET /api/v1/publish/data?maps=all, nothing kept); on the press, prepare every
// map's version and the one text (its nonce lasts minutes, so only then), have the wallet sign it once, and send
// the proof. The author is the profile's NEAR wallet (nearSigner), named the same in the read and the prepare; it
// signs in NEAR's own picker, a phone's row included. `landed` reads the Power Map again.
import { useCallback, useEffect, useState } from 'react';
import {
  type PressAll,
  preparePress,
  publishPress,
  readMyCredit,
  readPressAll,
  readSession,
} from '../lib/agent-client.ts';
import { inYourName, type PressAllRead, pressAllView, pressAllWords } from '../lib/press-all.ts';
import { asksSignIn, signPublication } from '../lib/publication-sign.ts';
import {
  nearSigner,
  type PublishPhase,
  pressRuns,
  publishWords,
  type Signer,
} from '../lib/publish-press.ts';

export function usePressAll(active: boolean, landed: () => void) {
  const [read, setRead] = useState<PressAll | null>(null);
  /** the author: the profile's NEAR wallet, the one the read and the prepare both name */
  const [signer, setSigner] = useState<Signer | null>(null);
  const [phase, setPhase] = useState<PublishPhase>('ready');
  const [said, setSaid] = useState<string | null>(null);
  /** the press asks the wallet to sign in first: said beforehand, since by phone it means a new QR */
  const [signsIn, setSignsIn] = useState(false);
  /** where the read is, so a slow one says so (it is the press's own dry run) */
  const [state, setState] = useState<PressAllRead>({ done: true });
  useEffect(() => {
    if (!active) return;
    let gone = false;
    setPhase('ready');
    setSaid(null);
    setState({ reading: true });
    void (async () => {
      const me = await readSession();
      const who = me ? nearSigner(me) : null;
      const got = who ? await readPressAll(who.author) : null;
      if (gone) return;
      setSigner(who);
      setRead(got);
      setState({ done: true });
    })().catch((e: unknown) => {
      if (!gone) setState({ unread: e instanceof Error ? e.message : String(e) });
    });
    return () => {
      gone = true;
    };
  }, [active]);
  const pressable = Boolean(active && signer && read?.maps.length);
  useEffect(() => {
    if (!(pressable && signer) || pressRuns(phase)) return;
    let gone = false;
    void asksSignIn(signer.wallet)
      .then((asks) => {
        if (!gone) setSignsIn(asks);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [pressable, signer, phase]);
  const publish = useCallback(async () => {
    if (!signer || !read?.maps.length) return;
    setPhase('preparing');
    try {
      const p = await preparePress({ maps: 'all', author: signer.author });
      // the wallet's request goes out now: only from here is it waited for
      setPhase('waiting');
      const proof = await signPublication(signer.wallet, {
        publication: p.manifest,
        sha256: p.sha256,
        text: p.text,
        ...(p.recipient ? { recipient: p.recipient } : {}),
        ...(p.nonce ? { nonce: p.nonce } : {}),
      });
      setPhase('sending');
      const out = await publishPress(p.sha256, proof);
      if ('refused' in out) {
        setSaid(out.refused === 401 ? publishWords.otherWallet : publishWords.failed);
        setPhase('failed');
        return;
      }
      // this press, then everything in their name now, from their credit (none read: this press alone)
      const credit = await readMyCredit().catch(() => null);
      setSaid(pressAllWords.published(out.publications.length, credit && inYourName(credit)));
      setPhase('published');
      landed();
    } catch {
      setSaid(publishWords.failed);
      setPhase('failed');
    }
  }, [signer, read, landed]);
  return { view: active ? pressAllView(read, phase, said, signsIn, state) : null, publish };
}
