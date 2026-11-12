// Reading every holder of an SPL token without holding the answer in memory. One
// getProgramAccounts call on the Token Program answers with every token account of a mint: 553 MB
// for TRUMP. scanHolders walks the bytes as they arrive and keeps only a running total per owner,
// so memory grows with the number of wallets, not with the size of the response.
//
// The request asks for bytes 32..72 of each account (dataSlice): the owner (32 bytes) and the
// amount (u64, little endian), so an account in the answer is
//   {"pubkey":"...","account":{"lamports":2039280,"data":["<56 base64 chars>","base64"],...}}
import { InputError } from '../errors.ts';

export interface HolderScan {
  slot: number;
  /** token accounts in the answer, empty ones included */
  token_accounts: number;
  /** token accounts with a balance */
  nonzero_accounts: number;
  /** bytes of the answer */
  bytes: number;
  /** owner (32 raw bytes as a latin1 string) -> total raw amount; only owners with a balance */
  wallets: Map<string, bigint>;
}

const DATA = Buffer.from('"data":["');
const QUOTE = 0x22;
const VALUE = Buffer.from('"value":[');
/** An answer that has not reached its account list by now is not one. */
const MAX_HEADER = 64 * 1024;

const scanFailed = (message: string) =>
  new InputError('source_failed', `Solana holder scan: ${message}`, {
    hint: 'the endpoint did not return the whole list; try another endpoint or try later',
  });

const BASE64 = new Int8Array(256).fill(-1);
for (const [i, c] of [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
].entries())
  BASE64[c.charCodeAt(0)] = i;
const PAD = 0x3d;
/** Bytes of one account's owner and amount. */
const ACCOUNT_BYTES = 40;
/** A record that starts in the bytes carried over always ends inside this much of the next chunk. */
const STITCH = 512;

