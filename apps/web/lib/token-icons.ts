// The logos beside a chain or a token when paying with another token: the files in public/icons (web3icons,
// MIT), by 1Click's chain id and by symbol. 1Click's list carries none, so they're keyed here; one with no logo
// is drawn as its first letter. Pure.

/** The chains with a logo in public/icons/chains. */
const CHAINS = new Set([
  'abs',
  'adi',
  'aleo',
  'aptos',
  'arb',
  'avax',
  'base',
  'bch',
  'bera',
  'bsc',
  'btc',
  'cardano',
  'dash',
  'doge',
  'eth',
  'fogo',
  'gnosis',
  'hood',
  'hypercore',
  'ltc',
  'monad',
  'movement',
  'near',
  'op',
  'plasma',
  'pol',
  'scroll',
  'sol',
  'starknet',
  'stellar',
  'sui',
  'ton',
  'tron',
  'xlayer',
  'xrp',
  'zec',
]);

/** The token symbols with a logo in public/icons/tokens. */
const TOKENS = new Set([
  'AAVE',
  'ADA',
  'ADI',
  'ALEO',
  'APT',
  'ARB',
  'AURORA',
  'AVAX',
  'BCH',
  'BERA',
  'BNB',
  'BTC',
  'CBBTC',
  'COW',
  'DAI',
  'DASH',
  'DOGE',
  'ETH',
  'EURE',
  'FOGO',
  'FRAX',
  'GMX',
  'GNO',
  'GRAM',
  'HAPI',
  'KNC',
  'LINK',
  'LTC',
  'MOG',
  'MON',
  'MOVE',
  'NEAR',
  'NPRO',
  'OKB',
  'OP',
  'PEPE',
  'POL',
  'SAFE',
  'SHIB',
  'SOL',
  'SPX',
  'STRK',
  'SUI',
  'SWEAT',
  'TRX',
  'UNI',
  'USDC',
  'USDE',
  'USDT',
  'WBTC',
  'XAUT',
  'XLM',
  'XPL',
  'XRP',
  'ZEC',
]);

/** A wrapped or bridged coin, drawn as the coin. */
const SAME_AS: Record<string, string> = {
  WETH: 'ETH',
  WNEAR: 'NEAR',
  USDT0: 'USDT',
  USDCX: 'USDC',
};

/** A symbol without 1Click's marks: `USDC(DEPRECATED)` is USDC. */
export const bareSymbol = (symbol: string) =>
  symbol.replace(/\s*\(DEPRECATED\)$/i, '').replace(/_$/, '');

export const chainIcon = (chain: string): string | null =>
  CHAINS.has(chain) ? `/icons/chains/${chain}.svg` : null;

export function tokenIcon(symbol: string): string | null {
  const s = bareSymbol(symbol).toUpperCase();
  const drawn = SAME_AS[s] ?? s;
  return TOKENS.has(drawn) ? `/icons/tokens/${drawn}.svg` : null;
}
