// Sponsored invites (T196, SYS-052): a token whose hash is all we keep, with its own budget in the
// private store. The budget is a credit account funded when it's minted. Every model call of a chat
// reserves against the invite and the day's cap, then settles both, so neither can be passed by more
// than one call. Any number of sessions may redeem one token: they draw on the one budget, so an
// invite can go to one judge or a pool of them, and a lost cookie costs nothing but a second redeem.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { openStore, type Store } from '@petal/store';
import type { BudgetLedger, SpendHold } from './llm.ts';

/** What to do instead, in plain words. Own agents need no invite and no sign-in. */
export const CONNECT_HINT = 'Connect your own agent at /connect: it can use every tool, for free.';
export const NO_INVITE =
  "Petal's own agent runs only on a sponsored invite, and this session doesn't hold one, so nothing was spent. You can use your own agent instead.";
export const INVITE_SPENT =
  "This invite's budget is used up, so Petal's agent stopped here. You can carry on with your own agent.";
export const INVITE_CLOSED =
  "This invite isn't valid any more, so Petal's agent stopped here. You can carry on with your own agent.";
export const CREDIT_SPENT =
  "Your credit is used up, so Petal's agent stopped here and nothing more will be spent. You can carry on with your own agent.";

/** An invite minted with no days given ends after this many. An open-ended one is never closed. */
export const DEFAULT_INVITE_DAYS = 14;

export type InviteStatus = 'active' | 'spent' | 'revoked' | 'expired';

export interface InviteState {
  status: InviteStatus;
  budget_usd: number;
  spent_usd: number;
  /** what the next chat can draw on: the budget, less what's spent and what's held for calls now */
  left_usd: number;
  expires_at: string | null;
}

const accountOf = (id: string) => `invite:${id}`;
/** The invite behind a credit account, if that's what it is. */
export const inviteOfAccount = (account: string) =>
  account.startsWith('invite:') ? account.slice('invite:'.length) : null;
/** Under a billionth of a dollar is rounding dust from adding floats, not money to spend. */
const DUST_USD = 1e-9;

export const hashToken = (token: string) =>
  createHash('sha256').update(token, 'utf8').digest('hex');

export interface MintedInvite {
  id: string;
  /** The only copy. It isn't stored and can't be shown again. */
  token: string;
  budget_usd: number;
  expires_at: string;
}

export function mintInvite(
  store: Store,
  o: { usd: number; days?: number; now?: Date },
): MintedInvite {
  if (!Number.isFinite(o.usd) || o.usd <= 0) throw new Error('the budget must be more than $0');
  if (o.days !== undefined && (!Number.isFinite(o.days) || o.days <= 0)) {
    throw new Error('the days must be more than 0');
  }
  const now = o.now ?? new Date();
  const id = `inv_${randomBytes(9).toString('hex')}`;
  const token = `petal_invite_${randomBytes(32).toString('base64url')}`;
  const expires_at = new Date(
    now.getTime() + (o.days ?? DEFAULT_INVITE_DAYS) * 86_400_000,
  ).toISOString();
  store.tx(() => {
    store.invite.create({ id, token_hash: hashToken(token), budget_usd: o.usd, expires_at });
    store.credit.apply({
      id: `mint:${id}`,
      account_key: accountOf(id),
      delta_usd: o.usd,
      reason: 'minted',
      at: now.toISOString(),
    });
  });
  return { id, token, budget_usd: o.usd, expires_at };
}

/** False when no such invite exists. Calls in flight still settle; the next one is refused. */
export function revokeInvite(store: Store, id: string, now: Date = new Date()): boolean {
  if (!store.invite.get(id)) return false;
  store.invite.revoke(id, now.toISOString());
  return true;
}

export function inviteState(store: Store, id: string, now: Date = new Date()): InviteState | null {
  const invite = store.invite.get(id);
  if (!invite) return null;
  const credit = store.credit.get(accountOf(id));
  const free = (credit?.balance_usd ?? 0) - (credit?.reserved_usd ?? 0);
  const left = free < DUST_USD ? 0 : free;
  let status: InviteStatus = 'active';
  if (invite.revoked_at) status = 'revoked';
  else if (invite.expires_at && Date.parse(invite.expires_at) <= now.getTime()) status = 'expired';
  else if (left <= 0) status = 'spent';
  return {
    status,
    budget_usd: invite.budget_usd,
    spent_usd: invite.spent_usd,
    left_usd: left,
    expires_at: invite.expires_at,
  };
}

/** What the invite is for, from what is left of it: null when it can still pay. */
export function inviteRefusal(state: InviteState | null): string | null {
  if (!state) return NO_INVITE;
  if (state.status === 'spent') return INVITE_SPENT;
  return state.status === 'active' ? null : INVITE_CLOSED;
}

type AccountHold = SpendHold & { accountUsd: number };

/**
 * The day's ledger, with a credit account on top: a chat holds both or buys nothing. `refusal` says why the
 * account can't pay right now, and `spent` what running out is called.
 */
