// The lobby's profile part (Elco, 9 and 10 Nov): the wallet this session signed in with, and that mainnet
// account's public profile on NEAR Social, read once when the lobby opens: a profile, none there, or no
// answer, each of which the part says. There is no timer. lib/agent-client.ts reads, lib/near-social.ts
// shapes, and lib/lobby-view.ts holds the words and the states.
import { useEffect, useState } from 'react';
import { readSignedIn, readSocialProfile } from '../lib/agent-client.ts';
import type { SocialState } from '../lib/lobby-view.ts';

export function useProfile(): { account: string | null; social: SocialState } {
  const [account, setAccount] = useState<string | null>(null);
  const [social, setSocial] = useState<SocialState>({ kind: 'reading' });
  useEffect(() => {
    let gone = false;
    void (async () => {
      const me = await readSignedIn().catch(() => null);
      if (gone || !me) return;
      setAccount(me.account);
      // NEAR Social lives on mainnet; a testnet session only reaches a lane, and shows the address alone
      if (me.network !== 'mainnet') return;
      try {
        const profile = await readSocialProfile(me.account);
        if (!gone) setSocial(profile ? { kind: 'profile', profile } : { kind: 'none' });
      } catch {
        if (!gone) setSocial({ kind: 'unread' });
      }
    })();
    return () => {
      gone = true;
    };
  }, []);
  return { account, social };
}
