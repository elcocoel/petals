// The profile page, where people gain credibility as investigators and researchers (the investigator's
// card): the person and what backs them. The wallets they proved by signing in, the claims they and their
// agents have kept about accounts, by how each is known, and their conversations. Pure: the words and the
// arithmetic are here, and the views only lay them out.
import { type AnnotationRow, type ClaimLine, claimLines } from './claim-lines.ts';
import { shortWhen } from './conversation-list.ts';
import { chainLabel, dateLabel, shortId } from './flower-view.ts';
import { shownAccount } from './lobby-view.ts';
import { type Money, money, moneyWords } from './pay.ts';

export const profilePageWords = {
  wallets: 'Wallets',
  /** A wallet's badge: it signed Petals' message, so it's the person's; set against a link's Declared. */
  proven: 'Proven',
  /** Under a wallet: when it signed. */
  provedOn: (date: string) => `Signed in on ${date}`,
  walletsNote: 'Each one signed a message with its own key, so it’s proven yours.',
  /** On an Ethereum or Solana wallet's row: takes it off the profile (the NEAR account is the profile). */
  disconnect: 'Disconnect',
  /** Once it's off. */
  disconnected: (shown: string) => `Disconnected ${shown}. It no longer signs in to this profile.`,
  /** The Wallets widget's one action: adding more wallets. */
  addWallet: 'Add a wallet',
  /** The two ways to add one (buttons say Connect; /make's door says the same). */
  connectNear: 'Connect a NEAR wallet',
  connectEvm: 'Connect an Ethereum wallet',
  connectSolana: 'Connect a Solana wallet',
  /** Over the three buttons, each its chain's logo and name. */
  connectAnother: 'Connect a wallet',
  near: 'NEAR',
  evm: 'Ethereum',
  solana: 'Solana',
  adding: 'Waiting for your wallet…',
  /** While a wallet is asked: which one, so the person knows where to answer. */
  waitingFor: (wallet: string) => `Waiting for ${wallet}. Answer it there.`,
  /** Stops waiting for a wallet that doesn't answer; the wallet's own request stays where it is. */
  stop: 'Stop waiting',
  /** Puts the pick of wallets away. */
  cancel: 'Cancel',
  /** Several wallets of one kind in this browser: the person picks one by name. */
  whichWallet: 'Which wallet?',
  /** The NEAR wallet, by the name its picker gives it. */
  nearWallet: 'Your NEAR wallet',
  /** The phone, first in the pick: any wallet on it that connects by a QR code (WalletConnect). */
  phone: 'Your phone (scan a QR code)',
  /** The phone's wallet before it has said which it is: waited for, and refusing. */
  phoneWallet: 'your phone',
  phoneRefused: 'Your phone',
  /** Over the QR code. */
  scan: 'Scan this with your phone’s wallet: MetaMask, Phantom, Trust or any wallet that connects with WalletConnect.',
  qrAlt: 'A QR code to connect your phone’s wallet',
  /** What a wallet said, plainly: it was refused, it's busy, or its own words. */
  declined: (wallet: string) => `${wallet} declined. Nothing was added.`,
  busy: (wallet: string) =>
    `${wallet} already has a request open. Open ${wallet}, answer it, then try again.`,
  answered: (wallet: string, why: string) => `${wallet} answered: ${why}`,
  notAdded: 'That wallet wasn’t added. Try again.',
  claims: 'Claims',
  /** How many accounts the claims are about. */
  about: (n: number) => (n === 1 ? 'About 1 account' : `About ${n} accounts`),
  claimsNone:
    'No claims yet. What you and your agents keep about accounts, a name, a note or a link, shows here.',
  conversations: 'Conversations',
  conversationsNone: 'No conversations yet. The networks you map in a conversation show here.',
  unread: 'This can’t be read right now.',
  reading: 'Reading…',
} as const;

