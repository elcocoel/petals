// Paying for Petals' agent (B): the one payment, which the wallet sends and the server checks on chain, to
// where GET /api/v1/pay says. That's read once, with the one balance (useFunds, in the layout), and handed in
// as `where`; `paid` reads both again once a payment lands. lib/pay.ts holds the arithmetic and the words.
// The person sets how many dollars (about $1 to start, Elco's mainnet test), and a transfer the wallet sent is
// kept until the server confirms it, so pressing again never sends a second one (wave 5). The NEAR comes from
// one of the person's own wallets: signed in with Ethereum or Solana, the NEAR wallet is bound first, with one
// signature and nothing spent, so the server never refuses a transfer that has already gone (flow 3, 13 Nov).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { addMyWallet, confirmPay, readWallets, sessionClient } from '../lib/agent-client.ts';
import {
  money,
  nearFor,
  PAY_NEAR,
  PAY_USD,
  type PayInfo,
  type PayPhase,
  PENDING_KEY,
  type PendingPay,
  payAction,
  payWords,
  sentBy,
  yoctoOf,
} from '../lib/pay.ts';
import { connectedAccount, type Network, sendAction, signPrepared } from '../lib/wallet.ts';

const readPending = (): PendingPay | null => {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingPay) : null;
  } catch {
    return null;
  }
};

const keepPending = (p: PendingPay | null) => {
  try {
    if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // a browser that keeps nothing: the page still holds it until it's closed
  }
};

/** What a payment knows and does about the NEAR wallet it comes from; injected, so it's tested without a browser. */
export interface PayFrom {
  /** the person's NEAR wallets on the payment's network, as GET /api/v1/me lists them */
  mine: () => Promise<string[]>;
  /** the account the connected NEAR wallet names, asking nothing; null with none connected */
  connected: () => Promise<string | null>;
  /**
   * Signs Petals' challenge with a NEAR wallet (the picker opens) and binds it to this person, as Wallets'
   * Add does: its account, or null when the person closed the wallet. It rejects with the server's words.
   */
  link: () => Promise<string | null>;
}

/**
 * Makes sure a payment's NEAR comes from one of this person's wallets before any leaves (flow 3, 13 Nov): the
 * server credits only a transfer from a wallet bound to the person (POST /api/v1/pay), and signed in with
 * Ethereum or Solana, the connected NEAR wallet is bound to no one yet. `account` is the one that has to be
 * theirs, a transfer already out; else it's the connected wallet's. False when the person closed the wallet.
 */
export async function payFromMine(d: PayFrom, account?: string): Promise<boolean> {
  const from = account ?? (await d.connected());
  if (from && (await d.mine()).includes(from)) return true;
  return (await d.link()) !== null;
}

/** The NEAR wallet a payment on `network` comes from, as the browser and the server have it. */
export function payFrom(network: Network): PayFrom {
  return {
    mine: async () =>
      ((await readWallets()) ?? []).filter((w) => w.network === network).map((w) => w.account_id),
    connected: () => connectedAccount(network),
    link: async () => {
      const challenge = await sessionClient.challenge();
      let signed: Awaited<ReturnType<typeof signPrepared>>;
      try {
        // the same network's connector the transfer then goes through, so it's this wallet that sends
        signed = await signPrepared({ ...challenge, entry_sha256: '' }, network);
      } catch {
        return null; // closing the picker, or saying no in the wallet, isn't an error
      }
      await addMyWallet(network, {
        type: 'nep413',
        account_id: signed.accountId,
        public_key: signed.publicKey,
        signature: signed.signature,
        message: challenge.message,
        nonce: challenge.nonce,
        recipient: challenge.recipient,
      });
      return signed.accountId;
    },
  };
}

/** `asking` is the newest pay row's key: a new one starts a new payment. */
export function usePay(
  /** Where a payment goes and NEAR's price, as the one balance read them; null until it has. */
  where: PayInfo | null,
  asking: string | null,
  /** The one balance's re-read, once a payment has landed. */
  paid: () => void,
) {
  const [phase, setPhase] = useState<PayPhase>('ready');
  const [added, setAdded] = useState<string | null>(null);
  const [usd, setUsd] = useState(String(PAY_USD));
  const [pending, setPending] = useState<PendingPay | null>(null);
  /** the server's words when binding the wallet was refused: nothing was sent */
  const [why, setWhy] = useState<string | null>(null);
  useEffect(() => setPending(readPending()), []);
  const from = useMemo(() => (where ? payFrom(where.network) : null), [where]);
  const [askedBy, setAskedBy] = useState(asking);
  // adjusted during render, as React allows: a new refusal is a new payment
  if (asking !== askedBy) {
    setAskedBy(asking);
    setPhase('ready');
    setAdded(null);
    setWhy(null);
  }

  const amount = Number(usd);
  const near = nearFor(amount, where?.near_usd ?? null);

  const confirm = useCallback(
    async (p: PendingPay) => {
      const done = await confirmPay({ network: p.network, account_id: p.account, tx_hash: p.hash });
      keepPending(null);
      setPending(null);
      setAdded(String(done.added_near));
      setPhase('added');
      paid();
    },
    [paid],
  );

  const pay = useCallback(async () => {
    if (!where || !from) {
      setPhase('failed');
      return;
    }
    setPhase('paying');
    setWhy(null);
    try {
      // a transfer already out: confirm that one, never send again
      const out = pending ?? readPending();
      // the NEAR comes from one of their own wallets, bound first if it isn't, before any is sent
      let mine: boolean;
      try {
        mine = await payFromMine(from, out?.account);
      } catch (e) {
        setWhy(e instanceof Error && e.message ? e.message : null);
        throw e;
      }
      if (!mine) {
        setPhase('ready');
        return;
      }
      if (out) {
        await confirm(out);
        return;
      }
      const send = near ?? PAY_NEAR;
      const action = payAction(where, yoctoOf(send));
      const sent = sentBy(await sendAction(where.network, where.receiver, action));
      if (!sent) throw new Error('no transaction');
      const p: PendingPay = {
        network: where.network,
        account: sent.account,
        hash: sent.hash,
        near: send,
      };
      keepPending(p);
      setPending(p);
      await confirm(p);
    } catch {
      setPhase('failed');
    }
  }, [where, from, pending, near, confirm]);

  const label = pending
    ? payWords.confirm
    : near !== null
      ? payWords.buttonUsd(money(amount, where?.near_usd ?? null))
      : payWords.button(PAY_NEAR);

  return {
    /** The pay row that's live; earlier ones were answered or passed. */
    asking,
    phase,
    added,
    /** what the press says, and the dollars the person chose (none to choose while a transfer waits) */
    label,
    amount: pending || near === null ? null : { usd, label: payWords.amount, onUsd: setUsd },
    /** the one amount, which paying with another token reads too */
    usd,
    setUsd,
    /** a transfer out and not confirmed yet: what the row says after a failed press */
    failedWords: why ?? (pending ? payWords.pending : payWords.failed),
    canPay: Boolean(pending) || near === null || amount > 0,
    pay: () => void pay(),
  };
}
