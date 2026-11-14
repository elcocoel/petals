'use client';
import { outside } from '../lib/outside.ts';
// The publish steps (T066): prepare_publish, sign in the wallet (NEP-413, one prompt), then
// publish_flower. Shows the key, the writer and the explorer link, and why the receipt "fails".
import { type EntryDraft, networkOf, type Prepared } from '../lib/publish.ts';
import { usePublishFlow } from '../viewmodels/usePublishFlow.ts';
import { Button } from './ui/Button.tsx';

export function PublishFlow({
  draft,
  prepared: given,
}: {
  draft?: EntryDraft;
  prepared?: Prepared;
}) {
  const { step, prepared, published, account, error, working, publish } = usePublishFlow({
    ...(draft ? { draft } : {}),
    ...(given ? { prepared: given } : {}),
  });
  return (
    <section className="box">
      <h2>Publish on NEAR ({prepared ? networkOf(prepared.recipient) : 'testnet'})</h2>
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
        <Button onClick={publish} disabled={working}>
          {step === 'preparing'
            ? 'Preparing…'
            : step === 'signing'
              ? 'Waiting for your wallet…'
              : step === 'publishing'
                ? 'Publishing…'
                : 'Sign in and publish'}
        </Button>
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
              <a href={published.explorer_url} {...outside(published.explorer_url)}>
                <code>{published.tx_hash}</code>
              </a>
              {published.tx_hash.startsWith('fake') && (
                <span className="muted"> (fake map: this link leads nowhere)</span>
              )}
            </li>
          </ul>
          <p>The receipt shows as failed because the receiver has no contract; that is expected.</p>
          <p>
            <a href={published.gallery_url}>Open the published flower</a> ·{' '}
            <a href="/gallery">Gallery</a>
          </p>
        </div>
      )}
    </section>
  );
}