export async function scanHolders(
  body: AsyncIterable<Uint8Array>,
  onBytes?: (bytes: number) => void,
): Promise<HolderScan> {
  const wallets = new Map<string, bigint>();
  // one buffer for every account: at 1.9 million accounts, allocating per account adds up
  const account = Buffer.alloc(ACCOUNT_BYTES);
  let slot: number | null = null;
  let token_accounts = 0;
  let nonzero_accounts = 0;
  let bytes = 0;
  let carry: Buffer | null = null;
  let tail = Buffer.alloc(0);

  function decode(buf: Buffer, start: number, end: number): void {
    let n = 0;
    let acc = 0;
    let bits = 0;
    for (let i = start; i < end; i++) {
      const c = buf[i] as number;
      if (c === PAD) break;
      const v = BASE64[c] as number;
      if (v < 0) throw scanFailed(`an account is not base64 (byte ${c})`);
      acc = (acc << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        if (n === ACCOUNT_BYTES) throw scanFailed('an account is longer than owner and amount');
        account[n++] = (acc >> bits) & 0xff;
        acc &= (1 << bits) - 1;
      }
    }
    if (n !== ACCOUNT_BYTES)
      throw scanFailed(`an account has ${n} bytes, expected owner and amount (${ACCOUNT_BYTES})`);
  }

  /** Take every complete record from `pos`; returns where the unfinished bytes start. */
  function eat(buf: Buffer, from: number): number {
    let pos = from;
    for (;;) {
      const at = buf.indexOf(DATA, pos);
      if (at < 0) return Math.max(pos, buf.length - DATA.length + 1); // a marker may be cut in two
      const start = at + DATA.length;
      const end = buf.indexOf(QUOTE, start);
      if (end < 0) return at;
      decode(buf, start, end);
      token_accounts++;
      if (account.readUInt32LE(32) !== 0 || account.readUInt32LE(36) !== 0) {
        nonzero_accounts++;
        const owner = account.toString('latin1', 0, 32);
        wallets.set(owner, (wallets.get(owner) ?? 0n) + account.readBigUInt64LE(32));
      }
      pos = end + 1;
    }
  }

  const keepFrom = (buf: Buffer, at: number) =>
    at < buf.length ? Buffer.from(buf.subarray(at)) : null;

  for await (const part of body) {
    bytes += part.length;
    onBytes?.(bytes);
    const chunk = Buffer.from(part.buffer, part.byteOffset, part.byteLength);
    tail = Buffer.concat([tail, chunk.subarray(-64)]).subarray(-64);

    if (slot === null) {
      const buf: Buffer = carry ? Buffer.concat([carry, chunk]) : chunk;
      carry = null;
      const at = buf.indexOf(VALUE);
      if (at < 0) {
        if (buf.length > MAX_HEADER) throw scanFailed('no account list in the answer');
        carry = Buffer.from(buf);
        continue;
      }
      const context = /"slot"\s*:\s*(\d+)/.exec(buf.toString('latin1', 0, at));
      if (!context?.[1]) throw scanFailed('the answer has no slot (withContext was asked for)');
      slot = Number(context[1]);
      carry = keepFrom(buf, eat(buf, at + VALUE.length));
      continue;
    }

    // Stitch only the small seam between chunks, so the chunk itself is never copied.
    let pos = 0;
    if (carry) {
      const had = carry.length;
      const seam = Buffer.concat([carry, chunk.subarray(0, STITCH)]);
      const stop = eat(seam, 0);
      if (chunk.length <= STITCH) {
        carry = keepFrom(seam, stop);
        continue;
      }
      if (stop < had) throw scanFailed('an account record is too long');
      pos = stop - had;
    }
    carry = keepFrom(chunk, eat(chunk, pos));
  }

  if (slot === null) {
    const text = (carry ?? Buffer.alloc(0)).toString('utf8');
    let message = text.slice(0, 300);
    try {
      const e = (JSON.parse(text) as { error?: { message?: string } }).error;
      if (e?.message) message = e.message;
    } catch {}
    throw scanFailed(`the endpoint refused: ${message}`);
  }
  // A cut connection often still ends cleanly at the HTTP level: the closing brackets must be there.
  if (!/\]\s*\}[^\]]*\}\s*$/.test(tail.toString('latin1')))
    throw scanFailed(`the answer stops after ${bytes} bytes, before its end`);
  return { slot, token_accounts, nonzero_accounts, bytes, wallets };
}

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** A public key as base58. */
export function base58(bytes: Uint8Array): string {
  let n = BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`);
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

/** A base58 public key as its raw bytes, the form a scan keeps an owner in; null when it isn't one. */
export function fromBase58(text: string, size = 32): Buffer | null {
  let n = 0n;
  for (const c of text) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) return null;
    n = n * 58n + BigInt(i);
  }
  const hex = n === 0n ? '' : n.toString(16);
  const body = Buffer.from(hex.length % 2 ? `0${hex}` : hex, 'hex');
  const zeros = text.length - text.replace(/^1+/, '').length;
  const bytes = Buffer.concat([Buffer.alloc(zeros), body]);
  if (bytes.length > size) return null;
  return Buffer.concat([Buffer.alloc(size - bytes.length), bytes]);
}

/** One rank band of folded wallets. */
export interface HolderBand {
  /** first and last rank in the band, 1 is the largest wallet */
  from: number;
  to: number;
  amount: bigint;
}

export interface FoldedHolders {
  /** the `keep` largest wallets, largest first */
  top: { address: string; amount: bigint }[];
  /** everyone else, in rank bands, largest first */
  bands: HolderBand[];
  total: bigint;
  folded_wallets: number;
  folded_amount: bigint;
}

/**
 * The largest `keep` wallets stay individual; the rest are folded into rank bands. No band holds
 * more than the smallest individual wallet, so a band never outranks a wallet: the top petals and
 * every top-k up to `keep` are the same as without folding.
 */
export function foldHolders(wallets: Map<string, bigint>, keep: number): FoldedHolders {
  const amounts = new BigUint64Array(wallets.size);
  let i = 0;
  for (const v of wallets.values()) amounts[i++] = v;
  amounts.sort(); // ascending
  const rank = (r: number) => amounts[amounts.length - r] as bigint; // rank 1 is the largest

  const kept = Math.min(keep, amounts.length);
  const floor = kept > 0 ? rank(kept) : 0n;
  const candidates: { address: string; amount: bigint }[] = [];
  for (const [owner, amount] of wallets)
    if (amount >= floor) candidates.push({ address: base58(Buffer.from(owner, 'latin1')), amount });
  candidates.sort((a, b) =>
    a.amount > b.amount
      ? -1
      : a.amount < b.amount
        ? 1
        : a.address < b.address
          ? -1
          : a.address > b.address
            ? 1
            : 0,
  );
  const top = candidates.slice(0, kept);

  let total = 0n;
  for (const v of amounts) total += v;
  const bands: HolderBand[] = [];
  let band: HolderBand | null = null;
  let folded_amount = 0n;
  for (let r = kept + 1; r <= amounts.length; r++) {
    const v = rank(r);
    folded_amount += v;
    if (band && band.amount + v <= floor) {
      band.amount += v;
      band.to = r;
    } else {
      band = { from: r, to: r, amount: v };
      bands.push(band);
    }
  }
  return { top, bands, total, folded_wallets: amounts.length - kept, folded_amount };
}
