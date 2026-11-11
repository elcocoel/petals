// The lobby's ViewModel, one page with the profile (Elco, 11 Nov: "we might want to unify them"): the person,
// their profile and its editor, and the one balance, all read once in the layout (viewmodels/useWorkPanel.ts)
// so the side panel and the page say the same; their conversations, the panel's own list; and, read here when
// the page opens, the wallets they proved by signing in (GET /api/v1/me) and the claims they and their agents
// keep about accounts (GET /api/v1/me/annotations). There is no timer.
import { useEffect, useState } from 'react';
import { readMyAnnotations, readWallets } from '../lib/agent-client.ts';
import { type ClaimsView, claimsView, type WalletRow, walletRows } from '../lib/profile-view.ts';
import { useWorkPanel } from './useWorkPanel.ts';

export function useLobby() {
  const bus = useWorkPanel();
  const person = bus.person;
  if (!person) throw new Error('the lobby is drawn inside the layout it shares with the workspace');
  const { profile, editor, funds } = person;
  const [wallets, setWallets] = useState<WalletRow[] | 'reading' | 'unread'>('reading');
  const [claims, setClaims] = useState<ClaimsView | 'reading' | 'unread'>('reading');

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
    return () => {
      gone = true;
    };
  }, []);

  return {
    profile: {
      account: profile.account,
      social: profile.social,
      edit: editor.open,
      saved: editor.saved,
    },
    editor: editor.view,
    funds,
    wallets,
    claims,
    conversations: bus.rows,
  };
}
