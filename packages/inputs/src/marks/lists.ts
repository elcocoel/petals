// The curated lists a mark is checked against (research/org-names-logos-2026-11-11.md, strategy 2): plain files
// their owners keep, read once a run and named by their version, plus Trust Wallet's per-address folders and
// Jupiter's search for Solana. A list that holds an address confirms it's the real token (verified), and brings
// what the chain doesn't say, a logo above all.
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export type Fetch = typeof globalThis.fetch;

/** What a list says about one address. */
export interface Listed {
  /** the list, in a word: uniswap, coingecko, cow, superchain, arbitrum, trustwallet, jupiter, defillama */
  source: string;
  /** the list and its version, or the page */
  ref: string;
  /** does holding it make the address verified: a curated list does; Jupiter only for its verified tokens */
  curated: boolean;
  name: string | null;
  symbol: string | null;
  logo: string | null;
}

interface TokenList {
  name?: string;
  version?: { major: number; minor: number; patch: number };
  tokens?: { chainId: number; address: string; name?: string; symbol?: string; logoURI?: string }[];
}

/** The chain a card names, as each list knows it. */
export const LIST_CHAINS: Record<
  string,
  { chainId: number; coingecko: string; trustwallet: string; llama: string; lists: string[] }
> = {
  ethereum: {
    chainId: 1,
    coingecko: 'uniswap',
    trustwallet: 'ethereum',
    llama: '',
    lists: ['uniswap', 'cow'],
  },
  base: {
    chainId: 8453,
    coingecko: 'base',
    trustwallet: 'base',
    llama: 'base',
    lists: ['uniswap', 'superchain', 'cow'],
  },
  arbitrum: {
    chainId: 42161,
    coingecko: 'arbitrum-one',
    trustwallet: 'arbitrum',
    llama: 'arbitrum',
    lists: ['uniswap', 'arbitrum', 'cow'],
  },
  gnosis: { chainId: 100, coingecko: 'xdai', trustwallet: 'xdai', llama: 'xdai', lists: ['cow'] },
  solana: {
    chainId: 501000101,
    coingecko: 'solana',
    trustwallet: 'solana',
    llama: 'solana',
    lists: ['uniswap'],
  },
};

const LIST_URLS: Record<string, string> = {
  uniswap: 'https://tokens.uniswap.org',
  cow: 'https://files.cow.fi/tokens/CowSwap.json',
  superchain: 'https://static.optimism.io/optimism.tokenlist.json',
  arbitrum: 'https://bridge.arbitrum.io/token-list-42161.json',
};
const coingeckoUrl = (slug: string) => `https://tokens.coingecko.com/${slug}/all.json`;
interface GeckoCoin {
  id: string;
  platforms?: Record<string, string | null>;
}
interface GeckoMarket {
  name?: string;
  symbol?: string;
  image?: string;
}
const GECKO_COINS = 'https://api.coingecko.com/api/v3/coins/list?include_platform=true';
const GECKO_MARKETS = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=';
const TRUST_WALLET = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains';
const LLAMA = 'https://api.llama.fi/protocols';
const JUPITER = 'https://lite-api.jup.ag/tokens/v2/search?query=';

/** EIP-55: the mixed-case address Trust Wallet's folders are named by. */
export function checksumAddress(address: string): string {
  const a = address.toLowerCase().replace(/^0x/, '');
  const hash = bytesToHex(keccak_256(utf8ToBytes(a)));
  return `0x${[...a].map((c, i) => (Number.parseInt(hash[i] as string, 16) >= 8 ? c.toUpperCase() : c)).join('')}`;
}

/** A CoinGecko logo at the size a badge draws it from: small, not the thumbnail its lists carry. */
const sized = (url: string) => url.replace('/thumb/', '/small/');

const isAddress = (chain: string, a: string) =>
  chain === 'solana' ? (x: string) => x === a : (x: string) => x.toLowerCase() === a.toLowerCase();

/**
 * Every list a run reads, each fetched once and kept for the run. A list that can't be read is said in
 * `failed` and left out: the marks read without it say so by what they lack.
 */
