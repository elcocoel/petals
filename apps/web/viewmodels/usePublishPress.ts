// The publish press's state for one map (lib/publish-press.ts): what the person would publish there, and
// the one press. It prepares the publication in the name of the profile's NEAR wallet (nearSigner, as the press
// over many maps does), has that wallet sign its two lines, and sends the proof. When it lands, `joined` says
// which publication joined which map, so the map and Information read the map again and mark it.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type PublishableData,
  preparePublication,
  publishPublication,
  readPublishable,
  readSession,
} from '../lib/agent-client.ts';
import { casesLine, countsOf, type Joined, joinedOf } from '../lib/mapping.ts';
import { asksSignIn, signPublication } from '../lib/publication-sign.ts';
import {
  nearSigner,
  type PublishPhase,
  publishPressView,
  publishWords,
} from '../lib/publish-press.ts';

export function usePublishPress(map: string | null) {
  const [data, setData] = useState<PublishableData | null>(null);
  const [me, setMe] = useState<Awaited<ReturnType<typeof readSession>>>(null);
  const [phase, setPhase] = useState<PublishPhase>('ready');
  const [said, setSaid] = useState<string | null>(null);
  const [joined, setJoined] = useState<Joined | null>(null);
  /** the press asks the wallet to sign in first: said beforehand, since by phone it means a new QR */
  const [signsIn, setSignsIn] = useState(false);
  useEffect(() => {
    let gone = false;
    void readSession()
      .then((got) => {
        if (!gone) setMe(got);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, []);
  useEffect(() => {
    setData(null);
    setPhase('ready');
    setSaid(null);
    setJoined(null);
    if (!map) return;
    let gone = false;
    void readPublishable(map)
      .then((got) => {
        if (!gone) setData(got);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [map]);
  const signer = useMemo(() => (me ? nearSigner(me) : null), [me]);
  const pressable = Boolean(map && signer && data?.layers?.length);
  useEffect(() => {
    if (!(pressable && signer) || phase === 'signing') return;
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
    if (!map || !signer || !data?.layers?.length) return;
    const layers = data.layers;
    setPhase('signing');
    try {
      const p = await preparePublication({ map, author: signer.author });
      const proof = await signPublication(signer.wallet, p);
      const out = await publishPublication(p.sha256, proof);
      if ('refused' in out) {
        setSaid(out.refused === 401 ? publishWords.otherWallet : publishWords.failed);
        setPhase('failed');
        return;
      }
      setSaid(publishWords.published(casesLine(countsOf(out.totals))));
      setPhase('published');
      setJoined(joinedOf(map, signer.shown, layers, out, Date.now()));
    } catch {
      setSaid(publishWords.failed);
      setPhase('failed');
    }
  }, [map, signer, data]);
  return { data, view: publishPressView(data, phase, said, signer, signsIn), publish, joined };
}
