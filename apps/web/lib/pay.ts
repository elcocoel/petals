// Paying for Petals' agent in NEAR (B, Elco, 9 Nov: "build the payment step"). The visitor's credit is
// kept in dollars by the server (GET /api/v1/me, `credit`) and shown in dollars, NEAR beside at today's price (GET
// /api/v1/pay). Out of credit, the chat shows one way to add some, where the person meets it: the wallet
// sends NEAR to Petals' account, and the server checks that transfer on chain (POST /api/v1/pay). Pure.
// The words are drafts, shipped on Elco's word (9 Nov: "Ship the drafts, I'll change them later").

/** The visitor's credit, as the server keeps it. Null until their first top-up. */
export interface Credit {
  funded_usd: number;
  spent_usd: number;
  left_usd: number;
  usd_per_chat: number;
}

/**
 * Where a payment goes, and NEAR's price now (null if it can't be read). With the credit contract (Elco,
 * 9 Nov), `method` is 'deposit': the NEAR stays the person's, held under their account in the contract,
 * and `credit` is what it holds now, read from the chain. Without it, a plain transfer to Petals.
 */
export interface PayInfo {
  network: 'mainnet' | 'testnet';
  receiver: string;
  near_usd: number | null;
  method?: 'deposit' | null;
  credit?: Credit | null;
}

/** One action, as a wallet takes it. */
export type PayAction =
  | { type: 'Transfer'; params: { deposit: string } }
  | {
      type: 'FunctionCall';
      params: { methodName: string; args: Record<string, string>; gas: string; deposit: string };
    };

/** What the wallet is asked to send for `yocto`: a deposit into the contract, or a plain transfer. */
export function payAction(info: PayInfo, yocto: string): PayAction {
  return info.method === 'deposit'
    ? {
        type: 'FunctionCall',
        params: { methodName: 'deposit', args: {}, gas: '30000000000000', deposit: yocto },
      }
    : { type: 'Transfer', params: { deposit: yocto } };
}

/** What one press of the pay button sends, in NEAR, where there's no price to send dollars' worth. */
export const PAY_NEAR = 1;

/** What the pay row offers to add, in dollars, before the person changes it (Elco's mainnet test, #71: about $1). */
export const PAY_USD = 1;

/** NEAR for `usd` dollars at today's price, in thousandths and never less than asked; null without a price. */
export function nearFor(usd: number, near_usd: number | null): number | null {
  if (!near_usd || near_usd <= 0 || !(usd > 0)) return null;
  return Math.ceil((usd / near_usd) * 1000) / 1000;
}

/**
 * A transfer the wallet sent and the server hasn't confirmed yet: kept, in the browser too, so pressing again
 * confirms this one instead of sending a second (wave 5, Elco's mainnet test).
 */
export interface PendingPay {
  network: string;
  account: string;
  hash: string;
  near: number;
}

export const PENDING_KEY = 'petals:pay:pending';

/** NEAR in yoctoNEAR, the unit a transfer is written in, as the exact string a wallet takes. */
export function yoctoOf(near: number): string {
  // thousandths of a NEAR as a whole number, then the other 21 places
  return (BigInt(Math.round(near * 1000)) * 10n ** 21n).toString();
}

/**
 * An amount as people read it (Elco, 10 Nov: dollars first, "since NEAR AI bills dollars", with NEAR beside
 * it at today's price). A balance takes two places; a cost takes the places it needs (three under ten
 * cents, four under a tenth of a cent), so a small cost never reads as nothing. NEAR is null when there's
 * no price to show it in.
 */
export interface Money {
  usd: string;
  near: string | null;
}

const costPlaces = (x: number) => (x === 0 || x >= 0.1 ? 2 : x >= 0.001 ? 3 : 4);

export function money(
  usd: number,
  near_usd: number | null,
  of: 'balance' | 'cost' = 'balance',
): Money {
  const u = Math.max(0, usd);
  const n = near_usd && near_usd > 0 ? u / near_usd : null;
  const at = (x: number) => x.toFixed(of === 'cost' ? costPlaces(x) : 2);
  return { usd: at(u), near: n === null ? null : at(n) };
}

/** Money in words: "$1.00 · 0.28 NEAR", or "$1.00" with no price. The one look, everywhere. */
export const moneyWords = (m: Money) =>
  m.near === null ? `$${m.usd}` : `$${m.usd} · ${m.near} NEAR`;

/** The hash and the account a wallet's answer names, whichever shape the wallet gave. */
export function sentBy(outcome: unknown): { hash: string; account: string } | null {
  const o = outcome as {
    transaction?: { hash?: unknown; signer_id?: unknown };
    transaction_outcome?: { id?: unknown };
  } | null;
  const hash = o?.transaction?.hash ?? o?.transaction_outcome?.id;
  const account = o?.transaction?.signer_id;
  return typeof hash === 'string' && typeof account === 'string' ? { hash, account } : null;
}

/** Where the one payment is: offered, waiting for the wallet, added, or it didn't go through. */
export type PayPhase = 'ready' | 'paying' | 'added' | 'failed';

/** The chat's refusal when the visitor has no credit left (SYSTEMS, B). */
export const PAYMENT_REQUIRED = 'payment_required';

/** Drafts (Elco, 9 Nov: "Ship the drafts, I'll change them later"). */
export const payWords = {
  balance: (m: Money) => `Balance: ${moneyWords(m)}`,
  // credit is kept in dollars, and paid in NEAR or any other token (Elco, 10 Nov)
  out: "You're out of credit for Petals' agent. Add some to keep going.",
  /** Before the first question, with no credit yet (#78, 11 Nov: credit came up only after asking). */
  start: "Petals' agent runs on NEAR AI and is paid as you go. Add some credit to start.",
  addedFirst: (near: string) => `Added ${near} NEAR. Petals' agent is ready.`,
  button: (near: number) => `Add ${near} NEAR`,
  /** what the press sends, in dollars with NEAR beside it at today's price */
  buttonUsd: (m: Money) => `Add ${moneyWords(m)}`,
  amount: 'Dollars to add',
  /** a transfer that went out and isn't confirmed yet: the press confirms it, and sends nothing */
  confirm: 'Confirm my transfer',
  pending: 'Your transfer went out and isn’t confirmed yet. Confirm it: nothing is sent twice.',
  paying: 'Waiting for your wallet…',
  added: (near: string) => `Added ${near} NEAR. Send your question again.`,
  failed: "That payment didn't go through. Try again.",
} as const;
