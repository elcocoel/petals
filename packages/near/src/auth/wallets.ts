// Wallets beyond NEAR (Elco, 12 Nov, wave 5: "multi chain wallet connection"; "evm is priority, is solana is simple
// we do it"): an EVM wallet signs in, or is added to an account, with one signed message (EIP-191 personal_sign on a
// Sign-In with Ethereum text, EIP-4361), one wallet for every EVM chain; a Solana wallet the same with its ed25519
// signMessage. As NEP-413 does for NEAR: the message names this site and a nonce the server issued, it expires,
// and the nonce is spent once. Nothing here asks a chain: a signature names its key, and the key is the address.
import { ed25519 } from '@noble/curves/ed25519.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { base58, base64 } from '@scure/base';
import type { NonceStore } from './nonce.ts';

/** An EVM wallet's proof: the message it signed with personal_sign, and the signature (0x, 65 bytes). */
export interface Eip191Proof {
  type: 'eip191';
  address: string;
  message: string;
  signature: string;
}

/** A Solana wallet's proof: the message it signed with signMessage, and the signature (base64, 64 bytes). */
export interface SolanaProof {
  type: 'ed25519';
  address: string;
  message: string;
  signature: string;
}

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** A nonce as a SIWE message can carry it: alphanumeric (EIP-4361), the issued nonce's bytes in hex. */
export const siweNonce = (nonce: string): string => bytesToHex(base64.decode(nonce));
/** The issued nonce back from its hex form. */
const issuedNonce = (hex: string): string => base64.encode(hexToBytes(hex));

/** An EVM address with its checksum (EIP-55), as wallets and SIWE write it. */
export function checksumAddress(address: string): string {
  const lower = address.toLowerCase().replace(/^0x/, '');
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)));
  let out = '0x';
  for (let i = 0; i < lower.length; i++)
    out +=
      Number.parseInt(hash[i] as string, 16) >= 8 ? (lower[i] as string).toUpperCase() : lower[i];
  return out;
}

/**
 * The Sign-In with Ethereum text (EIP-4361) a wallet signs: this site, the address, the chain it's on, the nonce
 * the server issued, when, and until when. Wallets that know SIWE show it as a sign-in.
 */
export function siweMessage(o: {
  domain: string;
  uri: string;
  address: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  statement: string;
}): string {
  return [
    `${o.domain} wants you to sign in with your Ethereum account:`,
    checksumAddress(o.address),
    '',
    o.statement,
    '',
    `URI: ${o.uri}`,
    'Version: 1',
    `Chain ID: ${o.chainId}`,
    `Nonce: ${siweNonce(o.nonce)}`,
    `Issued At: ${o.issuedAt}`,
    `Expiration Time: ${o.expiresAt}`,
  ].join('\n');
}

/** The plain text a Solana wallet signs: the same facts, in words. */
export function solanaMessage(o: {
  domain: string;
  address: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  statement: string;
}): string {
  return [
    `${o.domain} wants you to sign in with your Solana account:`,
    o.address,
    '',
    o.statement,
    '',
    `Nonce: ${siweNonce(o.nonce)}`,
    `Issued At: ${o.issuedAt}`,
    `Expiration Time: ${o.expiresAt}`,
  ].join('\n');
}

/** A field of a signed message, by its label. */
const field = (message: string, label: string): string | null =>
  message
    .split('\n')
    .find((l) => l.startsWith(`${label}: `))
    ?.slice(label.length + 2)
    .trim() ?? null;

/** The address that signed an EIP-191 personal_sign message, lower case; null for a signature that names none. */
export function eip191Signer(message: string, signature: string): string | null {
  try {
    const sig = hexToBytes(signature.replace(/^0x/, ''));
    if (sig.length !== 65) return null;
    const v = sig[64] as number;
    const recovery = v >= 27 ? v - 27 : v;
    if (recovery !== 0 && recovery !== 1) return null;
    const bytes = utf8ToBytes(message);
    const digest = keccak_256(
      new Uint8Array([...utf8ToBytes(`\x19Ethereum Signed Message:\n${bytes.length}`), ...bytes]),
    );
    const point = secp256k1.Signature.fromBytes(sig.slice(0, 64), 'compact')
      .addRecoveryBit(recovery)
      .recoverPublicKey(digest);
    const key = point.toBytes(false).slice(1);
    return `0x${bytesToHex(keccak_256(key).slice(-20))}`;
  } catch {
    return null;
  }
}

/** Does this Solana address's key sign this message to this signature? */
export function solanaSigned(address: string, message: string, signature: string): boolean {
  try {
    return ed25519.verify(base64.decode(signature), utf8ToBytes(message), base58.decode(address));
  } catch {
    return false;
  }
}

/**
 * A proof from an EVM or Solana wallet, checked as NEP-413 is: the message names this site and the nonce the
 * server issued, it hasn't expired, the signature is the address's, and the nonce is spent so it serves once.
 * `ok` with the wallet's address (EVM in lower case) or why not.
 */
export async function verifyWalletProof(
  proof: Eip191Proof | SolanaProof,
  expect: { domain: string; now: Date },
  nonces: NonceStore,
): Promise<{ ok: true; address: string } | { ok: false; reason: string }> {
  const evm = proof?.type === 'eip191';
  if (!proof || (proof.type !== 'eip191' && proof.type !== 'ed25519'))
    return { ok: false, reason: 'the proof is neither an EVM (eip191) nor a Solana (ed25519) one' };
  const { address, message, signature } = proof;
  if (typeof address !== 'string' || typeof message !== 'string' || typeof signature !== 'string')
    return { ok: false, reason: 'the proof needs address, message and signature' };
  if (evm ? !EVM_ADDRESS.test(address) : !SOLANA_ADDRESS.test(address))
    return { ok: false, reason: `${address} is not ${evm ? 'an EVM' : 'a Solana'} address` };
  const kind = evm ? 'Ethereum' : 'Solana';
  if (!message.startsWith(`${expect.domain} wants you to sign in with your ${kind} account:\n`))
    return { ok: false, reason: `the message is not this site's (${expect.domain})` };
  const named = message.split('\n')[1]?.trim() ?? '';
  if ((evm ? named.toLowerCase() : named) !== (evm ? address.toLowerCase() : address))
    return { ok: false, reason: 'the message names another address' };
  const expires = field(message, 'Expiration Time');
  if (!expires || Number.isNaN(Date.parse(expires)) || Date.parse(expires) <= expect.now.getTime())
    return { ok: false, reason: 'the message has expired' };
  const hex = field(message, 'Nonce');
  if (!hex || !/^[0-9a-f]{64}$/.test(hex))
    return { ok: false, reason: 'the message has no nonce from this site' };
  const nonce = issuedNonce(hex);
  const reserved = await nonces.reserve(nonce);
  if (reserved !== 'ok') return { ok: false, reason: `the nonce is ${reserved}` };
  const signed = evm
    ? eip191Signer(message, signature) === address.toLowerCase()
    : solanaSigned(address, message, signature);
  if (!signed) {
    await nonces.release(nonce);
    return { ok: false, reason: 'the signature is not this address' };
  }
  await nonces.spend(nonce);
  return { ok: true, address: evm ? address.toLowerCase() : address };
}
