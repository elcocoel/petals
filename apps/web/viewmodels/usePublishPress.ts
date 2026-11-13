// The publish press's state for one map (lib/publish-press.ts, wave 8): what the person would publish there, the
// wallet that signs (theirs to choose, the first by default), and the one press. It prepares the publication in
// that wallet's name, has the wallet sign its two lines, and sends the proof. When it lands, `joined` says which
// publication joined which map, so the map (LOOK) and Information (OVERLAYS) read the map again and mark it.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type PublicationVia,
  type PublishableData,
  preparePublication,
  publishPublication,
  readPublishable,
  readWallets,
} from '../lib/agent-client.ts';
import { casesLine, countsOf, type Joined, joinedOf } from '../lib/mapping.ts';
import type { ProvenWallet } from '../lib/profile-view.ts';
import { signPublication } from '../lib/publication-sign.ts';
import {
  type PublishPhase,
  publishPressView,
  publishWords,
  signersOf,
} from '../lib/publish-press.ts';

export function usePublishPress(map: string | null, via: PublicationVia | null) {
  const [data, setData] = useState<PublishableData | null>(null);
  const [wallets, setWallets] = useState<ProvenWallet[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [phase, setPhase] = useState<PublishPhase>('ready');
  const [said, setSaid] = useState<string | null>(null);
  const [joined, setJoined] = useState<Joined | null>(null);
  useEffect(() => {
    let gone = false;
    void readWallets()
      .then((got) => {
        if (!gone) setWallets(got ?? []);
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
  const signers = useMemo(() => signersOf(wallets), [wallets]);
  const signer = signers.find((s) => s.key === chosen) ?? signers[0] ?? null;
  const publish = useCallback(async () => {
    const wallet = wallets.find((w) => `${w.network}:${w.account_id}` === signer?.key);
    if (!map || !signer || !wallet || !data?.layers?.length) return;
    const layers = data.layers;
    setPhase('signing');
    try {
      const p = await preparePublication({ map, author: signer.author, via });
      const proof = await signPublication(wallet, p);
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
  }, [map, signer, wallets, data, via]);
  return {
    data,
    view: publishPressView(data, phase, said, { signers, chosen: signer?.key ?? null, via }),
    publish,
    choose: setChosen,
    joined,
  };
}
