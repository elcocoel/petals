// Who's here: one session, read from the server, since the cookie can't be read. The flow is a plain async
// function over an injected adapter, tested without a browser; the hook only wires it to React. Connecting
// or leaving reloads the page, because the address holds what it was showing and everything on it depends
// on who's asking.
import { useEffect, useMemo, useState } from 'react';
import {
  type Challenge,
  refusalCode,
  type SessionClient,
  sessionClient,
} from '../lib/agent-client.ts';
import { doorWords } from '../lib/door-words.ts';
import type { WalletSignature } from '../lib/publish.ts';
import { SIGN_IN_NETWORK, signPrepared } from '../lib/wallet.ts';

export interface SessionDeps {
  client: SessionClient;
  /** Opens the picker. It rejects when the person closes it. */
  sign: (challenge: Challenge) => Promise<WalletSignature>;
  /** A session is here now, so what's on the page is out of date. */
  arrived: () => void;
  failed: (words: string) => void;
}

/** Challenge, sign, verify. The challenge lasts five minutes and is single use, so it's asked for now. */
export async function signIn(d: SessionDeps): Promise<void> {
  let challenge: Challenge;
  try {
    challenge = await d.client.challenge();
  } catch {
    d.failed(doorWords.nearDidntAnswer);
    return;
  }
  let signed: WalletSignature;
  try {
    signed = await d.sign(challenge);
  } catch {
    return; // closing the picker is not an error, and neither is saying no in a wallet
  }
  try {
    await d.client.verify(SIGN_IN_NETWORK, {
      type: 'nep413',
      account_id: signed.accountId,
      public_key: signed.publicKey,
      signature: signed.signature,
      message: challenge.message,
      nonce: challenge.nonce,
      recipient: challenge.recipient,
    });
    d.arrived();
  } catch (e) {
    d.failed(
      refusalCode(e) === 'source_failed' ? doorWords.nearDidntAnswer : doorWords.badSignature,
    );
  }
}

export function useSession(reading: boolean) {
  const [session, setSession] = useState<{ known: boolean; account: string | null }>({
    known: !reading,
    account: null,
  });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const deps = useMemo<SessionDeps>(
    () => ({
      client: sessionClient,
      sign: (challenge) => signPrepared({ ...challenge, entry_sha256: '' }, SIGN_IN_NETWORK),
      arrived: () => window.location.reload(),
      failed: setFailed,
    }),
    [],
  );

  useEffect(() => {
    if (!reading) return;
    let gone = false;
    void sessionClient.me().then(
      (account) => {
        if (!gone) setSession({ known: true, account });
      },
      () => {
        if (!gone) setSession({ known: true, account: null });
      },
    );
    return () => {
      gone = true;
    };
  }, [reading]);

  return {
    ...session,
    busy,
    failed,
    connect: () => {
      if (busy) return;
      setBusy(true);
      setFailed(null);
      void signIn(deps).finally(() => setBusy(false));
    },
    disconnect: () => {
      // Proposal (8 Nov, fe-frontdoor): leaving the account leaves the app, back to the front page.
      void sessionClient.logout().then(() => window.location.assign('/'));
    },
  };
}
