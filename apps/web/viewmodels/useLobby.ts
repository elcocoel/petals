// The lobby's ViewModel, one page with the profile: the person, their profile and its editor, and the one
// balance, all read once in the layout (viewmodels/useWorkPanel.ts) so the side panel and the page say the
// same; their conversations, the panel's own list; and, read here when the page opens, the wallets they proved
// by signing in (GET /api/v1/me) and the claims they and their agents keep about accounts (GET
// /api/v1/me/annotations), every model call charged to them (usage/v1, GET /api/v1/me/usage), and their tip
// (useTip). Disconnect signs out (the session's own), from the account menu. Add funds is the pay row's own
// flow (usePay, useTopUp), open under the balance, and /lobby#add arrives with it open. Add a wallet signs
// Petals' challenge with another wallet, as signing in does, and binds it to this person (POST
// /api/v1/me/wallets); the session stays as it is. One illustrated quote per visit, for its own band. There
// is no timer.

import type { Credit } from '@petal/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addMyWallet,
  readMyAnnotations,
  readMyCredit,
  readMyUsage,
  readWallets,
  sessionClient,
} from '../lib/agent-client.ts';
import { contributionView } from '../lib/contribution-view.ts';
import { hasEvmWallet, NO_EVM_WALLET } from '../lib/evm-wallet.ts';
import {
  type AddWalletPhase,
  type ClaimsView,
  claimsView,
  profilePageWords,
  type UsageCall,
  usageView,
  type WalletKind,
  type WalletRow,
  walletRows,
} from '../lib/profile-view.ts';
import { hasSolanaWallet, NO_SOLANA_WALLET } from '../lib/solana-wallet.ts';
import { tipLine } from '../lib/tip.ts';
import { connectWallet, SIGN_IN_NETWORK, signPrepared } from '../lib/wallet.ts';
import { usePay } from './usePay.ts';
import { usePowerQuote } from './usePowerQuote.ts';
import { evmProof, solanaProof } from './useSession.ts';
import { useTip } from './useTip.ts';
import { useTopUp } from './useTopUp.ts';
import { useWorkPanel } from './useWorkPanel.ts';

/** The pay row's key while Add funds is open: the pay flow's one home is the Balance band. */
const ADDING = 'lobby-add';
/** The address that opens the lobby with Add funds unfolded: where /make sends a person who needs credit. */
const ADD_HASH = '#add';

const why = (e: unknown) =>
  e instanceof Error && e.message ? e.message : profilePageWords.notAdded;

