'use client';
// Challenge, sign, verify, then read /me. Prints exactly what came back, for checking by hand.
import { useState } from 'react';
import { Button } from '../../../components/ui/Button.tsx';
import type { Prepared } from '../../../lib/publish.ts';
import { signPrepared } from '../../../lib/wallet.ts';

type Network = 'testnet' | 'mainnet';

async function post(path: string, body: unknown) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function signIn(network: Network) {
  const challenge = await post('/api/v1/auth/challenge', {});
  if (challenge.status !== 200) return { challenge };
  const c = challenge.body as Pick<Prepared, 'nonce' | 'message' | 'recipient' | 'expires_at'>;
  const signed = await signPrepared({ ...c, entry_sha256: '' }, network);
  const verify = await post('/api/v1/auth/verify', {
    network,
    proof: {
      type: 'nep413',
      account_id: signed.accountId,
      public_key: signed.publicKey,
      signature: signed.signature,
      message: c.message,
      nonce: c.nonce,
      recipient: c.recipient,
    },
  });
  const me = await fetch('/api/v1/me');
  return { message: c.message, recipient: c.recipient, verify, me: await me.json() };
}

export function WalletProof() {
  const [out, setOut] = useState('');
  const run = (network: Network) => () => {
    setOut(`Waiting for the wallet on ${network}…`);
    signIn(network).then(
      (r) => setOut(JSON.stringify(r, null, 2)),
      (e: unknown) => setOut(`Failed: ${e instanceof Error ? e.message : String(e)}`),
    );
  };
  return (
    <main>
      <p>Test tool. Testnet for Meteor, mainnet for NEAR Mobile. Signing moves nothing.</p>
      <Button onClick={run('testnet')}>Sign in on testnet</Button>{' '}
      <Button onClick={run('mainnet')}>Sign in on mainnet</Button>
      <pre>{out}</pre>
    </main>
  );
}
