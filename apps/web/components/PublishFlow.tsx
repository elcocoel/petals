'use client';
// The publish steps (T066): prepare_publish, sign in the wallet (NEP-413, one prompt), then
// publish_flower. Shows the key, the writer and the explorer link, and why the receipt "fails".
import { useState } from 'react';
import { type EntryDraft, type Prepared, type Published, proofFrom } from '../lib/publish.ts';
import { signPrepared } from '../lib/wallet.ts';

type Step = 'ready' | 'preparing' | 'signing' | 'publishing' | 'done' | 'failed';

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { code: string; message: string; hint?: string };
  };
  if (!res.ok || json.error) {
    const e = json.error;
    throw new Error(
      e ? `${e.code}: ${e.message}${e.hint ? ` (${e.hint})` : ''}` : `HTTP ${res.status}`,
    );
  }
  return json;
}

export function PublishFlow({
  draft,
  prepared: given,
}: {
  draft?: EntryDraft;
  prepared?: Prepared;
}) {
  const [step, setStep] = useState<Step>('ready');
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
        p = await postJson<Prepared>('/api/v1/publish/prepare', { entry: draft });
        setPrepared(p);
      }
      if (!p) throw new Error('Nothing to sign.');
      setStep('signing');
      const signed = await signPrepared(p);
      setAccount(signed.accountId);
      setStep('publishing');
      const out = await postJson<Published>('/api/v1/publish', {
        entry_sha256: p.entry_sha256,
        proof: proofFrom(signed, p),
      });
      setPublished(out);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep('failed');
    }
  }

  const working = step === 'preparing' || step === 'signing' || step === 'publishing';
  return (
    <section className="box">
      <h2>Publish on NEAR (testnet)</h2>
      <p>
        Your wallet asks for one signature: a NEP-413 message that names this entry’s hash. No gas,
        no transaction in your wallet. Petal’s writer then puts the entry on the shared map, with
        your signature inside it, so anyone can check you made it.
      </p>
      {prepared && (
        <p className="muted">
          Entry <code>{prepared.entry_sha256}</code>, signed for <code>{prepared.recipient}</code>
          {prepared.expires_at ? `, nonce valid until ${prepared.expires_at}` : ''}. Message:{' '}
          <code>{prepared.message}</code>
        </p>
      )}
      {step !== 'done' && (
        <button type="button" onClick={publish} disabled={working}>
          {step === 'preparing'
            ? 'Preparing…'
            : step === 'signing'
              ? 'Waiting for your wallet…'
              : step === 'publishing'
                ? 'Publishing…'
                : 'Sign in and publish'}
        </button>
      )}
      {error && <p className="error">{error}</p>}
      {published && (
        <div>
          <p>
            <strong>Published</strong>
            {account ? ` by ${account}` : ''}.
          </p>
          <ul>
            <li>
              Key: <code>{published.key}</code>
            </li>
            <li>
              Writer: <code>{published.writer}</code>, receiver <code>{published.receiver}</code>
            </li>
            <li>
              Transaction:{' '}
              <a href={published.explorer_url} rel="noreferrer">
                <code>{published.tx_hash}</code>
              </a>
              {published.tx_hash.startsWith('fake') && (
                <span className="muted"> (fake map: this link leads nowhere)</span>
              )}
            </li>
          </ul>
          <p>The receipt shows as failed because the receiver has no contract; that is expected.</p>
          <p>
            <a href={published.gallery_url}>Open the published flower</a> · <a href="/">Gallery</a>
          </p>
        </div>
      )}
    </section>
  );
}
