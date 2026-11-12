// The lobby's ViewModel, one page with the profile (Elco, 11 Nov: "we might want to unify them"): the person,
// their profile and its editor, and the one balance, all read once in the layout (viewmodels/useWorkPanel.ts)
// so the side panel and the page say the same; their conversations, the panel's own list; and, read here when
// the page opens, the wallets they proved by signing in (GET /api/v1/me) and the claims they and their agents
// keep about accounts (GET /api/v1/me/annotations), and every model call charged to them (usage/v1, GET
// /api/v1/me/usage). Add a wallet signs Petals' challenge with another wallet, as signing in does, and binds
// it to this person (POST /api/v1/me/wallets); the session stays as it is. There is no timer.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addMyWallet,
  readMyAnnotations,
  readMyUsage,
  readWallets,
  sessionClient,
} from '../lib/agent-client.ts';
import {
  type AddWalletPhase,
  type ClaimsView,
  claimsView,
  profilePageWords,
  type UsageCall,
  usageView,
  type WalletRow,
  walletRows,
} from '../lib/profile-view.ts';
import { SIGN_IN_NETWORK, signPrepared } from '../lib/wallet.ts';
import { useWorkPanel } from './useWorkPanel.ts';

const why = (e: unknown) =>
  e instanceof Error && e.message ? e.message : profilePageWords.notAdded;

export function useLobby() {
  const bus = useWorkPanel();
  const person = bus.person;
  if (!person) throw new Error('the lobby is drawn inside the layout it shares with the workspace');
  const { profile, editor, funds } = person;
  const [wallets, setWallets] = useState<WalletRow[] | 'reading' | 'unread'>('reading');
  const [claims, setClaims] = useState<ClaimsView | 'reading' | 'unread'>('reading');
  const [usage, setUsage] = useState<{ calls: UsageCall[]; spent: number } | 'reading' | 'unread'>(
    'reading',
  );
  const [adding, setAdding] = useState<AddWalletPhase>({ kind: 'ready' });

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
    void readMyUsage().then(
      (u) => !gone && setUsage(u ? { calls: u.usage, spent: u.totals.charged_usd } : 'unread'),
      () => !gone && setUsage('unread'),
    );
    return () => {
      gone = true;
    };
  }, []);

  const nearUsd = funds.where?.near_usd ?? null;
  const usageShown = useMemo(
    () => (typeof usage === 'string' ? usage : usageView(usage.calls, usage.spent, nearUsd)),
    [usage, nearUsd],
  );

  const addWallet = useCallback(async () => {
    setAdding({ kind: 'adding' });
    let challenge: Awaited<ReturnType<typeof sessionClient.challenge>>;
    let signed: Awaited<ReturnType<typeof signPrepared>>;
    try {
      challenge = await sessionClient.challenge();
      signed = await signPrepared({ ...challenge, entry_sha256: '' }, SIGN_IN_NETWORK);
    } catch {
      // closing the picker, or saying no in the wallet, adds nothing and isn't an error
      setAdding({ kind: 'ready' });
      return;
    }
    try {
      const { wallets: now } = await addMyWallet(SIGN_IN_NETWORK, {
        type: 'nep413',
        account_id: signed.accountId,
        public_key: signed.publicKey,
        signature: signed.signature,
        message: challenge.message,
        nonce: challenge.nonce,
        recipient: challenge.recipient,
      });
      setWallets(walletRows(now));
      setAdding({ kind: 'ready' });
    } catch (e) {
      setAdding({ kind: 'failed', why: why(e) });
    }
  }, []);

  return {
    profile: {
      account: profile.account,
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
    addWallet: () => void addWallet(),
    claims,
    conversations: bus.rows,
  };
}
