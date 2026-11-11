// A map's mark (board #85): the chain first, then curated lists, each part saying where it came from. On a
// fake fetch; the vectors are real (Seeker's Metaplex account, read on Solana on 11 Nov; EIP-55's own).
import { validateMark } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { encodeCall } from '../src/evm/abi.ts';
import { ETHEREUM, GNOSIS } from '../src/evm/chains.ts';
import {
  checksumAddress,
  decodeMetadata,
  decodeString,
  gateway,
  metadataAddress,
  pictureType,
  readMark,
} from '../src/marks/index.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const NOW = () => new Date('2026-11-11T13:00:00.000Z');

/** An ABI-encoded string, as a call answers it. */
function abiString(s: string): string {
  const hex = Buffer.from(s, 'utf8').toString('hex');
  const word = (n: number) => n.toString(16).padStart(64, '0');
  return `0x${word(32)}${word(hex.length / 2)}${hex.padEnd(Math.ceil(hex.length / 64) * 64, '0')}`;
}
const wordOf = (address: string) => `0x${address.slice(2).padStart(64, '0')}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

interface World {
  /** per chain endpoint: (to, selector) → the call's answer, or undefined for a revert */
  calls: Record<string, string>;
  logs?: unknown[];
  /** URL prefix → a reply */
  pages: [string, () => Response][];
}

function fakeFetch(w: World) {
  const endpoints = new Set([...GNOSIS.endpoints, ...ETHEREUM.endpoints].map((e) => e.url));
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (endpoints.has(url)) {
      const body = JSON.parse(String(init?.body)) as {
        method: string;
        params: [{ to: string; data: string }];
      };
      if (body.method === 'eth_getLogs')
        return json({ jsonrpc: '2.0', id: 'petal', result: w.logs ?? [] });
      const { to, data } = body.params[0];
      const answer = w.calls[`${to.toLowerCase()} ${data.slice(0, 10)}`];
      return answer
        ? json({ jsonrpc: '2.0', id: 'petal', result: answer })
        : json({ jsonrpc: '2.0', id: 'petal', error: { code: 3, message: 'execution reverted' } });
    }
    const page = w.pages.find(([prefix]) => url.startsWith(prefix));
    return page ? page[1]() : new Response('not found', { status: 404 });
  }) as typeof fetch;
}

const sel = (sig: string) => encodeCall(sig).slice(0, 10);
const EMPTY_LIST = () =>
  json({ name: 'A list', version: { major: 1, minor: 2, patch: 3 }, tokens: [] });

describe('reading what the chain says', () => {
  test('a string answer, and an old token’s bytes32 one', () => {
    expect(decodeString(abiString('RaidGuild Shares'))).toBe('RaidGuild Shares');
    expect(decodeString(`0x${Buffer.from('MKR').toString('hex').padEnd(64, '0')}`)).toBe('MKR');
    expect(decodeString('0x')).toBeNull();
  });

  test('EIP-55: the mixed-case address Trust Wallet names its folders by', () => {
    expect(checksumAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed')).toBe(
      '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
    );
  });

  test("a mint's Metaplex account, as Solana derives it (Seeker's, owned by Metaplex on chain)", () => {
    expect(metadataAddress('SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3')).toBe(
      'J753AwzZP1mrHgnfuujQTd7a3jEWQaUCzskMxLwsVYVj',
    );
  });

  test("a Metaplex account's name, symbol and uri, padded with nulls as Metaplex keeps them", () => {
    const str = (s: string, pad: number) => {
      const b = Buffer.alloc(4 + pad);
      b.writeUInt32LE(pad, 0);
      b.write(s, 4, 'utf8');
      return b;
    };
    const data = Buffer.concat([
      Buffer.from([4]),
      Buffer.alloc(64),
      str('Seeker', 32),
      str('SKR', 10),
      str('https://example.org/skr.json', 200),
    ]);
    expect(decodeMetadata(new Uint8Array(data))).toEqual({
      name: 'Seeker',
      symbol: 'SKR',
      uri: 'https://example.org/skr.json',
    });
  });

  test('only the pictures a badge draws and Petals keeps: png, jpeg, webp', () => {
    expect(pictureType(PNG)).toBe('image/png');
    expect(pictureType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('image/jpeg');
    expect(pictureType(new Uint8Array(Buffer.from('RIFF0000WEBPVP8 ')))).toBe('image/webp');
    expect(
      pictureType(new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))),
    ).toBeNull();
  });

  test('ipfs and arweave through a gateway, anything else as it is', () => {
    expect(gateway('ipfs://QmXttGpZrECX5qCyXbBQiqgQNytVGeZW5Anewvh2jc4psg')).toBe(
      'https://ipfs.near.social/ipfs/QmXttGpZrECX5qCyXbBQiqgQNytVGeZW5Anewvh2jc4psg',
    );
    expect(gateway('ar://abc')).toBe('https://arweave.net/abc');
    expect(gateway('https://x.org/a.png')).toBe('https://x.org/a.png');
  });
});

describe('a mark: the chain first, then the lists', () => {
  const TOKEN = '0x372fc5a6b0b12ae174f09f6fc849a83de6b503b6';
  const DAO = '0xf02fd4286917270cb94fbc13a0f4e1ed76f7e986';

  test("a Baal DAO's shares token: the DAO's own name, posted on chain, and its token's symbol", async () => {
    const fetchImpl = fakeFetch({
      calls: {
        [`${TOKEN} ${sel('name()')}`]: abiString('RaidGuild Shares'),
        [`${TOKEN} ${sel('symbol()')}`]: abiString('RG'),
        [`${TOKEN} ${sel('owner()')}`]: wordOf(DAO),
        [`${DAO} ${sel('sharesToken()')}`]: wordOf(TOKEN),
      },
      logs: [
        {
          data: abiString(
            JSON.stringify({
              name: 'RaidGuild',
              avatarImg: 'ipfs://QmXttGpZrECX5qCyXbBQiqgQNytVGeZW5Anewvh2jc4psg',
            }),
          ),
          blockNumber: '0x10',
        },
        { data: abiString('not a profile'), blockNumber: '0x20' },
      ],
      pages: [
        ['https://ipfs.near.social/ipfs/', () => new Response(PNG)],
        ['https://tokens.', EMPTY_LIST],
        ['https://files.cow.fi/', EMPTY_LIST],
        ['https://api.llama.fi/', () => json([])],
      ],
    });
    const { mark, logo } = await readMark(
      { about: `eip155:100:${TOKEN}`, chain: 'gnosis', address: TOKEN, reader: 'erc20-holders' },
      { fetch: fetchImpl, now: NOW },
    );
    expect(mark.name).toMatchObject({
      value: 'RaidGuild',
      status: 'self-declared',
      source: 'poster',
    });
    expect(mark.name?.ref).toContain(DAO);
    expect(mark.symbol).toMatchObject({ value: 'RG', status: 'self-declared', source: 'chain' });
    expect(mark.logo).toMatchObject({
      media_type: 'image/png',
      status: 'self-declared',
      source: 'poster',
    });
    expect(logo?.bytes).toEqual(PNG);
    expect(validateMark(mark).ok).toBe(true);
  });

  test("a token on a curated list: its own name and symbol, verified by the list, and the list's logo", async () => {
    const UNI = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984';
    const fetchImpl = fakeFetch({
      calls: {
        [`${UNI} ${sel('name()')}`]: abiString('Uniswap'),
        [`${UNI} ${sel('symbol()')}`]: abiString('UNI'),
      },
      pages: [
        [
          'https://tokens.uniswap.org',
          () =>
            json({
              name: 'Uniswap Labs Default',
              version: { major: 22, minor: 34, patch: 0 },
              tokens: [
                {
                  chainId: 1,
                  address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
                  name: 'Uniswap',
                  symbol: 'UNI',
                  logoURI: 'https://logos.example/uni.png',
                },
              ],
            }),
        ],
        ['https://logos.example/uni.png', () => new Response(PNG)],
        ['https://tokens.coingecko.com/', EMPTY_LIST],
        ['https://files.cow.fi/', EMPTY_LIST],
        ['https://api.llama.fi/', () => json([])],
      ],
    });
    const { mark } = await readMark(
      { about: `eip155:1:${UNI}`, chain: 'ethereum', address: UNI, reader: 'erc20-votes' },
      { fetch: fetchImpl, now: NOW },
    );
    expect(mark.name).toMatchObject({ value: 'Uniswap', status: 'verified', source: 'chain' });
    expect(mark.symbol?.verified_by?.[0]).toContain('Uniswap Labs Default v22.34.0');
    expect(mark.logo).toMatchObject({
      status: 'verified',
      source: 'uniswap',
      ref: 'https://logos.example/uni.png',
    });
    expect(validateMark(mark).ok).toBe(true);
  });

  test("a whole network's map: marked by its chain's coin, every part Petals' own step and saying why", async () => {
    const fetchImpl = fakeFetch({
      calls: {},
      pages: [
        [
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/near/info/info.json',
          () => json({ name: 'NEAR Protocol', symbol: 'NEAR' }),
        ],
        [
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/near/info/logo.png',
          () => new Response(PNG),
        ],
      ],
    });
    const { mark } = await readMark(
      {
        about: 'near:mainnet:validators',
        chain: 'near:mainnet',
        address: null,
        reader: 'near-validators',
      },
      { fetch: fetchImpl, now: NOW },
    );
    expect(mark.symbol).toMatchObject({ value: 'NEAR', status: 'inferred', source: 'trustwallet' });
    expect(mark.symbol?.ref).toMatch(/^NEAR's validators, marked by NEAR's own coin: /);
    expect(mark.symbol && 'verified_by' in mark.symbol).toBe(false);
    expect(mark.logo?.status).toBe('inferred');
    expect(validateMark(mark).ok).toBe(true);
  });

  test('nothing anywhere: a mark with no parts, still a mark', async () => {
    const { mark } = await readMark(
      {
        about: 'eip155:100:0x0000000000000000000000000000000000000001',
        chain: 'gnosis',
        address: '0x0000000000000000000000000000000000000001',
        reader: 'erc20-holders',
      },
      { fetch: fakeFetch({ calls: {}, pages: [] }), now: NOW },
    );
    expect(mark).toMatchObject({ petal: 'mark/v1', name: null, symbol: null, logo: null });
    expect(validateMark(mark).ok).toBe(true);
  });
});