/** Each chain's logo for the Wallets card's buttons, as a data URL, or null where there's none. */
export interface WalletLogos {
  near: string | null;
  evm: string | null;
  solana: string | null;
}

/** Which wallet to add: NEAR, an EVM one, or a Solana one. */
export type WalletKind = 'near' | 'evm' | 'solana';

/** One wallet in this browser, as the person picks it (lib/evm-wallet.ts). */
export interface WalletPick {
  id: string;
  name: string;
  icon: string | null;
}

/**
 * Where adding a wallet is: offered; several wallets of one kind, to pick from by name; waiting for the one
 * asked, named; or it didn't go through and why.
 */
export type AddWalletPhase =
  | { kind: 'ready' }
  | { kind: 'choose'; chain: 'evm' | 'solana'; wallets: WalletPick[] }
  | { kind: 'adding'; wallet: string }
  /** A phone wallet's QR code, shown until the phone says yes: a picture's data: URL. */
  | { kind: 'scan'; qr: string }
  | { kind: 'failed'; why: string };

/**
 * What a wallet's refusal says, plainly, with the wallet's name: the person said no (EIP-1193's 4001, or a
 * wallet's own words for it), it already has a request open (-32002), or whatever else it said, as it said it.
 */
export function walletRefusal(
  wallet: string,
  e: unknown,
  /** what a no says, where the page asked for something other than adding a wallet */
  declined: (wallet: string) => string = profilePageWords.declined,
): string {
  const code = (e as { code?: unknown } | null)?.code;
  const said =
    e instanceof Error
      ? e.message
      : typeof (e as { message?: unknown } | null)?.message === 'string'
        ? (e as { message: string }).message
        : String(e);
  if (code === 4001 || /reject|denied|declin|cancel|closed/i.test(said)) return declined(wallet);
  if (code === -32002) return profilePageWords.busy(wallet);
  return profilePageWords.answered(wallet, said || profilePageWords.notAdded);
}

/** A wallet as GET /api/v1/me lists it. */
export interface ProvenWallet {
  network: string;
  account_id: string;
  proved_at: string;
  /** the wallet in CAIP-10, as a publication names its author */
  author?: string;
}

/** A wallet, as the Wallets card shows it. */
export interface WalletRow {
  key: string;
  shown: string;
  full: string;
  /** The chain's name, as a badge. */
  chain: string;
  /** "Signed in on 11 Nov 2026" */
  when: string;
  /** An Ethereum or Solana wallet's CAIP-10, for Disconnect; absent for NEAR, which is the profile. */
  caip10?: string;
}

/** A proven wallet's chain, by name, from the network the server names it on. */
export const walletChain = (network: string) =>
  network === 'eip155'
    ? 'Ethereum'
    : network === 'solana'
      ? 'Solana'
      : network === 'testnet'
        ? 'NEAR testnet'
        : 'NEAR';

export function walletRows(wallets: readonly ProvenWallet[]): WalletRow[] {
  return wallets.map((w) => ({
    key: `${w.network}:${w.account_id}`,
    ...(w.network === 'eip155' || w.network === 'solana'
      ? { shown: shortId(w.account_id), full: w.account_id }
      : shownAccount(w.account_id)),
    chain: walletChain(w.network),
    when: profilePageWords.provedOn(dateLabel(w.proved_at)),
    ...((w.network === 'eip155' || w.network === 'solana') && w.author ? { caip10: w.author } : {}),
  }));
}

/** What a claim is about: `eip155:100:0xabc…` as the account, shortened, and its chain's name. */
export function subjectOf(ref: string): { shown: string; full: string; chain: string } {
  const at = ref.lastIndexOf(':');
  const id = at === -1 ? ref : ref.slice(at + 1);
  const chain = at === -1 ? '' : ref.slice(0, at);
  return { shown: shortId(id), full: id, chain: chain ? chainLabel(chain) : '' };
}

