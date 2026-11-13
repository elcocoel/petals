// Who's here: one session, read from the server, since the cookie can't be read. The flow is a plain async
// function over an injected adapter, tested without a browser; the hook only wires it to React. Connecting
// or leaving reloads the page, because the address holds what it was showing and everything on it depends
// on who's asking.
import { useEffect, useMemo, useState } from 'react';
import {
  type Challenge,
  type EvmProof,
  evmChallenge,
  refusalCode,
  type SessionClient,
  type SolanaProof,
  sessionClient,
  solanaChallenge,
  verifyEvm,
  verifySolana,
} from '../lib/agent-client.ts';
import { doorWords } from '../lib/door-words.ts';
import { evmAccount, evmSign, hasEvmWallet, NO_EVM_WALLET } from '../lib/evm-wallet.ts';
import type { WalletSignature } from '../lib/publish.ts';
import {
  hasSolanaWallet,
  NO_SOLANA_WALLET,
  solanaAccount,
  solanaSign,
} from '../lib/solana-wallet.ts';
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

/**
 * An EVM wallet's proof: the browser's EVM wallet (the one picked by its id, lib/evm-wallet.ts, or the first)
 * names its account, Petals' challenge gives the Sign-In with Ethereum text for it, and the wallet signs that
 * text. No transaction, no spend. It rejects when there's no wallet or the person says no.
 */
export async function evmProof(wallet?: string): Promise<EvmProof> {
  const { address, chainId } = await evmAccount(wallet);
  const { message } = await evmChallenge(address, chainId);
  const signature = await evmSign(message, address, wallet);
  return { type: 'eip191', address, message, signature };
}

/** Signs in with an EVM wallet, as signIn does with a NEAR one; closing the wallet or saying no isn't an error. */
export async function signInEvm(arrived: () => void, failed: (words: string) => void) {
  if (!hasEvmWallet()) {
    failed(NO_EVM_WALLET);
    return;
  }
  let proof: EvmProof;
  try {
    proof = await evmProof();
  } catch {
    return;
  }
  try {
    await verifyEvm(proof);
    arrived();
  } catch (e) {
    failed(refusalCode(e) === 'source_failed' ? doorWords.nearDidntAnswer : doorWords.badSignature);
  }
}

/**
 * A Solana wallet's proof: the browser's Solana wallet (the one picked by its id, or the first) connects, Petals'
 * challenge gives the text, the wallet signs it.
 */
export async function solanaProof(wallet?: string): Promise<SolanaProof> {
  const address = await solanaAccount(wallet);
  const { message } = await solanaChallenge(address);
  const signature = await solanaSign(message, wallet);
  return { type: 'ed25519', address, message, signature };
}

/** Signs in with a Solana wallet, as signInEvm does with an EVM one. */
export async function signInSolana(arrived: () => void, failed: (words: string) => void) {
  if (!hasSolanaWallet()) {
    failed(NO_SOLANA_WALLET);
    return;
  }
  let proof: SolanaProof;
  try {
    proof = await solanaProof();
  } catch {
    return;
  }
  try {
    await verifySolana(proof);
    arrived();
  } catch (e) {
    failed(refusalCode(e) === 'source_failed' ? doorWords.nearDidntAnswer : doorWords.badSignature);
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
    /** The same with an EVM wallet: one signed message, then the page loads again. */
    connectEvm: () => {
      if (busy) return;
      setBusy(true);
      setFailed(null);
      void signInEvm(deps.arrived, setFailed).finally(() => setBusy(false));
    },
    /** The same with a Solana wallet. */
    connectSolana: () => {
      if (busy) return;
      setBusy(true);
      setFailed(null);
      void signInSolana(deps.arrived, setFailed).finally(() => setBusy(false));
    },
    disconnect: () => {
      // Leaving the account leaves the app, back to the front page.
      void sessionClient.logout().then(() => window.location.assign('/'));
    },
  };
}