export function listReader(fetchImpl: Fetch = globalThis.fetch) {
  const files = new Map<string, Promise<TokenList | null>>();
  const failed: string[] = [];
  const json = async <T>(url: string): Promise<T | null> => {
    try {
      const res = await fetchImpl(url, {
        headers: { accept: 'application/json', 'user-agent': 'petal/0.1 (marks)' },
      });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  };
  const file = (id: string, url: string) => {
    let f = files.get(id);
    if (!f) {
      f = json<TokenList>(url).then((l) => {
        if (!l?.tokens) failed.push(`${id} (${url})`);
        return l?.tokens ? l : null;
      });
      files.set(id, f);
    }
    return f;
  };
  let llama: Promise<
    Map<string, { name: string; symbol: string | null; logo: string | null }>
  > | null = null;
  const llamaIndex = () => {
    llama ??= json<{ name: string; address?: string | null; symbol?: string; logo?: string }[]>(
      LLAMA,
    ).then((all) => {
      const out = new Map<string, { name: string; symbol: string | null; logo: string | null }>();
      if (!all) failed.push(`defillama (${LLAMA})`);
      for (const p of all ?? []) {
        if (!p.address || out.has(p.address.toLowerCase())) continue;
        out.set(p.address.toLowerCase(), {
          name: p.name,
          symbol: p.symbol && p.symbol !== '-' ? p.symbol : null,
          logo: p.logo ?? null,
        });
      }
      return out;
    });
    return llama;
  };
  // CoinGecko's own coins (12 Nov, walk 3): a coin CoinGecko lists by its contract on this chain, with its image,
  // for a token its token lists don't carry. Its coin list once a run, then that coin's market entry.
  const geckoHeaders: Record<string, string> = process.env.COINGECKO_API_KEY?.trim()
    ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY.trim() }
    : {};
  let gecko: Promise<Map<string, string[]>> | null = null;
  const geckoIndex = () => {
    gecko ??= (async () => {
      const out = new Map<string, string[]>();
      let all: GeckoCoin[] | null = null;
      try {
        const res = await fetchImpl(GECKO_COINS, {
          headers: { accept: 'application/json', ...geckoHeaders },
        });
        all = res.ok ? ((await res.json()) as GeckoCoin[]) : null;
      } catch {
        all = null;
      }
      if (!Array.isArray(all)) failed.push(`coingecko coins (${GECKO_COINS})`);
      for (const c of all ?? [])
        for (const [platform, a] of Object.entries(c.platforms ?? {}))
          if (a) {
            const k = `${platform}|${a.toLowerCase()}`;
            out.set(k, [...(out.get(k) ?? []), c.id]);
          }
      return out;
    })();
    return gecko;
  };
  const geckoCoin = async (platform: string, address: string): Promise<Listed | null> => {
    const ids = [
      ...new Set((await geckoIndex()).get(`${platform}|${address.toLowerCase()}`) ?? []),
    ];
    if (ids.length !== 1) return null;
    const id = ids[0] as string;
    const url = `${GECKO_MARKETS}${encodeURIComponent(id)}`;
    let m: GeckoMarket[] | null = null;
    try {
      const res = await fetchImpl(url, {
        headers: { accept: 'application/json', ...geckoHeaders },
      });
      m = res.ok ? ((await res.json()) as GeckoMarket[]) : null;
    } catch {
      m = null;
    }
    const coin = Array.isArray(m) ? m[0] : undefined;
    if (!coin) return null;
    return {
      source: 'coingecko',
      ref: `${id}, CoinGecko's coin for ${platform}:${address.toLowerCase()} (${url})`,
      curated: true,
      name: coin.name?.trim() || null,
      symbol: coin.symbol?.trim().toUpperCase() || null,
      logo: coin.image && /^https:\/\//.test(coin.image) ? coin.image : null,
    };
  };
  const versionOf = (l: TokenList) =>
    l.version ? `v${l.version.major}.${l.version.minor}.${l.version.patch}` : 'unversioned';

  /** What each list says about one address on one chain, in the order they're trusted. */
  async function lookUp(chain: string, address: string): Promise<Listed[]> {
    const c = LIST_CHAINS[chain];
    if (!c) return [];
    const same = isAddress(chain, address);
    const out: Listed[] = [];
    const fromList = async (id: string, url: string) => {
      const l = await file(id, url);
      const t = l?.tokens?.find((x) => x.chainId === c.chainId && same(x.address));
      if (l && t)
        out.push({
          source: id,
          ref: `${l.name ?? id} ${versionOf(l)} (${url})`,
          curated: true,
          name: t.name?.trim() || null,
          symbol: t.symbol?.trim() || null,
          logo: t.logoURI ? (id === 'coingecko' ? sized(t.logoURI) : t.logoURI) : null,
        });
    };
    for (const id of c.lists) await fromList(id, LIST_URLS[id] as string);
    await fromList('coingecko', coingeckoUrl(c.coingecko));
    if (chain !== 'solana' && !out.some((l) => l.source === 'coingecko' && l.logo)) {
      const coin = await geckoCoin(c.coingecko, address);
      if (coin) out.push(coin);
    }

    // Trust Wallet: a folder per token, named by its checksummed address (a Solana mint as it is)
    const folder = `${TRUST_WALLET}/${c.trustwallet}/assets/${chain === 'solana' ? address : checksumAddress(address)}`;
    const info = await json<{ name?: string; symbol?: string; status?: string }>(
      `${folder}/info.json`,
    );
    if (info && info.status !== 'abandoned')
      out.push({
        source: 'trustwallet',
        ref: `${folder}/info.json`,
        curated: true,
        name: info.name?.trim() || null,
        symbol: info.symbol?.trim() || null,
        logo: `${folder}/logo.png`,
      });

    if (chain === 'solana') {
      const found = await json<
        { id: string; name?: string; symbol?: string; icon?: string; isVerified?: boolean }[]
      >(`${JUPITER}${encodeURIComponent(address)}`);
      const t = found?.find((x) => x.id === address);
      if (t)
        out.push({
          source: 'jupiter',
          ref: `${JUPITER}${address}`,
          curated: t.isVerified === true,
          name: t.name?.trim() || null,
          symbol: t.symbol?.trim() || null,
          logo: t.icon ?? null,
        });
    }

    // DefiLlama: a protocol whose governance token this is (Ethereum's addresses bare, the rest prefixed)
    const key = (c.llama ? `${c.llama}:${address}` : address).toLowerCase();
    const p = (await llamaIndex()).get(key);
    if (p)
      out.push({
        source: 'defillama',
        ref: `${LLAMA} (${p.name})`,
        curated: true,
        name: p.name,
        symbol: p.symbol,
        logo: p.logo,
      });
    return out;
  }

  /** A chain's own coin, as Trust Wallet's folder for the chain says it: NEAR's, for its validators. */
  async function chainCoin(trustwallet: string): Promise<Listed | null> {
    const folder = `${TRUST_WALLET}/${trustwallet}/info`;
    const info = await json<{ name?: string; symbol?: string }>(`${folder}/info.json`);
    return info
      ? {
          source: 'trustwallet',
          ref: `${folder}/info.json`,
          curated: true,
          name: info.name?.trim() || null,
          symbol: info.symbol?.trim() || null,
          logo: `${folder}/logo.png`,
        }
      : null;
  }

  return { lookUp, chainCoin, failed };
}

export type ListReader = ReturnType<typeof listReader>;
