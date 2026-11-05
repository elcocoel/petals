// The little ABI work the Ethereum modules need: selectors and event topics (keccak-256 from
// @noble/hashes), static argument encoding, and reading 32-byte words out of hex. Hex strings
// are lowercase with a 0x prefix.
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

const keccakHex = (text: string) => bytesToHex(keccak_256(utf8ToBytes(text)));

/** `totalShares()` -> 0x3a98ef39 */
export const selector = (signature: string) => `0x${keccakHex(signature).slice(0, 8)}`;

/** `Ragequit(address,uint256)` -> its 32-byte event topic */
export const eventTopic = (signature: string) => `0x${keccakHex(signature)}`;

const word = (hex: string) => hex.padStart(64, '0');

/** One static argument as a 32-byte word: an address (0x...), or an unsigned integer. */
function encodeArg(arg: string | number | bigint): string {
  if (typeof arg === 'string') return word(arg.replace(/^0x/, '').toLowerCase());
  return word(BigInt(arg).toString(16));
}

/** Calldata for a function with static arguments only. */
export function encodeCall(signature: string, ...args: (string | number | bigint)[]): string {
  return `${selector(signature)}${args.map(encodeArg).join('')}`;
}

/** The i-th 32-byte word of a hex string, as hex without a prefix. */
export function wordHex(data: string, i: number): string {
  const start = 2 + 64 * i;
  const w = data.slice(start, start + 64);
  if (w.length !== 64)
    throw new RangeError(`no word ${i} in ${data.length} characters of hex data`);
  return w;
}

/** The i-th 32-byte word of a hex string, as an integer. */
export const wordAt = (data: string, i: number): bigint => BigInt(`0x${wordHex(data, i)}`);

/** The address in a 32-byte word or an indexed topic. */
export const addressOf = (w: string): string => `0x${w.slice(-40).toLowerCase()}`;

/** A dynamic string in ABI-encoded data, whose offset (from the start) sits in word `i`. */
export function stringAt(data: string, i: number): string {
  const offset = Number(wordAt(data, i));
  const start = 2 + offset * 2;
  const length = Number(BigInt(`0x${data.slice(start, start + 64)}`));
  return Buffer.from(data.slice(start + 64, start + 64 + length * 2), 'hex').toString('utf8');
}

/** Short form for petal labels: 0x1234…abcd */
export const shortAddress = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;
