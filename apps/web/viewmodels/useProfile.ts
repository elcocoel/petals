// The lobby's profile part (Elco, 9 and 10 Nov): the wallet this session signed in with, and that mainnet
// account's public profile on NEAR Social, read when the lobby opens and again after the person publishes
// a change: a profile, none there, or no answer, each of which the page says. There is no timer.
// lib/agent-client.ts reads, lib/near-social.ts shapes, and lib/lobby-view.ts holds the words and states.
import { useCallback, useEffect, useState } from 'react';
import { readSignedIn, readSocialProfile } from '../lib/agent-client.ts';
import type { SocialState } from '../lib/lobby-view.ts';

export function useProfile(): {
  account: string | null;
  social: SocialState;
  /** Reads the public profile again, as NEAR Social has it now. */
  reload: () => Promise<void>;
} {
  const [account, setAccount] = useState<string | null>(null);
  const [mainnet, setMainnet] = useState(false);
  const [social, setSocial] = useState<SocialState>({ kind: 'reading' });

  const read = useCallback(async (who: string) => {
    try {
      const profile = await readSocialProfile(who);
      setSocial(profile ? { kind: 'profile', profile } : { kind: 'none' });
    } catch {
      setSocial({ kind: 'unread' });
    }
  }, []);

  useEffect(() => {
    let gone = false;
    void (async () => {
      const me = await readSignedIn().catch(() => null);
      if (gone || !me) return;
      setAccount(me.account);
      // NEAR Social lives on mainnet; a testnet session only reaches a lane, and shows the address alone
      if (me.network !== 'mainnet') return;
      setMainnet(true);
      if (!gone) await read(me.account);
    })();
    return () => {
      gone = true;
    };
  }, [read]);

  const reload = useCallback(async () => {
    if (account && mainnet) await read(account);
  }, [account, mainnet, read]);

  return { account, social, reload };
}
