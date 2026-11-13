// A map's mark, chain first, then lists: its organisation's name, its token's symbol and its logo, each saying
// where it came from.
//   name:   the DAO's own profile, then the token's own name, then the lists
//   symbol: the token's own, then the lists
//   either, said by the chain, is self-declared, and verified when a curated list holds the address
//   logo:   a curated list's first (checked and sized for wallets), then the chain's own picture
// A whole network's map (no token of its own) is marked by the system's token or its chain's coin, which is
// Petals' own step, so every part of it is inferred, and says why.
import { createHash } from 'node:crypto';
import {
  accountRef,
  type Claim,
  MARK_VERSION,
  type Mark,
  type MarkLogo,
  type MarkSaid,
  makeClaim,
  validateClaim,
} from '@petal/core';
import type { ClaimDraft } from '@petal/core/types';
import { EVM_CHAINS } from '../evm/chains.ts';
import {
  daohausSaid,
  evmSaid,
  gateway,
  nearSaid,
  type SelfSaid,
  solanaSaid,
  sputnikSaid,
} from './chain.ts';
import { type Fetch, type Listed, type ListReader, listReader } from './lists.ts';

export {
  decodeMetadata,
  decodeString,
  gateway,
  metadataAddress,
  POSTER,
  programAddress,
} from './chain.ts';
export { checksumAddress, LIST_CHAINS, listReader } from './lists.ts';

/** A map to mark, as its card says it. */
export interface MarkTarget {
  /** the card's id: chain:address, or chain:population */
  about: string;
  /** the card's chain: ethereum, base, arbitrum, gnosis, solana:…, near:mainnet */
  chain: string;
  address: string | null;
  /** the reader of its newest reading: erc20-holders, moloch-v1, … */
  reader: string | null;
  /** its newest reading's sha256: what an observed type rests on */
  snapshot?: string | null;
}

export interface MarkPicture {
  sha256: string;
  media_type: MarkLogo['media_type'];
  bytes: Uint8Array;
}
export interface ReadMark {
  mark: Mark;
  logo: MarkPicture | null;
}

export interface MarkDeps {
  fetch?: Fetch;
  now?: () => Date;
  /** one per run, so each list is read once */
  lists?: ListReader;
}

/** The maps that are a whole network, and what marks each, with why: Petals' own step, so inferred. */
export const NETWORK_MARKS: Record<string, { chain: string; address: string | null; why: string }> =
  {
    'eip155:1:beanstalk-silo': {
      chain: 'ethereum',
      address: '0xbea0000029ad1c77d3d5d23ba2d8893db9d1efab',
      why: "Beanstalk's silo, marked by Beanstalk's token, BEAN",
    },
    'near:mainnet:house-of-stake': {
      chain: 'near:mainnet',
      address: 'venear.dao',
      why: "NEAR's House of Stake, marked by its token, veNEAR (venear.dao)",
    },
    'near:mainnet:validators': {
      chain: 'near:mainnet',
      address: null,
      why: "NEAR's validators, marked by NEAR's own coin",
    },
  };

const chainOf = (chain: string) => (chain.startsWith('solana') ? 'solana' : chain);

/** What a picture is, from its first bytes: the three a badge can draw and Petals keeps, or null. */
export function pictureType(b: Uint8Array): MarkLogo['media_type'] | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (
    b.length > 12 &&
    Buffer.from(b.subarray(0, 4)).toString('latin1') === 'RIFF' &&
    Buffer.from(b.subarray(8, 12)).toString('latin1') === 'WEBP'
  )
    return 'image/webp';
  return null;
}

/** How long one picture may take to arrive. */
const PICTURE_TIMEOUT_MS = 30_000;

