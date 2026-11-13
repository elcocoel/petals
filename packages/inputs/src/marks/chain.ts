// What a token, a DAO or an account says of itself, read from its own chain: the first source of a mark.
// Keyless, public endpoints only.
//   EVM:    the token's name() and symbol(); a Baal DAO's own profile, posted on chain through Poster;
//           a Moloch v1 or v2 DAO's, as it gave it to DAOhaus
//   Solana: the mint's Metaplex metadata (name, symbol, and the JSON its uri names, with its image)
//   NEAR:   a token's ft_metadata
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { base58 } from '@scure/base';
import { encodeCall, stringAt } from '../evm/abi.ts';
import { askChain } from '../evm/ask.ts';
import type { EvmChain } from '../evm/chains.ts';
import type { Fetch } from './lists.ts';

/** One thing the chain said, and exactly where. */
export interface Declared {
  value: string;
  source: string;
  ref: string;
}
export interface SelfSaid {
  /** the organisation's own name, where a DAO or an account says one */
  org: Declared | null;
  /** the token's own name */
  name: Declared | null;
  symbol: Declared | null;
  /** a picture it points to: a URL, ipfs:// or ar:// */
  image: Declared | null;
  /** the Baal DAO whose shares this token is, when its owner's sharesToken() names it back */
  baal?: string;
}
const nothing = (): SelfSaid => ({ org: null, name: null, symbol: null, image: null });

// -- EVM

/** Poster (EIP-3722), where a Baal DAO posts its own profile, at one address on every chain. */
export const POSTER = '0x000000000000cd17345801aa8147b8d3950260ff';
/** NewPost(address indexed user, string content, string indexed tag) */
const NEW_POST = '0x6c7f3182d7e4cb876251f9ae1489975fdbbf15d9f35d393f2ac9b1ff57cec69f';

/** A string answer, or a bytes32 one (old tokens such as MKR), or null. */
export function decodeString(data: string | null | undefined): string | null {
  if (!data || data === '0x') return null;
  try {
    const s =
      data.length === 66
        ? Buffer.from(data.slice(2), 'hex').toString('utf8').replace(/\0+$/, '')
        : stringAt(data, 0);
    const clean = s.replace(/\p{Cc}/gu, '').trim();
    return clean || null;
  } catch {
    return null;
  }
}

async function call(
  chain: EvmChain,
  to: string,
  signature: string,
  fetchImpl?: Fetch,
): Promise<string | null> {
  try {
    const { result } = await askChain<string>(
      chain,
      'eth_call',
      [{ to, data: encodeCall(signature) }, 'latest'],
      fetchImpl ? { fetch: fetchImpl } : {},
    );
    return result;
  } catch {
    return null;
  }
}

/** The newest profile a Baal DAO posted of itself, with its name: { name, avatarImg, … }. */
async function baalProfile(
  chain: EvmChain,
  dao: string,
  fetchImpl?: Fetch,
): Promise<{ name?: string; avatarImg?: string } | null> {
  let logs: { data: string; blockNumber: string }[];
  try {
    ({ result: logs } = await askChain<{ data: string; blockNumber: string }[]>(
      chain,
      'eth_getLogs',
      [
        {
          address: POSTER,
          fromBlock: '0x0',
          toBlock: 'latest',
          topics: [NEW_POST, `0x${dao.slice(2).toLowerCase().padStart(64, '0')}`],
        },
      ],
      { accept: (r) => Array.isArray(r), ...(fetchImpl ? { fetch: fetchImpl } : {}) },
    ));
  } catch {
    return null;
  }
  for (const l of [...logs].sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)))) {
    try {
      const content = JSON.parse(stringAt(l.data, 0)) as { name?: unknown; avatarImg?: unknown };
      if (typeof content.name === 'string' && content.name.trim())
        return {
          name: content.name.trim(),
          ...(typeof content.avatarImg === 'string' && content.avatarImg
            ? { avatarImg: content.avatarImg }
            : {}),
        };
    } catch {
      // a post that isn't a profile
    }
  }
  return null;
}

