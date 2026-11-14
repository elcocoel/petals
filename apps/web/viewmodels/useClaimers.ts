// Who said each claim, as a person reads them (GET /api/v1/profiles/:account): their picture and name, read once a
// visit per account. A claim by a person's NEAR account is theirs; Petals' own mapping (a tool or model in `by`) is
// Petals', the petals.near account it publishes as.
import type { Claim } from '@petal/core/types';
import { useEffect, useState } from 'react';
import type { PublicProfileAnswer } from '../lib/lobby-view.ts';

/** Petals' own account: its mapping's claims are its own. */
export const PETALS_ACCOUNT = 'petals.near';

/** The account that answers for a claim. */
export function claimerOf(c: Pick<Claim, 'by'>): string {
  if (c.by.startsWith('tool:') || c.by.startsWith('model:')) return PETALS_ACCOUNT;
  return c.by.startsWith('near:') ? (c.by.split(':').at(-1) ?? c.by) : c.by;
}

export interface Claimer {
  name: string | null;
  avatar: string | null;
}

const asked = new Map<string, Promise<Claimer | null>>();

const readClaimer = (account: string) => {
  let p = asked.get(account);
  if (!p) {
    p = fetch(`/api/v1/profiles/${encodeURIComponent(account)}`)
      .then((r) => (r.ok ? (r.json() as Promise<PublicProfileAnswer>) : null))
      .then((a) => (a?.profile ? { name: a.profile.name, avatar: a.profile.avatar } : null))
      .catch(() => null);
    asked.set(account, p);
  }
  return p;
};

/** Each account's picture and name, as they come; an account without a profile has none. */
export function useClaimers(accounts: readonly string[]): ReadonlyMap<string, Claimer | null> {
  const [got, setGot] = useState<ReadonlyMap<string, Claimer | null>>(new Map());
  const key = accounts.join('\n');
  // biome-ignore lint/correctness/useExhaustiveDependencies: the accounts are in the key
  useEffect(() => {
    let gone = false;
    for (const account of accounts)
      void readClaimer(account).then((c) => {
        if (!gone) setGot((now) => (now.has(account) ? now : new Map(now).set(account, c)));
      });
    return () => {
      gone = true;
    };
  }, [key]);
  return got;
}