/** A picture from an address, or a data: URI, when it's one Petals keeps; null for anything else. */
async function picture(fetchImpl: Fetch, url: string): Promise<MarkPicture | null> {
  let bytes: Uint8Array;
  try {
    const data = /^data:[^;,]+;base64,(.*)$/s.exec(url);
    if (data) bytes = new Uint8Array(Buffer.from(data[1] as string, 'base64'));
    else {
      // the address as given, then through the gateway (12 Nov: ipfs.near.social answers, Pinata timed out)
      let got: Uint8Array | null = null;
      for (const u of [...new Set([url, gateway(url)])]) {
        if (!/^https?:\/\//.test(u)) continue;
        try {
          const res = await fetchImpl(u, {
            headers: { 'user-agent': 'petal/0.1 (marks)' },
            signal: AbortSignal.timeout(PICTURE_TIMEOUT_MS),
          });
          if (!res.ok) continue;
          const b = new Uint8Array(await res.arrayBuffer());
          if (pictureType(b)) {
            got = b;
            break;
          }
        } catch {
          // this address didn't answer: the next
        }
      }
      if (!got) return null;
      bytes = got;
    }
  } catch {
    return null;
  }
  const media_type = pictureType(bytes);
  if (!media_type) return null;
  return { sha256: createHash('sha256').update(bytes).digest('hex'), media_type, bytes };
}

/** What the thing says of itself, by its chain and reader. */
async function selfSaid(
  fetchImpl: Fetch,
  chain: string,
  address: string,
  reader: string | null,
): Promise<SelfSaid> {
  const evm = EVM_CHAINS[chain];
  if (evm) {
    if (reader === 'moloch-v1' || reader === 'moloch-v2') return daohausSaid(fetchImpl, address);
    return evmSaid(evm, address, fetchImpl);
  }
  if (chain === 'solana') return solanaSaid(fetchImpl, address);
  if (chain === 'near:mainnet')
    return reader === 'sputnik-dao'
      ? sputnikSaid(fetchImpl, address)
      : nearSaid(fetchImpl, address);
  return { org: null, name: null, symbol: null, image: null };
}

const READER_BY = 'tool:petals-marks@1';
const CAIP2: Record<string, string> = {
  ethereum: 'eip155:1',
  base: 'eip155:8453',
  arbitrum: 'eip155:42161',
  gnosis: 'eip155:100',
  solana: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'near:mainnet': 'near:mainnet',
};
/** What each reader's map is, as its reading shows it: observed, resting on that reading. */
const READ_AS: Record<string, string[]> = {
  'erc20-holders': ['token'],
  'erc20-votes': ['token'],
  'solana-spl-holders': ['token'],
  'moloch-v1': ['DAO', 'Moloch v1'],
  'sputnik-dao': ['DAO', 'Sputnik DAO'],
};

/**
 * A map's types (types are data: claims with evidence, any value, several at once), as is_a
 * claims (claim/v4): what its reading shows it is, observed and resting on that reading; and, for a token a Baal
 * owns whose sharesToken() names it back, that DAO's, inferred from that call. In the order found. A whole
 * network's map has no account to be about, so none.
 */
function typesOf(
  t: MarkTarget,
  chain: string,
  address: string | null,
  reader: string | null,
  said: SelfSaid,
  at: string,
): Claim[] {
  const caip2 = CAIP2[chain] ?? (t.chain.startsWith('solana') ? t.chain : null);
  const subject = caip2 && address ? accountRef(caip2, address) : null;
  if (!subject) return [];
  const drafts: ClaimDraft[] = [];
  for (const value of reader ? (READ_AS[reader] ?? []) : [])
    if (t.snapshot)
      drafts.push({
        subject,
        verb: 'is_a',
        object: { value },
        kind: 'observed',
        issued_at: at,
        by: READER_BY,
        evidence: [
          { type: 'snapshot', snapshot_sha256: t.snapshot, found_by: READER_BY, found_at: at },
        ],
      } as ClaimDraft);
  const dao = said.baal && caip2 ? accountRef(caip2, said.baal) : null;
  if (dao)
    for (const value of ['DAO', 'Moloch v3 (Baal)'])
      drafts.push({
        subject: dao,
        verb: 'is_a',
        object: { value },
        kind: 'inferred',
        method: 'marks/types@1',
        qualifiers: { grounds: 'research' },
        issued_at: at,
        by: READER_BY,
        evidence: [
          {
            type: 'note',
            note: `sharesToken() on ${dao} names ${address}, the token it owns: a Moloch v3 (Baal) DAO`,
            found_by: READER_BY,
            found_at: at,
          },
        ],
      } as ClaimDraft);
  return drafts.map((d) => makeClaim(d, 'claim/v4')).filter((c) => validateClaim(c).ok);
}

/**
 * A map's types alone, as readMark finds them: its chain's own words, with no lists and no logo. For the pass
 * that adds types to a mark already kept.
 */
export async function readTypes(t: MarkTarget, deps: MarkDeps = {}): Promise<Claim[]> {
  const fetchImpl = deps.fetch ?? ((...a: Parameters<Fetch>) => globalThis.fetch(...a));
  const at = (deps.now ?? (() => new Date()))().toISOString();
  const network = NETWORK_MARKS[t.about];
  const chain = chainOf(network?.chain ?? t.chain);
  const address = network ? network.address : t.address;
  const said: SelfSaid = address
    ? await selfSaid(fetchImpl, chain, address, network ? null : t.reader)
    : { org: null, name: null, symbol: null, image: null };
  return typesOf(t, chain, address, network ? null : t.reader, said, at);
}

/** Read one map's mark: the chain first, then the lists. */
export async function readMark(t: MarkTarget, deps: MarkDeps = {}): Promise<ReadMark> {
  const fetchImpl = deps.fetch ?? ((...a: Parameters<Fetch>) => globalThis.fetch(...a));
  const lists = deps.lists ?? listReader(fetchImpl);
  const at = (deps.now ?? (() => new Date()))().toISOString();
  const network = NETWORK_MARKS[t.about];
  const chain = chainOf(network?.chain ?? t.chain);
  const address = network ? network.address : t.address;

  const said: SelfSaid = address
    ? await selfSaid(fetchImpl, chain, address, network ? null : t.reader)
    : { org: null, name: null, symbol: null, image: null };
  const listed: Listed[] = address
    ? await lists.lookUp(chain, address)
    : [await lists.chainCoin(chain === 'near:mainnet' ? 'near' : chain)].filter(
        (l): l is Listed => !!l,
      );
  const curated = listed.filter((l) => l.curated);
  const verifiedBy = curated.length ? curated.map((l) => `${l.source}: ${l.ref}`) : undefined;

  const fromChain = (d: { value: string; source: string; ref: string } | null): MarkSaid | null =>
    d
      ? {
          value: d.value,
          status: verifiedBy ? 'verified' : 'self-declared',
          source: d.source,
          ref: d.ref,
          ...(verifiedBy ? { verified_by: verifiedBy } : {}),
          at,
        }
      : null;
  const fromList = (pick: (l: Listed) => string | null): MarkSaid | null => {
    for (const l of listed) {
      const value = pick(l);
      if (value)
        return {
          value,
          status: l.curated ? 'verified' : 'self-declared',
          source: l.source,
          ref: l.ref,
          at,
        };
    }
    return null;
  };

  let name = fromChain(said.org) ?? fromChain(said.name) ?? fromList((l) => l.name);
  let symbol = fromChain(said.symbol) ?? fromList((l) => l.symbol);

  let logo: MarkLogo | null = null;
  let bytes: MarkPicture | null = null;
  const candidates = [
    ...listed
      .filter((l) => l.logo)
      .map((l) => ({
        url: l.logo as string,
        source: l.source,
        status: l.curated ? ('verified' as const) : ('self-declared' as const),
      })),
    ...(said.image
      ? [{ url: said.image.value, source: said.image.source, status: 'self-declared' as const }]
      : []),
  ];
  for (const c of candidates) {
    const p = await picture(fetchImpl, c.url);
    if (!p) continue;
    bytes = p;
    logo = {
      sha256: p.sha256,
      media_type: p.media_type,
      status: c.status,
      source: c.source,
      ref: c.url.startsWith('data:') ? `the icon inline in ${said.image?.ref ?? c.source}` : c.url,
      at,
    };
    break;
  }

  // a whole network's map: every part is Petals' own step, and says why
  if (network) {
    const inferred = <T extends MarkSaid | MarkLogo>(p: T | null): T | null =>
      p
        ? {
            ...p,
            status: 'inferred',
            ref: `${network.why}: ${p.ref}`,
            ...('verified_by' in p ? { verified_by: undefined } : {}),
          }
        : null;
    const clean = <T extends object | null>(p: T): T =>
      p ? (Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as T) : p;
    name = clean(inferred(name));
    symbol = clean(inferred(symbol));
    logo = clean(inferred(logo));
  }

  const types = typesOf(t, chain, address, network ? null : t.reader, said, at);
  return {
    mark: { petal: MARK_VERSION, about: t.about, name, symbol, logo, types, read_at: at },
    logo: bytes,
  };
}
