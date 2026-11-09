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
  "Your credit is used up, so Petal's agent stopped here and nothing more will be spent. Top up from your wallet to carry on, or carry on with your own agent.";
/** A signed-in person with no credit and no invite (9 Nov): Petals' agent is paid for from their wallet. */
export const PAYMENT_NEEDED =
  "Petals' agent runs on NEAR AI and is paid for in NEAR from your wallet, so nothing was spent. Top up to start, or use your own agent.";
/** Where to pay, for a caller that isn't the page. */
export const PAY_HINT =
  'GET /api/v1/pay says where to send NEAR; POST it the transaction to add it.';

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

export async function mintInvite(
  store: Store,
  o: { usd: number; days?: number; now?: Date },
): Promise<MintedInvite> {
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
  await store.tx(async () => {
    await store.invite.create({ id, token_hash: hashToken(token), budget_usd: o.usd, expires_at });
    await store.credit.apply({
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
export async function revokeInvite(
  store: Store,
  id: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!(await store.invite.get(id))) return false;
  await store.invite.revoke(id, now.toISOString());
  return true;
}

export async function inviteState(
  store: Store,
  id: string,
  now: Date = new Date(),
): Promise<InviteState | null> {
  const invite = await store.invite.get(id);
  if (!invite) return null;
  const credit = await store.credit.get(accountOf(id));
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
    refusal: () => Promise<string | null>;
    spent: string;
    /** the code a refusal carries; default budget_exhausted */
    code?: 'budget_exhausted' | 'payment_required';
    hint?: string;
    /** told what each call really cost, inside the same transaction */
    onSpend?: (usd: number) => Promise<void>;
  },
  day: BudgetLedger,
  now: () => Date,
): BudgetLedger {
  let refused: string | null = null;
  const reserveAccount = (usd: number): Promise<number | null> =>
    store.tx(async () => {
      refused = await o.refusal();
      if (refused) return null;
      const held = await store.credit.reserve(account, usd);
      if (held === null) refused = o.spent;
      return held;
    });
  return {
    spentToday: () => day.spentToday(),
    add: (usd) => day.add(usd),
    async reserve(usd, capUsd) {
      const accountUsd = await reserveAccount(usd);
      if (accountUsd === null) return null;
      const release = () => store.credit.settle(account, accountUsd, 0);
      let hold: SpendHold | null;
      try {
        hold = await day.reserve(usd, capUsd);
      } catch (e) {
        await release();
        throw e;
      }
      if (!hold) {
        await release();
        return null;
      }
      return { ...hold, accountUsd } satisfies AccountHold;
    },
    async settle(hold, actualUsd) {
      await day.settle(hold, actualUsd);
      const at = now().toISOString();
      await store.tx(async () => {
        await store.credit.settle(account, (hold as AccountHold).accountUsd, 0);
        if (actualUsd <= 0) return;
        await store.credit.apply({
          id: randomUUID(),
          account_key: account,
          delta_usd: -actualUsd,
          reason: 'model call',
          at,
        });
        await o.onSpend?.(actualUsd);
      });
    },
    refusal: () =>
      refused
        ? { message: refused, hint: o.hint ?? CONNECT_HINT, ...(o.code ? { code: o.code } : {}) }
        : null,
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
      refusal: async () => inviteRefusal(await inviteState(store, id, now())),
      spent: INVITE_SPENT,
      onSpend: (usd) => store.invite.addSpent(id, usd),
    },
    day,
    now,
  );
}

// A person's own credit (T374). It belongs to the person, not to a session or a wallet: any of their wallets
// and any browser reach it, and it needs no invite. scripts/fund-person.ts sets it, and since 9 Nov the
// person adds to it themselves by paying in NEAR (payPerson).
const personAccount = (person: string) => `person:${person}`;
const FUNDED = 'funded';
const PAID = 'paid';

export interface PersonCredit {
  /** everything ever put in */
  funded_usd: number;
  /** what the calls that have ended really cost */
  spent_usd: number;
  /** what the next chat can draw on: less what's spent, and what's held for calls now */
  left_usd: number;
}

/** What was put in by `reasons`: by default both kinds, what Elco gave and what the person paid. */
const fundedOf = async (store: Store, account: string, reasons = [FUNDED, PAID]) =>
  (await store.credit.entries(account))
    .filter((e) => reasons.includes(e.reason))
    .reduce((sum, e) => sum + e.delta_usd, 0);

/** Null for a person with no credit account: they're treated as anyone else. */
export async function personCredit(store: Store, person: string): Promise<PersonCredit | null> {
  const account = personAccount(person);
  const credit = await store.credit.get(account);
  if (!credit) return null;
  const funded = await fundedOf(store, account);
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
export async function fundPerson(
  store: Store,
  person: string,
  totalUsd: number,
  now: Date = new Date(),
): Promise<PersonCredit> {
  if (!Number.isFinite(totalUsd) || totalUsd < 0) {
    throw new Error('the total must be a number of dollars, $0 or more');
  }
  if (!(await store.person.get(person))) throw new Error(`no person ${person}`);
  const account = personAccount(person);
  return store.tx(async () => {
    // only what was given: what the person paid stays theirs, whatever this is set to
    const change = totalUsd - (await fundedOf(store, account, [FUNDED]));
    if (Math.abs(change) >= DUST_USD) {
      await store.credit.apply({
        id: `fund:${randomUUID()}`,
        account_key: account,
        delta_usd: change,
        reason: FUNDED,
        at: now.toISOString(),
      });
    }
    return (await personCredit(store, person)) as PersonCredit;
  });
}

/**
 * A payment the chain has shown (9 Nov): `usd` onto this person's credit, under `id`, which counts once
 * however often it's sent. Returns what it added (0 the second time) and the credit after.
 */
export async function payPerson(
  store: Store,
  person: string,
  o: { id: string; usd: number; now?: Date },
): Promise<{ added_usd: number; credit: PersonCredit }> {
  if (!Number.isFinite(o.usd) || o.usd < 0) throw new Error('a payment is a number of dollars');
  const fresh = await store.credit.apply({
    id: o.id,
    account_key: personAccount(person),
    delta_usd: o.usd,
    reason: PAID,
    at: (o.now ?? new Date()).toISOString(),
  });
  return {
    added_usd: fresh ? o.usd : 0,
    credit: (await personCredit(store, person)) as PersonCredit,
  };
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
      refusal: async () =>
        ((await personCredit(store, person))?.left_usd ?? 0) > 0 ? null : CREDIT_SPENT,
      spent: CREDIT_SPENT,
      code: 'payment_required',
      hint: PAY_HINT,
    },
    day,
    now,
  );
}

/**
 * The private store for a script: the database at PETAL_DATABASE_URL when it's set, as the server would
 * use, else <stateDir>/private.db. Throws when it can't be opened, so nothing is lost silently.
 */
export const openPrivateStore = (
  stateDir: string,
  databaseUrl: string | undefined = process.env.PETAL_DATABASE_URL?.trim() || undefined,
): Store => openStore(databaseUrl ?? join(stateDir, 'private.db'));