/** An ERC-20, and, when the DAO that owns it is a Baal whose shares it is, that DAO's own profile. */
export async function evmSaid(
  chain: EvmChain,
  address: string,
  fetchImpl?: Fetch,
): Promise<SelfSaid> {
  const a = address.toLowerCase();
  const out = nothing();
  const at = `${chain.caip2}:${a}`;
  const name = decodeString(await call(chain, a, 'name()', fetchImpl));
  const symbol = decodeString(await call(chain, a, 'symbol()', fetchImpl));
  if (name) out.name = { value: name, source: 'chain', ref: `name() on ${at}` };
  if (symbol) out.symbol = { value: symbol, source: 'chain', ref: `symbol() on ${at}` };

  // a Baal's shares token is owned by its DAO, whose sharesToken() names it back
  const owner = await call(chain, a, 'owner()', fetchImpl);
  if (owner && owner.length === 66) {
    const dao = `0x${owner.slice(-40)}`;
    const shares = await call(chain, dao, 'sharesToken()', fetchImpl);
    if (shares && shares.length === 66 && `0x${shares.slice(-40)}` === a) {
      out.baal = dao;
      const p = await baalProfile(chain, dao, fetchImpl);
      const where = `the DAO's own profile, posted through Poster on ${chain.caip2}:${dao}`;
      if (p?.name) out.org = { value: p.name, source: 'poster', ref: where };
      if (p?.avatarImg) out.image = { value: p.avatarImg, source: 'poster', ref: where };
    }
  }
  return out;
}

const DAOHAUS = 'https://data.daohaus.club/dao/';

/** A Moloch v1 or v2 DAO's name and avatar, as the DAO gave them to DAOhaus. */
export async function daohausSaid(fetchImpl: Fetch, address: string): Promise<SelfSaid> {
  const out = nothing();
  try {
    const res = await fetchImpl(`${DAOHAUS}${address.toLowerCase()}`);
    if (!res.ok) return out;
    const rows = (await res.json()) as { name?: string; avatarImg?: string; network?: string }[];
    const row = Array.isArray(rows) ? rows.find((r) => r.name) : undefined;
    const ref = `${DAOHAUS}${address.toLowerCase()}`;
    if (row?.name) out.org = { value: row.name.trim(), source: 'daohaus', ref };
    if (row?.avatarImg) out.image = { value: row.avatarImg, source: 'daohaus', ref };
  } catch {
    // DAOhaus didn't answer: the mark goes without it
  }
  return out;
}

// -- Solana

const METAPLEX = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
export const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

const onCurve = (bytes: Uint8Array) => {
  try {
    ed25519.Point.fromBytes(bytes);
    return true;
  } catch {
    return false;
  }
};

/** Solana's findProgramAddress: the first bump, from 255 down, whose hash is off the curve. */
export function programAddress(seeds: Uint8Array[], program: string): string {
  const programId = base58.decode(program);
  const tail = utf8ToBytes('ProgramDerivedAddress');
  for (let bump = 255; bump >= 0; bump--) {
    const bytes = new Uint8Array([...seeds.flatMap((s) => [...s]), bump, ...programId, ...tail]);
    const hash = sha256(bytes);
    if (!onCurve(hash)) return base58.encode(hash);
  }
  throw new Error('no program address');
}

/** The Metaplex metadata account of a mint. */
export const metadataAddress = (mint: string) =>
  programAddress([utf8ToBytes('metadata'), base58.decode(METAPLEX), base58.decode(mint)], METAPLEX);

/** name, symbol and uri from a Metaplex metadata account: key, update authority, mint, then three strings. */
export function decodeMetadata(
  data: Uint8Array,
): { name: string; symbol: string; uri: string } | null {
  let o = 1 + 32 + 32;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const str = () => {
    const n = view.getUint32(o, true);
    o += 4;
    const s = Buffer.from(data.subarray(o, o + n))
      .toString('utf8')
      .replace(/\0+$/g, '')
      .trim();
    o += n;
    return s;
  };
  try {
    return { name: str(), symbol: str(), uri: str() };
  } catch {
    return null;
  }
}

/** A mint's own name, symbol and image, as its Metaplex metadata says them. */
export async function solanaSaid(
  fetchImpl: Fetch,
  mint: string,
  rpc = SOLANA_RPC,
): Promise<SelfSaid> {
  const out = nothing();
  const account = metadataAddress(mint);
  let data: Uint8Array | null = null;
  try {
    const res = await fetchImpl(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAccountInfo',
        params: [account, { encoding: 'base64' }],
      }),
    });
    const body = (await res.json()) as { result?: { value?: { data?: [string, string] } | null } };
    const b64 = body.result?.value?.data?.[0];
    data = b64 ? new Uint8Array(Buffer.from(b64, 'base64')) : null;
  } catch {
    return out;
  }
  const m = data ? decodeMetadata(data) : null;
  if (!m) return out;
  const ref = `Metaplex metadata ${account} of solana:${mint}`;
  if (m.name) out.name = { value: m.name, source: 'metaplex', ref };
  if (m.symbol) out.symbol = { value: m.symbol, source: 'metaplex', ref };
  if (m.uri) {
    try {
      const res = await fetchImpl(gateway(m.uri));
      const json = (await res.json()) as { image?: unknown };
      if (typeof json.image === 'string' && json.image)
        out.image = { value: json.image, source: 'metaplex', ref: `${m.uri}, named by ${ref}` };
    } catch {
      // the uri's JSON didn't answer: no image from the chain
    }
  }
  return out;
}

