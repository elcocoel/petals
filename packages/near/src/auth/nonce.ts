// issueNonce (T041): 32 random bytes (base64), valid 5 minutes, used once. NEP-413 nonces are
// exactly 32 bytes; the docs' UUID example is 36 bytes and wallets reject it.
//
// The store is in memory, in the process that issues and verifies (Petal's server, or `petal mcp`).
// A nonce is reserved while its proof is checked, so two requests with one proof cannot both pass;
// it is spent when the proof passes, and released when a check could not finish (RPC down), so the
// maker does not have to sign again.
import { base64 } from '@scure/base';

export const NONCE_BYTES = 32;
export const NONCE_TTL_MS = 5 * 60_000;
/** outstanding nonces kept at most; the oldest are dropped first */
const MAX_OUTSTANDING = 10_000;

type State = 'issued' | 'checking' | 'used';
interface Slot {
  expires: number;
  state: State;
}

export type NonceCheck = 'ok' | 'unknown' | 'used' | 'expired';

export interface NonceStore {
  issue(): { nonce: string; expires_at: string };
  /** take the nonce for one check; anything but 'ok' means the proof must fail */
  reserve(nonce: string): NonceCheck;
  /** the proof passed: the nonce can never be used again */
  spend(nonce: string): void;
  /** the check could not finish: the nonce may be tried again until it expires */
  release(nonce: string): void;
}

export function createNonceStore(ttlMs = NONCE_TTL_MS): NonceStore {
  const slots = new Map<string, Slot>();
  const prune = (now: number) => {
    for (const [n, s] of slots) if (s.expires <= now && s.state !== 'checking') slots.delete(n);
    while (slots.size >= MAX_OUTSTANDING) {
      const oldest = slots.keys().next().value as string;
      slots.delete(oldest);
    }
  };
  return {
    issue() {
      const now = Date.now();
      prune(now);
      const nonce = base64.encode(crypto.getRandomValues(new Uint8Array(NONCE_BYTES)));
      const expires = now + ttlMs;
      slots.set(nonce, { expires, state: 'issued' });
      return { nonce, expires_at: new Date(expires).toISOString() };
    },
    reserve(nonce) {
      const slot = slots.get(nonce);
      if (!slot) return 'unknown';
      if (slot.state !== 'issued') return 'used';
      if (Date.now() >= slot.expires) return 'expired';
      slot.state = 'checking';
      return 'ok';
    },
    spend(nonce) {
      const slot = slots.get(nonce);
      if (slot) slot.state = 'used';
    },
    release(nonce) {
      const slot = slots.get(nonce);
      if (slot?.state === 'checking') slot.state = 'issued';
    },
  };
}

/** The store issueNonce and verifyNep413 share. */
export const defaultNonces: NonceStore = createNonceStore();

/** 32 random bytes, base64, single use, short TTL. */
export function issueNonce(): { nonce: string; expires_at: string } {
  return defaultNonces.issue();
}
