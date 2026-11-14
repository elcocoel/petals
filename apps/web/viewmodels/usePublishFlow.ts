// The publish steps (T066): prepare_publish, sign in the wallet (NEP-413, one prompt), then
// publish_flower.
import { useState } from 'react';
import { preparePublish, publishEntry } from '../lib/agent-client.ts';
import {
  type EntryDraft,
  networkOf,
  type Prepared,
  type Published,
  proofFrom,
} from '../lib/publish.ts';
import { signPrepared } from '../lib/wallet.ts';

export type PublishStep = 'ready' | 'preparing' | 'signing' | 'publishing' | 'done' | 'failed';

export function usePublishFlow({
  draft,
  prepared: given,
}: {
  draft?: EntryDraft;
  prepared?: Prepared;
}) {
  const [step, setStep] = useState<PublishStep>('ready');
  const [prepared, setPrepared] = useState<Prepared | null>(given ?? null);
  const [published, setPublished] = useState<Published | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    setError(null);
    try {
      let p = prepared;
      if (draft) {
        setStep('preparing');
        p = await preparePublish(draft);
        setPrepared(p);
      }
      if (!p) throw new Error('Nothing to sign.');
      setStep('signing');
      const signed = await signPrepared(p, networkOf(p.recipient));
      setAccount(signed.accountId);
      setStep('publishing');
      setPublished(await publishEntry(p.entry_sha256, proofFrom(signed, p)));
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep('failed');
    }
  }

  const working = step === 'preparing' || step === 'signing' || step === 'publishing';
  return { step, prepared, published, account, error, working, publish };
}