export function useLobby() {
  const bus = useWorkPanel();
  const person = bus.person;
  if (!person) throw new Error('the lobby is drawn inside the layout it shares with the workspace');
  const { profile, editor, funds, session } = person;
  // the tip, an optional donation on the price's scale: what it adds to a typical turn reads as the balance
  // does, at NEAR's price from the one balance
  const tipped = useTip(Boolean(session.account));
  const [wallets, setWallets] = useState<WalletRow[] | 'reading' | 'unread'>('reading');
  const [claims, setClaims] = useState<ClaimsView | 'reading' | 'unread'>('reading');
  const [usage, setUsage] = useState<{ calls: UsageCall[]; spent: number } | 'reading' | 'unread'>(
    'reading',
  );
  const [adding, setAdding] = useState<AddWalletPhase>({ kind: 'ready' });
  const [credit, setCredit] = useState<Credit | 'reading' | 'unread'>('reading');

  useEffect(() => {
    let gone = false;
    void readWallets().then(
      (w) => !gone && setWallets(w ? walletRows(w) : 'unread'),
      () => !gone && setWallets('unread'),
    );
    void readMyAnnotations().then(
      (rows) => !gone && setClaims(rows ? claimsView(rows) : 'unread'),
      () => !gone && setClaims('unread'),
    );
    void readMyCredit().then(
      (c) => !gone && setCredit(c ?? 'unread'),
      () => !gone && setCredit('unread'),
    );
    void readMyUsage().then(
      (u) => !gone && setUsage(u ? { calls: u.usage, spent: u.totals.charged_usd } : 'unread'),
      () => !gone && setUsage('unread'),
    );
    return () => {
      gone = true;
    };
  }, []);

  // the visit's one illustrated quote, in a band of its own
  const quote = usePowerQuote(0);

  // the account menu, top right
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleMenu = useCallback(() => setMenuOpen((now) => !now), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Add funds: the pay row's own flow, unfolded under the balance; /lobby#add arrives with it open, scrolled to
  // the Balance band
  const [addOpen, setAddOpen] = useState(false);
  useEffect(() => {
    const arrive = () => {
      if (window.location.hash !== ADD_HASH) return;
      setAddOpen(true);
      requestAnimationFrame(() => document.getElementById('balance')?.scrollIntoView());
    };
    arrive();
    window.addEventListener('hashchange', arrive);
    return () => window.removeEventListener('hashchange', arrive);
  }, []);
  const toggleAdd = useCallback(() => setAddOpen((now) => !now), []);
  const asking = addOpen ? ADDING : null;
  const paid = funds.reread;
  const pay = usePay(funds.where ?? null, asking, paid);
  // or any other token, from any chain, through NEAR Intents, beside it in the same row
  const topUp = useTopUp(asking, paid, pay);
  const nearUsd = funds.where?.near_usd ?? null;
  const usageShown = useMemo(
    () => (typeof usage === 'string' ? usage : usageView(usage.calls, usage.spent, nearUsd)),
    [usage, nearUsd],
  );

  /** Adds a wallet: a NEAR one signs Petals' challenge as signing in does, an EVM one its Sign-In text. */
  const addWallet = useCallback(
    async (kind: WalletKind) => {
      if (kind === 'evm' && !hasEvmWallet()) {
        setAdding({ kind: 'failed', why: NO_EVM_WALLET });
        return;
      }
      if (kind === 'solana' && !hasSolanaWallet()) {
        setAdding({ kind: 'failed', why: NO_SOLANA_WALLET });
        return;
      }
      setAdding({ kind: 'adding' });
      let network: string;
      let proof: Parameters<typeof addMyWallet>[1];
      try {
        if (kind === 'evm') {
          network = 'eip155';
          proof = await evmProof();
        } else if (kind === 'solana') {
          network = 'solana';
          proof = await solanaProof();
        } else {
          const challenge = await sessionClient.challenge();
          const signed = await signPrepared({ ...challenge, entry_sha256: '' }, SIGN_IN_NETWORK);
          network = SIGN_IN_NETWORK;
          proof = {
            type: 'nep413',
            account_id: signed.accountId,
            public_key: signed.publicKey,
            signature: signed.signature,
            message: challenge.message,
            nonce: challenge.nonce,
            recipient: challenge.recipient,
          };
        }
      } catch {
        // closing the picker, or saying no in the wallet, adds nothing and isn't an error
        setAdding({ kind: 'ready' });
        return;
      }
      try {
        const { wallets: now } = await addMyWallet(network, proof);
        setWallets(walletRows(now));
        setAdding({ kind: 'ready' });
        // an open profile editor publishes as the NEAR wallet just added
        editor.readNear();
      } catch (e) {
        setAdding({ kind: 'failed', why: why(e) });
      }
    },
    [editor],
  );

  return {
    profile: {
      account: profile.account,
      // the chain the account signed in on, as its own wallet row names it
      chain: Array.isArray(wallets)
        ? (wallets.find((w) => w.full === profile.account)?.chain ?? null)
        : null,
      social: profile.social,
      edit: editor.open,
      saved: editor.saved,
      published: editor.published,
    },
    editor: editor.view,
    funds,
    usage: usageShown,
    wallets,
    adding,
    addWallet: (kind: WalletKind) => void addWallet(kind),
    claims,
    conversations: bus.rows,
    contribution: typeof credit === 'string' ? credit : contributionView(credit),
    quote,
    menu: { open: menuOpen, toggle: toggleMenu, close: closeMenu },
    add: {
      open: addOpen,
      toggle: toggleAdd,
      row: {
        phase: pay.phase,
        added: pay.added,
        onPay: pay.pay,
        topUp,
        label: pay.label,
        amount: pay.amount,
        failedWords: pay.failedWords,
        canPay: pay.canPay,
      },
    },
    tip: {
      percent: tipped.percent,
      scale: tipped.scale,
      open: tipped.open,
      onOpen: tipped.toggle,
      onSlide: tipped.slide,
      onSet: tipped.set,
      line: tipLine(tipped.percent ?? 0, tipped.turn, funds.where?.near_usd ?? null),
      failed: tipped.failed,
    },
    leave: session.disconnect,
  };
}