/** The claims about one account, as the Claims card shows them. */
export interface ClaimGroup {
  key: string;
  subject: { shown: string; full: string; chain: string };
  lines: ClaimLine[];
}

/** The ways a claim can be known, in the order the card counts them. */
const KINDS = ['observed', 'declared', 'sourced', 'stated', 'inferred'] as const;

/** The claims card: how many of each kind, then every claim, by the account it's about, newest account first. */
export interface ClaimsView {
  total: number;
  /** "12 sourced", in KINDS' order, only the kinds there are. */
  kinds: { kind: string; count: number }[];
  groups: ClaimGroup[];
}

export function claimsView(rows: readonly AnnotationRow[]): ClaimsView {
  // the accounts in the order of their newest claim, newest first
  const newest = new Map<string, string>();
  for (const r of rows) {
    const s = r.claim.subject;
    if ((newest.get(s) ?? '') <= r.added_at) newest.set(s, r.added_at);
  }
  const groups = [...newest.keys()]
    .sort((a, b) => ((newest.get(a) ?? '') < (newest.get(b) ?? '') ? 1 : -1))
    .map((s) => ({ key: s, subject: subjectOf(s), lines: claimLines(rows, s) }))
    .filter((g) => g.lines.length > 0);
  const counted = new Map<string, number>();
  for (const g of groups)
    for (const l of g.lines) counted.set(l.kind, (counted.get(l.kind) ?? 0) + 1);
  const known: readonly string[] = KINDS;
  const kinds = [...KINDS, ...[...counted.keys()].filter((k) => !known.includes(k))]
    .filter((k) => counted.has(k))
    .map((k) => ({ kind: k, count: counted.get(k) ?? 0 }));
  return { total: groups.reduce((n, g) => n + g.lines.length, 0), kinds, groups };
}

/**
 * The Balance widget's usage, a full usage widget: every model call charged to the person (usage/v1,
 * GET /api/v1/me/usage), newest first,
 * with its tokens, what it cost, and whether NEAR AI's own bill has confirmed it.
 */
export const usageWords = {
  title: 'Usage',
  summary: (calls: number, spent: string) =>
    `${calls === 1 ? '1 call' : `${calls} calls`}, ${spent} spent`,
  none: 'No calls yet. Each answer Petals’ agent gives you shows here with what it cost.',
  tokens: (inn: string, out: string) => `${inn} in · ${out} out`,
  /** NEAR AI's own bill confirmed it. */
  billed: 'billed',
  /** Counted at the list price, before NEAR AI's bill. */
  counted: 'counted',
  reading: 'Reading…',
  unread: 'Your usage can’t be read right now.',
} as const;

/** A call as GET /api/v1/me/usage lists it (usage/v1): only what the widget reads. */
export interface UsageCall {
  call: string | null;
  completion: string;
  at: string;
  model: string;
  tokens: { in: number; cached: number; out: number };
  charged_usd: number;
  reconciled_at: string | null;
}

export interface UsageView {
  /** "31 calls, $0.42 · 0.12 NEAR spent" */
  summary: string;
  rows: {
    key: string;
    model: string;
    when: string;
    tokens: string;
    cost: Money;
    billed: boolean;
  }[];
}

const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function usageView(
  calls: readonly UsageCall[],
  spentUsd: number,
  nearUsd: number | null,
  now: Date = new Date(),
): UsageView {
  return {
    summary: usageWords.summary(calls.length, moneyWords(money(spentUsd, nearUsd, 'cost'))),
    rows: calls.map((c) => ({
      key: c.call ?? c.completion,
      model: c.model.split('/').at(-1) ?? c.model,
      when: shortWhen(c.at, now),
      tokens: usageWords.tokens(group(c.tokens.in), group(c.tokens.out)),
      cost: money(c.charged_usd, nearUsd, 'cost'),
      billed: c.reconciled_at !== null,
    })),
  };
}
