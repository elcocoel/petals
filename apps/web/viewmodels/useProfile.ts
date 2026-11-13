// The person's profile, one and the same as NEAR Social: the wallet this session signed in with, and the profile
// the page shows. For a person with a NEAR account on mainnet (the one they signed in with, or a NEAR wallet
// they added), that's their NEAR Social profile, read fresh each time, so an edit made there shows here; with
// none on NEAR Social, or no NEAR account, it's the one they set on Petals (GET /api/v1/me/profile); or none
// anywhere; or that it couldn't be read. Petals' own copy is read too, for the editor's picture. Read when the
// page opens and again after the person saves. There is no timer. lib/agent-client.ts reads, lib/near-social.ts
// shapes, and lib/lobby-view.ts holds the words and the states.
import { useCallback, useEffect, useState } from 'react';
import {
  readMyProfile,
  readSignedIn,
  readSocialProfile,
  readWallets,
} from '../lib/agent-client.ts';
import { nearAccountOf, type SocialState } from '../lib/lobby-view.ts';
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
    let wallets: Awaited<ReturnType<typeof readWallets>>;
    try {
      [mine, wallets] = await Promise.all([readMyProfile(), readWallets()]);
    } catch {
      setSocial({ kind: 'unread' });
      return;
    }
    setKept(mine);
    // the NEAR account on mainnet, if there's one: its NEAR Social profile is the profile
    const near = nearAccountOf({ network: on, account: who }, wallets ?? []);
    const mainnet = near && (on === 'mainnet' || near !== who) ? near : null;
    const public_ = mainnet ? await readSocialProfile(mainnet).catch(() => null) : null;
    if (public_) {
      setSocial({ kind: 'profile', profile: public_, source: 'near-social' });
      return;
    }
    const shown = fromPetals(mine);
    setSocial(shown ? { kind: 'profile', profile: shown, source: 'petals' } : { kind: 'none' });
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
