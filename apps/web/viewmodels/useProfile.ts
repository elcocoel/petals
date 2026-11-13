// The person's profile (in the same data shape as NEAR Social, with a publish button): the wallet this
// session signed in with, and the profile the page shows: Petals' own copy (GET /api/v1/me/profile), or,
// before Petals keeps one, the account's NEAR Social profile, which the editor then starts from; or none
// anywhere; or that it couldn't be read. Read when the page opens and again after the person saves. There is no timer. lib/agent-client.ts reads, lib/near-social.ts shapes,
// and lib/lobby-view.ts holds the words and the states.
import { useCallback, useEffect, useState } from 'react';
import { readMyProfile, readSignedIn, readSocialProfile } from '../lib/agent-client.ts';
import type { SocialState } from '../lib/lobby-view.ts';
import { fromPetals, type PetalsProfile } from '../lib/near-social.ts';

export function useProfile(): {
  account: string | null;
  social: SocialState;
  /** Petals' own copy as it's kept, picture and all; null before it keeps one. */
  kept: PetalsProfile | null;
  /** Reads the profile again, as Petals has it now. */
  reload: () => Promise<void>;
} {
  const [account, setAccount] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [social, setSocial] = useState<SocialState>({ kind: 'reading' });
  const [kept, setKept] = useState<PetalsProfile | null>(null);

  const read = useCallback(async (who: string, on: string) => {
    let mine: PetalsProfile | null;
    try {
      mine = await readMyProfile();
    } catch {
      setSocial({ kind: 'unread' });
      return;
    }
    setKept(mine);
    const shown = fromPetals(mine);
    if (shown) {
      setSocial({ kind: 'profile', profile: shown, source: 'petals' });
      return;
    }
    // Nothing kept yet: the account's NEAR Social profile, on mainnet, is where the editor starts.
    const public_ = on === 'mainnet' ? await readSocialProfile(who).catch(() => null) : null;
    setSocial(
      public_ ? { kind: 'profile', profile: public_, source: 'near-social' } : { kind: 'none' },
    );
  }, []);

  useEffect(() => {
    let gone = false;
    void (async () => {
      const me = await readSignedIn().catch(() => null);
      if (gone || !me) return;
      setAccount(me.account);
      setNetwork(me.network);
      await read(me.account, me.network);
    })();
    return () => {
      gone = true;
    };
  }, [read]);

  const reload = useCallback(async () => {
    if (account && network) await read(account, network);
  }, [account, network, read]);

  return { account, social, kept, reload };
}
