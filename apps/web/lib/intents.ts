// Paying with any token, from any chain, through NEAR Intents. The server's GET /api/v1/pay/tokens lists what
// 1Click swaps; choosing one, POST /api/v1/pay/intents gives an address that takes any amount of it, at or above
// a dollar's worth less slippage, landing as NEAR on the person's balance, and waiting a week; GET
// /api/v1/pay/intents lists their top-ups, what was sent and what landed; GET /api/v1/pay/intents/:deposit says
// where one stands. One plain transfer from whatever wallet they have, on any computer. Pure: what's offered, in
// what order, how it's named, and the words.

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
  /** what the reference lands as, in dollars: beside amount_in_usd, the fees */
  amount_out_usd?: string | number | null;
  deadline?: string;
  usd?: number;
  status: TopUpStatus;
  credited_usd?: number | null;
}

/** One of the person's top-ups, as GET /api/v1/pay/intents lists it, newest first. */
export interface TopUpRow {
  deposit_address: string;
  created_at: string;
  origin_asset: string | null;
  deadline: string | null;
  status: TopUpStatus | string;
  /** the token amount as sent, once 1Click saw it */
  sent: string | null;
  sent_usd: string | null;
  /** what reached their balance, once it landed */
  landed_near: string | null;
  landed_usd: string | null;
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

/** Below the address's dollar reference, by this much, a transfer is still taken (the server's slippage). */
const SLIPPAGE = 0.01;

/** The chains most people hold on, first, in this order; the rest after them, the most tokens first. */
const CHAINS_FIRST = [
  'eth',
  'base',
  'sol',
  'arb',
  'near',
  'tron',
  'bsc',
  'btc',
  'pol',
  'op',
  'avax',
];

/** On a chain, what most people hold first, in this order. */
const TOKENS_FIRST = ['USDC', 'USDT', 'ETH', 'BTC', 'SOL', 'NEAR', 'WNEAR'];

/** 1Click still lists a token it's replaced, so it goes last. */
const deprecated = (t: PayToken) => /\(DEPRECATED\)$/i.test(t.symbol);

const finds = (q: string, t: PayToken) =>
  !q || t.symbol.toLowerCase().includes(q) || chainName(t.chain).toLowerCase().includes(q);

const firstOf = (list: readonly string[], v: string) => {
  const i = list.indexOf(v);
  return i === -1 ? list.length : i;
};

/** The chains with a token the search finds (all of them with none), the common ones first. */
export function chainsOf(
  tokens: readonly PayToken[],
  search = '',
): { chain: string; count: number }[] {
  const q = search.trim().toLowerCase();
  const count = new Map<string, number>();
  for (const t of tokens) if (finds(q, t)) count.set(t.chain, (count.get(t.chain) ?? 0) + 1);
  return [...count.entries()]
    .map(([chain, n]) => ({ chain, count: n }))
    .sort(
      (a, b) =>
        firstOf(CHAINS_FIRST, a.chain) - firstOf(CHAINS_FIRST, b.chain) ||
        b.count - a.count ||
        chainName(a.chain).localeCompare(chainName(b.chain)),
    );
}

/** One chain's tokens the search finds: what most people hold first, the replaced ones last. */
export function tokensOn(tokens: readonly PayToken[], chain: string, search = ''): PayToken[] {
  const q = search.trim().toLowerCase();
  return tokens
    .filter((t) => t.chain === chain && finds(q, t))
    .sort(
      (a, b) =>
        Number(deprecated(a)) - Number(deprecated(b)) ||
        firstOf(TOKENS_FIRST, a.symbol.toUpperCase()) -
          firstOf(TOKENS_FIRST, b.symbol.toUpperCase()) ||
        a.symbol.localeCompare(b.symbol, undefined, { sensitivity: 'base' }),
    );
}

/** The chain the list opens on: one the person has a wallet on, Ethereum's first, else NEAR. */
export function homeChain(walletChains: readonly string[]): string {
  if (walletChains.includes('Ethereum')) return 'eth';
  if (walletChains.includes('Solana')) return 'sol';
  return 'near';
}

/** An amount as people write it: four significant figures, no trailing zeros. */
const figure = (n: number) => String(Number(n.toPrecision(4)));

/** A day as people say it where they are: Fri 21 Nov. */
function dayWords(at: string | null | undefined): string | null {
  if (!at) return null;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Under the address, in one line: the fees, the least it takes and until when, from the address's own
 * reference (a dollar's worth of the token, and what that lands as).
 */
export function quoteLine(t: TopUp, symbol: string): string {
  const parts: string[] = [];
  const usdIn = Number(t.amount_in_usd);
  const usdOut = Number(t.amount_out_usd);
  if (usdIn > 0 && usdOut > 0) {
    const pct = Math.max(0, (1 - usdOut / usdIn) * 100);
    parts.push(intentWords.fees(pct < 0.1 ? '0.1' : pct.toFixed(1)));
  }
  const least = Number(t.amount_in_formatted);
  if (least > 0) parts.push(intentWords.least(figure(least * (1 - SLIPPAGE)), symbol));
  const until = dayWords(t.deadline);
  if (until) parts.push(intentWords.until(until));
  return parts.join(' · ');
}

/** A top-up in the history: when, what was sent, the NEAR it should land as at today's price, what landed. */
export interface HistoryRow {
  key: string;
  when: string;
  sent: string;
  expected: string;
  landed: string;
  status: string;
}

/**
 * The person's top-ups with something sent: an address asked for and never paid isn't one. Expected is what
 * was sent, in NEAR at today's price, before fees; landed is what reached their balance.
 */
export function historyRows(
  rows: readonly TopUpRow[],
  tokens: readonly PayToken[],
  nearUsd: number | null,
): HistoryRow[] {
  return rows
    .filter((r) => r.sent !== null || r.status !== 'PENDING_DEPOSIT')
    .map((r) => {
      const token = tokens.find((t) => t.asset === r.origin_asset);
      const sentUsd = Number(r.sent_usd);
      return {
        key: r.deposit_address,
        when: dayWords(r.created_at) ?? '',
        sent:
          r.sent !== null
            ? token
              ? intentWords.amountOn(figure(Number(r.sent)), token.symbol, chainName(token.chain))
              : figure(Number(r.sent))
            : intentWords.nothing,
        expected:
          sentUsd > 0 && nearUsd
            ? intentWords.near(figure(sentUsd / nearUsd))
            : intentWords.nothing,
        landed:
          r.landed_near !== null
            ? intentWords.near(figure(Number(r.landed_near)))
            : intentWords.nothing,
        status:
          r.status in intentWords.state
            ? intentWords.state[r.status as TopUpStatus]
            : String(r.status),
      };
    });
}

export const intentWords = {
  search: 'Search tokens and chains',
  chain: 'Chain',
  token: 'Token',
  loading: 'Reading the tokens…',
  none: 'No token by that name.',
  /** The address's place before a token is chosen. */
  pick: 'Pick a token to get its address.',
  asking: 'Getting its address…',
  send: (symbol: string, chain: string) =>
    `Send any amount of ${symbol} on ${chain} to this address. It lands as NEAR on your balance.`,
  memo: 'With this memo:',
  fees: (pct: string) => `Fees about ${pct}%`,
  least: (amount: string, symbol: string) => `at least ${amount} ${symbol}`,
  until: (day: string) => `open until ${day}`,
  refund: (chain: string) => `Your address on ${chain}, where anything not swapped goes back`,
  /** Under the refund field: Enter, or leaving it, asks again. */
  refundThen: 'Then press Enter.',
  copy: 'Copy',
  copied: 'Copied',
  history: 'Your top-ups',
  historyNone: 'Nothing sent yet. What you send shows here, with what landed.',
  heads: { when: 'When', sent: 'Sent', expected: 'Expected', landed: 'Landed', status: 'Status' },
  amountOn: (amount: string, symbol: string, chain: string) => `${amount} ${symbol} on ${chain}`,
  near: (near: string) => `${near} NEAR`,
  nothing: '–',
  /** 1Click's states, said plainly. */
  state: {
    PENDING_DEPOSIT: 'Waiting for your transfer',
    KNOWN_DEPOSIT_TX: 'Arrived, swapping',
    PROCESSING: 'Swapping',
    SUCCESS: 'Landed',
    INCOMPLETE_DEPOSIT: 'Below the least it takes: going back',
    REFUNDED: 'Sent back',
    FAILED: 'Didn’t go through',
  } as const,
} as const;

/** One chain in the list beside the tokens. */
export interface ChainChoice {
  chain: string;
  name: string;
  icon: string | null;
}

/** One token in the chain's list. */
export interface TokenPick {
  asset: string;
  symbol: string;
  icon: string | null;
}

/** Paying with another token, as the money panel shows it (viewmodels/useTopUp.ts makes it). */
export interface TopUpView {
  search: string;
  /** null while the list is on its way */
  chains: ChainChoice[] | null;
  chain: string;
  tokens: TokenPick[];
  asset: string;
  /** asking for the chosen token's address */
  asking: boolean;
  /** where to send the chosen token, once the server gave it */
  address: {
    line: string;
    address: string;
    memo: string | null;
    quote: string;
    /** where it stands, once something arrived */
    status: string | null;
  } | null;
  /** the server asked for a refund address on this chain: the one field, then Enter */
  refund: { label: string; value: string } | null;
  error: string | null;
  copied: 'address' | 'memo' | null;
  /** null while it's being read */
  history: HistoryRow[] | null;
  actions: {
    search: (q: string) => void;
    chooseChain: (chain: string) => void;
    choose: (asset: string) => void;
    setRefund: (v: string) => void;
    sendRefund: () => void;
    copy: (which: 'address' | 'memo', text: string) => void;
  };
}
