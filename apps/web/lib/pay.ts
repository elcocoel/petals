// Paying for Petals' agent in NEAR (B, Elco, 9 Nov: "build the payment step"). The visitor's credit is
// kept in dollars by the server (GET /api/v1/me, `credit`) and shown in NEAR at today's price (GET
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

/** Where a payment goes, and NEAR's price now (null if it can't be read). */
export interface PayInfo {
  network: 'mainnet' | 'testnet';
  receiver: string;
  near_usd: number | null;
}

/** What one press of the pay button sends, in NEAR. A proposal, for Elco to set. */
export const PAY_NEAR = 1;

/** NEAR in yoctoNEAR, the unit a transfer is written in, as the exact string a wallet takes. */
export function yoctoOf(near: number): string {
  // thousandths of a NEAR as a whole number, then the other 21 places
  return (BigInt(Math.round(near * 1000)) * 10n ** 21n).toString();
}

/** What's left, in NEAR at today's price, to two places. Null with no credit yet or no price. */
export function nearLeft(credit: Credit | null, near_usd: number | null): string | null {
  if (!credit || !near_usd || near_usd <= 0) return null;
  return (Math.max(0, credit.left_usd) / near_usd).toFixed(2);
}

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
  balance: (near: string) => `Balance: ${near} NEAR`,
  out: "You're out of NEAR for Petals. Add some to keep going.",
  button: (near: number) => `Add ${near} NEAR`,
  paying: 'Waiting for your wallet…',
  added: (near: string) => `Added ${near} NEAR. Send your question again.`,
  failed: "That payment didn't go through. Try again.",
} as const;
