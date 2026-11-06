// ABI values for a call nobody planned for (T332): any signature a person or a model names. Arguments
// are encoded from their signature; answers are decoded from a declared `returns (...)`, or guessed
// from their shape and marked as a guess. ./abi.ts is the fixed, static part the modules use.
import { selector } from './abi.ts';

export interface ParsedSignature {
  name: string;
  /** canonical, as hashed: balanceOf(address) */
  canonical: string;
  inputs: string[];
  /** null when the signature didn't say */
  outputs: string[] | null;
}

const canonicalType = (t: string): string => {
  const type = t.trim().split(/\s+/)[0] ?? '';
  if (type === 'uint') return 'uint256';
  if (type === 'int') return 'int256';
  if (type.startsWith('uint[')) return `uint256${type.slice(4)}`;
  if (type.startsWith('int[')) return `int256${type.slice(3)}`;
  return type;
};

const typeList = (text: string | undefined): string[] =>
  text?.trim() ? text.split(',').map(canonicalType) : [];

const SIGNATURE =
  /^\s*(?:function\s+)?([A-Za-z_$][\w$]*)\s*\(([^()]*)\)(?:\s+(?:external|public|view|pure))*(?:\s+returns\s*\(([^()]*)\))?\s*$/;

/** `balanceOf(address) returns (uint256)`. Null for what isn't a plain signature (a tuple, say). */
export function parseSignature(text: string): ParsedSignature | null {
  const m = SIGNATURE.exec(text);
  if (!m) return null;
  const inputs = typeList(m[2]);
  return {
    name: m[1] as string,
    canonical: `${m[1]}(${inputs.join(',')})`,
    inputs,
    outputs: m[3] === undefined ? null : typeList(m[3]),
  };
}

const word = (hex: string) => hex.padStart(64, '0');
const padRight = (hex: string) => hex.padEnd(Math.ceil(hex.length / 64) * 64, '0');
const isDynamic = (t: string) => t === 'string' || t === 'bytes';

function encodeStatic(type: string, value: string): string {
  const v = value.trim();
  if (type === 'address') {
    if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`"${value}" is not an address`);
    return word(v.slice(2).toLowerCase());
  }
  if (type === 'bool') {
    if (v !== 'true' && v !== 'false') throw new Error(`"${value}" is not true or false`);
    return word(v === 'true' ? '1' : '0');
  }
  if (/^uint\d*$/.test(type) || /^int\d*$/.test(type)) {
    if (!/^(-?\d+|0x[0-9a-fA-F]+)$/.test(v)) throw new Error(`"${value}" is not a whole number`);
    const n = BigInt(v);
    const twos = n < 0n ? (1n << 256n) + n : n;
    if (twos < 0n || twos >= 1n << 256n) throw new Error(`"${value}" does not fit in ${type}`);
    return word(twos.toString(16));
  }
  const bytes = /^bytes(\d+)$/.exec(type)?.[1];
  if (bytes) {
    const hex = v.replace(/^0x/, '');
    if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length > Number(bytes) * 2)
      throw new Error(`"${value}" is not ${type}`);
    return hex.toLowerCase().padEnd(64, '0');
  }
  throw new Error(`can't encode an argument of type ${type}`);
}

/** Calldata for any call whose arguments are plain values. Throws, in plain words, on what doesn't fit. */
export function encodeArguments(sig: ParsedSignature, args: readonly string[]): string {
  if (args.length !== sig.inputs.length)
    throw new Error(
      `${sig.canonical} takes ${sig.inputs.length} argument(s), and ${args.length} came`,
    );
  const heads: string[] = [];
  const tails: string[] = [];
  let offset = sig.inputs.length * 32;
  sig.inputs.forEach((type, i) => {
    const value = args[i] as string;
    if (!isDynamic(type)) {
      heads.push(encodeStatic(type, value));
      return;
    }
    const bytes =
      type === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value.replace(/^0x/, ''), 'hex');
    heads.push(word(offset.toString(16)));
    const tail = `${word(bytes.length.toString(16))}${padRight(bytes.toString('hex'))}`;
    tails.push(tail);
    offset += tail.length / 2;
  });
  return `${selector(sig.canonical)}${heads.join('')}${tails.join('')}`;
}

export const addressFrom = (w: string): string => `0x${w.slice(-40)}`;

