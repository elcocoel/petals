// The lobby's profile part, from NEAR Social (Elco, 9 Nov): the public profile of the mainnet NEAR account
// this session signed in with, read once when the lobby opens. With no profile, another network, or no
// answer, it's null, and the account's address stands alone. lib/agent-client.ts reads it, and lib/near-social.ts shapes it.
import { useEffect, useState } from 'react';
import { readSignedIn, readSocialProfile } from '../lib/agent-client.ts';
import type { SocialProfile } from '../lib/near-social.ts';

export function useSocialProfile(): SocialProfile | null {
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  useEffect(() => {
    let gone = false;
    void (async () => {
      const me = await readSignedIn().catch(() => null);
      // NEAR Social lives on mainnet
      if (me?.network !== 'mainnet') return;
      const next = await readSocialProfile(me.account);
      if (!gone) setProfile(next);
    })();
    return () => {
      gone = true;
    };
  }, []);
  return profile;
}