// -- NEAR

export const NEAR_RPC = 'https://rpc.mainnet.fastnear.com';

/** A NEAR token's ft_metadata: name, symbol and its icon (often an inline picture). */
export async function nearSaid(
  fetchImpl: Fetch,
  account: string,
  rpc = NEAR_RPC,
): Promise<SelfSaid> {
  const out = nothing();
  try {
    const res = await fetchImpl(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'query',
        params: {
          request_type: 'call_function',
          finality: 'final',
          account_id: account,
          method_name: 'ft_metadata',
          args_base64: 'e30=',
        },
      }),
    });
    const body = (await res.json()) as { result?: { result?: number[] } };
    const bytes = body.result?.result;
    if (!bytes) return out;
    const m = JSON.parse(Buffer.from(bytes).toString('utf8')) as {
      name?: string;
      symbol?: string;
      icon?: string | null;
    };
    const ref = `ft_metadata on near:mainnet:${account}`;
    if (m.name?.trim()) out.name = { value: m.name.trim(), source: 'ft_metadata', ref };
    if (m.symbol?.trim()) out.symbol = { value: m.symbol.trim(), source: 'ft_metadata', ref };
    if (m.icon) out.image = { value: m.icon, source: 'ft_metadata', ref };
  } catch {
    // not a token, or NEAR didn't answer
  }
  return out;
}

/**
 * A Sputnik DAO's own logo: get_config's metadata (base64 JSON) holds flagLogo, an address the
 * DAO set itself. Only a web or IPFS address is kept: Astro's 21-character file ids pointed at Astro's own store,
 * which is gone. Names stay as they are: only the picture.
 */
export async function sputnikSaid(
  fetchImpl: Fetch,
  dao: string,
  rpc = NEAR_RPC,
): Promise<SelfSaid> {
  const out = nothing();
  try {
    const res = await fetchImpl(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'query',
        params: {
          request_type: 'call_function',
          finality: 'final',
          account_id: dao,
          method_name: 'get_config',
          args_base64: 'e30=',
        },
      }),
    });
    const body = (await res.json()) as { result?: { result?: number[] } };
    const bytes = body.result?.result;
    if (!bytes) return out;
    const config = JSON.parse(Buffer.from(bytes).toString('utf8')) as { metadata?: string };
    if (!config.metadata) return out;
    const meta = JSON.parse(Buffer.from(config.metadata, 'base64').toString('utf8')) as {
      flagLogo?: unknown;
    };
    const logo = typeof meta.flagLogo === 'string' ? meta.flagLogo.trim() : '';
    const isAddress =
      /^https?:\/\//.test(logo) ||
      logo.startsWith('ipfs://') ||
      /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})$/.test(logo);
    if (isAddress)
      out.image = {
        value: logo,
        source: 'sputnik',
        ref: `get_config on near:mainnet:${dao}, its metadata's flagLogo`,
      };
  } catch {
    // not a Sputnik DAO, or NEAR didn't answer
  }
  return out;
}

const IPFS = 'https://gateway.pinata.cloud/ipfs/';

/**
 * An address a picture can be fetched from: ipfs://, a bare CID or any gateway's /ipfs/ path through one gateway
 * that answers (an IPFS path names its content, so every gateway gives the same bytes; ipfs.io and most public
 * ones refuse scripts, 11 Nov), ar:// through Arweave, anything else as it is.
 */
export function gateway(url: string): string {
  const u = url.trim();
  if (u.startsWith('ipfs://')) return `${IPFS}${u.slice(7).replace(/^ipfs\//, '')}`;
  if (u.startsWith('ar://')) return `https://arweave.net/${u.slice(5)}`;
  if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})(\/.*)?$/.test(u)) return `${IPFS}${u}`;
  const path = /^https?:\/\/[^/]+\/ipfs\/(.+)$/.exec(u);
  if (path) return `${IPFS}${path[1]}`;
  return u;
}