function decodeStatic(type: string, w: string): string {
  if (type === 'address') return addressFrom(w);
  if (type === 'bool') return BigInt(`0x${w}`) === 0n ? 'false' : 'true';
  if (/^uint\d*$/.test(type)) return BigInt(`0x${w}`).toString();
  if (/^int\d*$/.test(type)) {
    const n = BigInt(`0x${w}`);
    return (n >= 1n << 255n ? n - (1n << 256n) : n).toString();
  }
  const bytes = /^bytes(\d+)$/.exec(type)?.[1];
  if (bytes) return `0x${w.slice(0, Number(bytes) * 2)}`;
  throw new Error(`can't decode ${type}`);
}

const wordAtHex = (hex: string, at: number) => {
  const w = hex.slice(at * 2, at * 2 + 64);
  if (w.length !== 64) throw new Error('the answer is shorter than its type says');
  return w;
};
const uintAt = (hex: string, at: number) => Number(BigInt(`0x${wordAtHex(hex, at)}`));

/** Decode an answer by its declared types. Throws when the answer doesn't fit them. */
export function decodeValues(types: readonly string[], data: string): unknown[] {
  const hex = data.replace(/^0x/, '');
  return types.map((type, i): unknown => {
    const head = i * 32;
    const list = /^(.+)\[\]$/.exec(type)?.[1];
    if (list) {
      if (isDynamic(list)) throw new Error(`can't decode ${type}`);
      const at = uintAt(hex, head);
      const n = uintAt(hex, at);
      if (at * 2 + 64 + n * 64 > hex.length) throw new Error('the list is longer than the answer');
      return Array.from({ length: n }, (_, j) =>
        decodeStatic(list, wordAtHex(hex, at + 32 + j * 32)),
      );
    }
    if (isDynamic(type)) {
      const at = uintAt(hex, head);
      const n = uintAt(hex, at);
      const body = hex.slice(at * 2 + 64, at * 2 + 64 + n * 2);
      if (body.length !== n * 2) throw new Error('the text is longer than the answer');
      return type === 'string' ? Buffer.from(body, 'hex').toString('utf8') : `0x${body}`;
    }
    return decodeStatic(type, wordAtHex(hex, head));
  });
}

const PRINTABLE = /^[\t\n\r\x20-\x7e -￿]*$/;

function guessWord(w: string): { value: string; as: string } {
  const n = BigInt(`0x${w}`);
  // Top 12 bytes empty and a value too large for an amount: a real amount stays well under 16 bytes.
  if (w.startsWith('0'.repeat(24)) && n >= 1n << 128n)
    return { value: addressFrom(w), as: 'address' };
  // short text, left-aligned: an old token's bytes32 symbol
  if (!w.startsWith('00') && /00$/.test(w)) {
    const text = Buffer.from(w, 'hex').toString('utf8').replace(/\0+$/, '');
    if (text.length > 0 && !text.includes('\0') && PRINTABLE.test(text))
      return { value: text, as: 'text in bytes32' };
  }
  return { value: n.toString(), as: 'number' };
}

/**
 * What an answer probably says, from its shape, when no return type was given. A guess, and always
 * said to be one: a number may be a flag, and a list of words may be a struct.
 */
export function guessValue(data: string): { value: unknown; as: string } {
  const hex = data.replace(/^0x/, '');
  if (hex.length === 0) return { value: null, as: 'nothing' };
  if (hex.length % 64 !== 0) return { value: `0x${hex}`, as: 'raw bytes' };
  const words = Array.from({ length: hex.length / 64 }, (_, i) => hex.slice(i * 64, i * 64 + 64));
  if (words.length === 1) return guessWord(words[0] as string);
  if (BigInt(`0x${words[0]}`) === 32n && words.length >= 2) {
    const n = BigInt(`0x${words[1]}`);
    const rest = words.slice(2);
    if (n <= BigInt(rest.length * 32)) {
      const count = Number(n);
      if (rest.length === Math.ceil(count / 32)) {
        const text = Buffer.from(rest.join('').slice(0, count * 2), 'hex').toString('utf8');
        if (PRINTABLE.test(text)) return { value: text, as: 'text' };
      }
      if (rest.length === count) {
        const items = rest.map(guessWord);
        return { value: items.map((x) => x.value), as: `list of ${items[0]?.as ?? 'nothing'}` };
      }
    }
  }
  const items = words.map(guessWord);
  return { value: items.map((x) => x.value), as: 'several values' };
}

/** A contract's own words when it reverted: Error(string), or null. */
export function revertReason(data: string): string | null {
  const hex = data.replace(/^0x/, '');
  if (!hex.startsWith('08c379a0')) return null;
  try {
    const [text] = decodeValues(['string'], hex.slice(8));
    return String(text);
  } catch {
    return null;
  }
}
