// Paying with any token, from any chain, through NEAR Intents. The server's GET /api/v1/pay/tokens lists what
// 1Click swaps; POST /api/v1/pay/intents gives a deposit address and the exact amount to send; GET
// /api/v1/pay/intents/:deposit says where it stands, and at SUCCESS the dollars are on the person's credit.
// One plain transfer from whatever wallet they have, on any computer. Pure: what's offered, how it's named,
// and the words.

/** A token a person can pay with, as GET /api/v1/pay/tokens lists it. */
export interface PayToken {
  /** 1Click's id for it, sent back as origin_asset */
  asset: string;
  chain: string;
  symbol: string;
  decimals: number;
  usd: number | null;
}

/** 1Click's own words for where a swap stands. */
export type TopUpStatus =
  | 'PENDING_DEPOSIT'
  | 'KNOWN_DEPOSIT_TX'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'INCOMPLETE_DEPOSIT'
  | 'REFUNDED'
  | 'FAILED';

/** A top-up as the server keeps it: where to send, how much, by when, and where it stands. */
export interface TopUp {
  deposit_address: string;
  deposit_memo?: string | null;
  origin_asset?: string;
  amount_in_formatted?: string;
  amount_in_usd?: string | number | null;
  deadline?: string;
  usd?: number;
  status: TopUpStatus;
  credited_usd?: number | null;
}

/** Still on its way: worth reading again. */
export const isUnderWay = (s: TopUpStatus) =>
  s === 'PENDING_DEPOSIT' || s === 'KNOWN_DEPOSIT_TX' || s === 'PROCESSING';

/** 1Click's chain ids, as people say them. One that isn't here is its id, capitalised. */
const CHAINS: Record<string, string> = {
  near: 'NEAR',
  eth: 'Ethereum',
  sol: 'Solana',
  base: 'Base',
  bsc: 'BNB Chain',
  arb: 'Arbitrum',
  op: 'Optimism',
  pol: 'Polygon',
  avax: 'Avalanche',
  gnosis: 'Gnosis',
  btc: 'Bitcoin',
  aptos: 'Aptos',
  sui: 'Sui',
  ton: 'TON',
  tron: 'Tron',
  stellar: 'Stellar',
  starknet: 'Starknet',
  bera: 'Berachain',
  monad: 'Monad',
  xlayer: 'X Layer',
  hypercore: 'Hyperliquid',
  zec: 'Zcash',
  doge: 'Dogecoin',
  xrp: 'XRP Ledger',
  ltc: 'Litecoin',
  cardano: 'Cardano',
};

export const chainName = (chain: string) =>
  CHAINS[chain] ?? `${chain.charAt(0).toUpperCase()}${chain.slice(1)}`;

/** One choice in the token list: "USDC on Base". */
export interface TokenChoice {
  value: string;
  label: string;
}

/**
 * What most people hold, first, so the list doesn't open on two hundred tokens: the dollar
 * stablecoins on the biggest chains, and each big coin on its own chain. A symbol and a chain, in this order.
 */
export const COMMON: readonly (readonly [symbol: string, chain: string])[] = [
  ['USDC', 'eth'],
  ['USDC', 'base'],
  ['USDC', 'sol'],
  ['USDC', 'arb'],
  ['USDC', 'near'],
  ['USDT', 'eth'],
  ['USDT', 'tron'],
  ['USDT', 'sol'],
  ['ETH', 'eth'],
  ['ETH', 'base'],
  ['ETH', 'arb'],
  ['BTC', 'btc'],
  ['SOL', 'sol'],
  ['wNEAR', 'near'],
];

const choiceOf = (t: PayToken): TokenChoice => ({
  value: t.asset,
  label: `${t.symbol} on ${chainName(t.chain)}`,
});

/**
 * The tokens: the common ones first, in their own group, then the rest, a chain's together, the chains with
 * the most tokens first, as 1Click lists each one's.
 */
export function tokenChoices(
  tokens: readonly PayToken[],
): { group: string; choices: TokenChoice[] }[] {
  const common = COMMON.flatMap(([symbol, chain]) =>
    tokens.filter((t) => t.symbol === symbol && t.chain === chain).slice(0, 1),
  );
  const first = new Set(common.map((t) => t.asset));
  const by = new Map<string, PayToken[]>();
  for (const t of tokens) {
    if (!first.has(t.asset)) by.set(t.chain, [...(by.get(t.chain) ?? []), t]);
  }
  const rest = [...by.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([chain, list]) => ({ group: chainName(chain), choices: list.map(choiceOf) }));
  return common.length > 0
    ? [{ group: intentWords.common, choices: common.map(choiceOf) }, ...rest]
    : rest;
}

/** Dollars as typed: a number above 0 and at most 1,000, as the server takes, or null. */
export function dollarsOf(typed: string): number | null {
  const n = Number(typed.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 && n <= 1000 ? Math.round(n * 100) / 100 : null;
}

/** When to send it by, as a time of day where the person is. */
export function untilWords(deadline: string | undefined): string | null {
  if (!deadline) return null;
  const at = new Date(deadline);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export const intentWords = {
  other: 'Pay with another token',
  token: 'Token',
  pick: 'Pick a token and its chain',
  /** The list's first group, what most people hold (tokenChoices). */
  common: 'Common',
  loading: 'Reading the tokens…',
  usd: 'Dollars to add',
  refund: (chain: string) => `Your address on ${chain}, where anything not swapped goes back`,
  get: 'Get the address to send to',
  getting: 'Getting the address…',
  badUsd: 'Dollars above 0, up to 1,000.',
  noRefund: 'Your address on that chain, for anything not swapped.',
  send: (amount: string, symbol: string, chain: string) =>
    `Send exactly ${amount} ${symbol} on ${chain}, in one transfer from any wallet, to:`,
  memo: 'With this memo:',
  before: (time: string) => `Send it before ${time}.`,
  copy: 'Copy',
  copied: 'Copied',
  status: {
    PENDING_DEPOSIT: 'Waiting for your transfer.',
    KNOWN_DEPOSIT_TX: 'Your transfer arrived. Swapping it now.',
    PROCESSING: 'Swapping it now.',
    INCOMPLETE_DEPOSIT: 'Less arrived than asked, so it goes back to your address.',
    REFUNDED: 'It went back to your address.',
    FAILED: "That didn't go through. Try again.",
  } as const,
  added: (usd: number) => `Added $${usd.toFixed(2)}. Send your question again.`,
} as const;

/** What a top-up's state says, in the words above. */
export function statusLine(t: Pick<TopUp, 'status' | 'credited_usd' | 'usd'>): string {
  if (t.status === 'SUCCESS') return intentWords.added(t.credited_usd ?? t.usd ?? 0);
  return intentWords.status[t.status];
}

/** Paying with another token, as the pay row shows it (viewmodels/useTopUp.ts makes it). */
export interface TopUpView {
  open: boolean;
  /** null while the list is on its way */
  groups: { group: string; choices: TokenChoice[] }[] | null;
  asset: string;
  usd: string;
  refund: string;
  refundLabel: string;
  getting: boolean;
  error: string | null;
  sent: {
    line: string;
    address: string;
    memo: string | null;
    before: string | null;
    status: string;
    ended: boolean;
    landed: boolean;
  } | null;
  copied: 'address' | 'memo' | null;
  actions: {
    open: () => void;
    setAsset: (asset: string) => void;
    setUsd: (usd: string) => void;
    setRefund: (refund: string) => void;
    get: () => void;
    copy: (which: 'address' | 'memo', text: string) => void;
    again: () => void;
  };
}
