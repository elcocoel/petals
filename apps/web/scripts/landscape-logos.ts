// node apps/web/scripts/landscape-logos.ts: the map bench's logos (specs/006-the-map, plan, bench v2). For
// each view in the bench's fixture whose address is a token, copies its logo once from Trust Wallet's
// public list (github.com/trustwallet/assets, blockchains/<chain>/assets/<address>/logo.png) into
// fixtures/landscape/logos/. EVM addresses are looked up checksummed (EIP-55). A logo already copied is
// never fetched again; a token the list doesn't have gets no file, and the map gives it a symbol mark.
// The logos are the projects' own marks, used to identify them.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import {
  LOGOS_DIR,
  logoFile,
  NIGHT_FIXTURE,
  type Night,
  trustWalletChain,
} from '../landscape/night.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const night = JSON.parse(
  gunzipSync(readFileSync(join(root, NIGHT_FIXTURE))).toString('utf8'),
) as Night;
const dir = join(root, LOGOS_DIR);
mkdirSync(dir, { recursive: true });
const say = (line: string) => process.stdout.write(`${line}\n`);

// Keccak-256, as Ethereum uses it (not SHA3-256: the padding differs). Node's crypto doesn't have it, and
// this is the only place the web app needs it.
const RC = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n,
];
const ROT = [
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14,
];
const MASK = (1n << 64n) - 1n;
const rotl = (x: bigint, n: number) =>
  n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK;

function keccak256(input: Uint8Array): Uint8Array {
  const rate = 136;
  const padded = new Uint8Array(Math.ceil((input.length + 1) / rate) * rate);
  padded.set(input);
  padded[input.length] = 0x01;
  padded[padded.length - 1] = (padded[padded.length - 1] as number) | 0x80;
  const s = new Array<bigint>(25).fill(0n);
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(padded[off + i * 8 + b] as number);
      s[i] = (s[i] as bigint) ^ lane;
    }
    for (let round = 0; round < 24; round++) {
      const c = Array.from({ length: 5 }, (_, x) =>
        [0, 5, 10, 15, 20].reduce((a, y) => a ^ (s[x + y] as bigint), 0n),
      );
      for (let x = 0; x < 5; x++) {
        const d = (c[(x + 4) % 5] as bigint) ^ rotl(c[(x + 1) % 5] as bigint, 1);
        for (let y = 0; y < 25; y += 5) s[x + y] = (s[x + y] as bigint) ^ d;
      }
      const b = new Array<bigint>(25).fill(0n);
      for (let x = 0; x < 5; x++)
        for (let y = 0; y < 5; y++)
          b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(s[x + 5 * y] as bigint, ROT[x + 5 * y] as number);
      for (let x = 0; x < 5; x++)
        for (let y = 0; y < 5; y++)
          s[x + 5 * y] =
            (b[x + 5 * y] as bigint) ^
            (~(b[((x + 1) % 5) + 5 * y] as bigint) & MASK & (b[((x + 2) % 5) + 5 * y] as bigint));
      s[0] = (s[0] as bigint) ^ (RC[round] as bigint);
    }
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++)
    for (let b = 0; b < 8; b++)
      out[i * 8 + b] = Number(((s[i] as bigint) >> BigInt(8 * b)) & 0xffn);
  return out;
}

/** EIP-55: an address's mixed case, as Trust Wallet's folders are named. */
function checksummed(address: string): string {
  const lower = address.toLowerCase().replace(/^0x/, '');
  const hash = keccak256(new TextEncoder().encode(lower));
  let out = '0x';
  for (let i = 0; i < lower.length; i++) {
    const nibble = ((hash[i >> 1] as number) >> (i % 2 === 0 ? 4 : 0)) & 0xf;
    out += nibble >= 8 ? (lower[i] as string).toUpperCase() : lower[i];
  }
  return out;
}

// The check Ethereum's own docs give: the empty string's hash, and one well-known address.
if (
  Buffer.from(keccak256(new Uint8Array())).toString('hex') !==
    'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470' ||
  checksummed('0x1f9840a85d5af5bf1d1762f925bdaddc4201f984') !==
    '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'
)
  throw new Error('keccak-256 is wrong');

const have = new Set(readdirSync(dir));
let copied = 0;
let missing = 0;
let kept = 0;
for (const v of night.views) {
  const chain = trustWalletChain(v.chain);
  if (!chain || !v.address) continue;
  const file = logoFile(v.chain, v.address);
  if (!file) continue;
  if (have.has(file)) {
    kept++;
    continue;
  }
  const at = chain === 'solana' ? v.address : checksummed(v.address);
  const url = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${chain}/assets/${at}/logo.png`;
  const res = await fetch(url, { headers: { 'user-agent': 'petals-lab-map/1.0' } });
  if (!res.ok) {
    missing++;
    continue;
  }
  writeFileSync(join(dir, file), Buffer.from(await res.arrayBuffer()));
  have.add(file);
  copied++;
}
say(`${copied} logos copied, ${kept} kept, ${missing} not in Trust Wallet's list -> ${LOGOS_DIR}`);
if (!existsSync(dir)) throw new Error(`${dir} missing`);
