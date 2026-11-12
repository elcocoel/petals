// The publish press's state for one map (lib/publish-press.ts): what can go, and the one press that signs
// and publishes it. The wallet is asked once, on the network sign-in uses.
import { useCallback, useEffect, useState } from 'react';
import {
  type PublishableData,
  preparePublishable,
  publishPublishable,
  readPublishable,
} from '../lib/agent-client.ts';
import type { Prepared } from '../lib/publish.ts';
import { proofFrom } from '../lib/publish.ts';
import { type PublishPhase, publishPressView, publishWords } from '../lib/publish-press.ts';
import { SIGN_IN_NETWORK, signPrepared } from '../lib/wallet.ts';

export function usePublishPress(map: string | null) {
  const [data, setData] = useState<PublishableData | null>(null);
  const [phase, setPhase] = useState<PublishPhase>('ready');
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => {
    setData(null);
    setPhase('ready');
    setSaid(null);
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
  const publish = useCallback(async () => {
    if (!map) return;
    setPhase('signing');
    try {
      const p = await preparePublishable(map);
      const prepared: Prepared = {
        entry_sha256: p.sha256,
        nonce: p.nonce,
        recipient: p.recipient,
        message: p.message,
        expires_at: p.expires_at,
      };
      const signed = await signPrepared(prepared, SIGN_IN_NETWORK);
      const out = await publishPublishable(p.sha256, proofFrom(signed, prepared));
      if ('refused' in out) {
        setSaid(out.refused === 401 ? publishWords.otherWallet : publishWords.failed);
        setPhase('failed');
        return;
      }
      setSaid(publishWords.published(out.published));
      setPhase('published');
    } catch {
      setSaid(publishWords.failed);
      setPhase('failed');
    }
  }, [map]);
  return { view: publishPressView(data, phase, said), publish };
}