function creditLedger(
  store: Store,
  account: string,
  o: {
    refusal: () => string | null;
    spent: string;
    /** told what each call really cost, inside the same transaction */
    onSpend?: (usd: number) => void;
  },
  day: BudgetLedger,
  now: () => Date,
): BudgetLedger {
  let refused: string | null = null;
  const reserveAccount = (usd: number): number | null =>
    store.tx(() => {
      refused = o.refusal();
      if (refused) return null;
      const held = store.credit.reserve(account, usd);
      if (held === null) refused = o.spent;
      return held;
    });
  return {
    spentToday: () => day.spentToday(),
    add: (usd) => day.add(usd),
    async reserve(usd, capUsd) {
      const accountUsd = reserveAccount(usd);
      if (accountUsd === null) return null;
      const release = () => store.credit.settle(account, accountUsd, 0);
      let hold: SpendHold | null;
      try {
        hold = await day.reserve(usd, capUsd);
      } catch (e) {
        release();
        throw e;
      }
      if (!hold) {
        release();
        return null;
      }
      return { ...hold, accountUsd } satisfies AccountHold;
    },
    async settle(hold, actualUsd) {
      await day.settle(hold, actualUsd);
      const at = now().toISOString();
      store.tx(() => {
        store.credit.settle(account, (hold as AccountHold).accountUsd, 0);
        if (actualUsd <= 0) return;
        store.credit.apply({
          id: randomUUID(),
          account_key: account,
          delta_usd: -actualUsd,
          reason: 'model call',
          at,
        });
        o.onSpend?.(actualUsd);
      });
    },
    refusal: () => (refused ? { message: refused, hint: CONNECT_HINT } : null),
  };
}

/** The day's ledger, with this invite's budget on top. */
export function inviteLedger(
  store: Store,
  id: string,
  day: BudgetLedger,
  now: () => Date = () => new Date(),
): BudgetLedger {
  return creditLedger(
    store,
    accountOf(id),
    {
      refusal: () => inviteRefusal(inviteState(store, id, now())),
      spent: INVITE_SPENT,
      onSpend: (usd) => store.invite.addSpent(id, usd),
    },
    day,
    now,
  );
}

// A person's own credit (T374). It belongs to the person, not to a session or a wallet: any of their wallets
// and any browser reach it, and it needs no invite. scripts/fund-person.ts sets it.
const personAccount = (person: string) => `person:${person}`;
const FUNDED = 'funded';

export interface PersonCredit {
  /** everything ever put in */
  funded_usd: number;
  /** what the calls that have ended really cost */
  spent_usd: number;
  /** what the next chat can draw on: less what's spent, and what's held for calls now */
  left_usd: number;
}

const fundedOf = (store: Store, account: string) =>
  store.credit
    .entries(account)
    .filter((e) => e.reason === FUNDED)
    .reduce((sum, e) => sum + e.delta_usd, 0);

/** Null for a person with no credit account: they're treated as anyone else. */
export function personCredit(store: Store, person: string): PersonCredit | null {
  const account = personAccount(person);
  const credit = store.credit.get(account);
  if (!credit) return null;
  const funded = fundedOf(store, account);
  const free = credit.balance_usd - credit.reserved_usd;
  return {
    funded_usd: funded,
    spent_usd: Math.max(0, funded - credit.balance_usd),
    left_usd: free < DUST_USD ? 0 : free,
  };
}

/**
 * Sets what this person has been given in all, whatever they've spent, so it can be raised, lowered or
 * run again with no change. What's spent stays spent.
 */
export function fundPerson(
  store: Store,
  person: string,
  totalUsd: number,
  now: Date = new Date(),
): PersonCredit {
  if (!Number.isFinite(totalUsd) || totalUsd < 0) {
    throw new Error('the total must be a number of dollars, $0 or more');
  }
  if (!store.person.get(person)) throw new Error(`no person ${person}`);
  const account = personAccount(person);
  return store.tx(() => {
    const change = totalUsd - fundedOf(store, account);
    if (Math.abs(change) >= DUST_USD) {
      store.credit.apply({
        id: `fund:${randomUUID()}`,
        account_key: account,
        delta_usd: change,
        reason: FUNDED,
        at: now.toISOString(),
      });
    }
    return personCredit(store, person) as PersonCredit;
  });
}

/** The day's ledger, with this person's credit on top. */
export function personLedger(
  store: Store,
  person: string,
  day: BudgetLedger,
  now: () => Date = () => new Date(),
): BudgetLedger {
  return creditLedger(
    store,
    personAccount(person),
    {
      refusal: () => ((personCredit(store, person)?.left_usd ?? 0) > 0 ? null : CREDIT_SPENT),
      spent: CREDIT_SPENT,
    },
    day,
    now,
  );
}

/** <stateDir>/private.db for a script. Throws when it can't be written, so nothing is lost silently. */
export const openPrivateStore = (stateDir: string): Store =>
  openStore(join(stateDir, 'private.db'));
