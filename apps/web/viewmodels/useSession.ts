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
import {
  evmAccount,
  evmSign,
  evmWallets,
  NO_EVM_WALLET,
  type WalletChoice,
} from '../lib/evm-wallet.ts';
import { walletRefusal } from '../lib/profile-view.ts';
import type { WalletSignature } from '../lib/publish.ts';
import {
  NO_SOLANA_WALLET,
  solanaAccount,
  solanaSign,
  solanaWallets,
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

/**
 * Signs in with an EVM wallet, the one picked by its id (else the first), as signIn does with a NEAR one. What
 * the wallet answers, a no included, is said in its name: a wallet that goes quiet never leaves a dead button.
 */
export async function signInEvm(
  arrived: () => void,
  failed: (words: string) => void,
  picked?: WalletChoice,
) {
  const wallet = picked ?? evmWallets()[0];
  if (!wallet) {
    failed(NO_EVM_WALLET);
    return;
  }
  let proof: EvmProof;
  try {
    proof = await evmProof(wallet.id);
  } catch (e) {
    failed(walletRefusal(wallet.name, e, doorWords.declined));
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

/** Signs in with a Solana wallet, the one picked by its id (else the first), as signInEvm does with an EVM one. */
export async function signInSolana(
  arrived: () => void,
  failed: (words: string) => void,
  picked?: WalletChoice,
) {
  const wallet = picked ?? solanaWallets()[0];
  if (!wallet) {
    failed(NO_SOLANA_WALLET);
    return;
  }
  let proof: SolanaProof;
  try {
    proof = await solanaProof(wallet.id);
  } catch (e) {
    failed(walletRefusal(wallet.name, e, doorWords.declined));
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
  /** Several wallets of one kind in this browser: the person picks one by name. */
  const [pick, setPick] = useState<{ chain: 'evm' | 'solana'; wallets: WalletChoice[] } | null>(
    null,
  );
  /** The wallet asked now, by name, so the person knows where to answer. */
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
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

  /** An EVM or Solana wallet signs in: with several in this browser, the person picks one by name first. */
  const connectWith = (chain: 'evm' | 'solana', id?: string) => {
    if (busy) return;
    setFailed(null);
    const wallets = chain === 'evm' ? evmWallets() : solanaWallets();
    if (wallets.length === 0) {
      setFailed(chain === 'evm' ? NO_EVM_WALLET : NO_SOLANA_WALLET);
      return;
    }
    if (!id && wallets.length > 1) {
      setPick({ chain, wallets });
      return;
    }
    const wallet = wallets.find((w) => w.id === id) ?? wallets[0];
    setPick(null);
    setBusy(true);
    setWaitingFor(wallet?.name ?? null);
    const signIn = chain === 'evm' ? signInEvm : signInSolana;
    void signIn(deps.arrived, setFailed, wallet).finally(() => {
      setBusy(false);
      setWaitingFor(null);
    });
  };

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
    pick,
    waitingFor,
    /** The same with an EVM wallet: one signed message, then the page loads again. */
    connectEvm: (id?: string) => connectWith('evm', id),
    /** The same with a Solana wallet. */
    connectSolana: (id?: string) => connectWith('solana', id),
    /** The wallet picked by name, of the kind being picked. */
    choose: (id: string) => {
      if (pick) connectWith(pick.chain, id);
    },
    /** Stops waiting for a wallet that doesn't answer, or puts the pick away; its request stays in the wallet. */
    stop: () => {
      setBusy(false);
      setWaitingFor(null);
      setPick(null);
    },
    disconnect: () => {
      // Leaving the account leaves the app, back to the front page.
      void sessionClient.logout().then(() => window.location.assign('/'));
    },
  };
}
