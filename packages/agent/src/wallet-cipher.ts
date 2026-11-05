// Wallet addresses at rest (SYS-025, T192): AES-256-GCM, with a keyed hash as the unique index, so a
// copy of private.db (a backup on an external drive, say) doesn't say who is who. The hash has to be
// keyed: anyone could run a plain hash over every public account name and test a stolen file. The key
// comes from the environment and never reaches the database.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

export interface WalletCipher {
  seal(address: string): string;
  /** Throws when it was sealed under another key. */
  open(sealed: string): string;
  /** The same address gives the same index, under the same key. */
  index(address: string): string;
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

/** 64 hex characters or base64 of at least 32 bytes, as `openssl rand -hex 32` makes. */
export function parseWalletKey(value: string): Uint8Array {
  const v = value.trim();
  const bytes = /^[0-9a-fA-F]{64}$/.test(v) ? Buffer.from(v, 'hex') : Buffer.from(v, 'base64');
  if (bytes.length < 32) {
    throw new Error('PETAL_WALLET_KEY must be at least 32 bytes: try `openssl rand -hex 32`.');
  }
  return bytes;
}

export function walletCipher(secret: Uint8Array): WalletCipher {
  const derive = (info: string) => new Uint8Array(hkdfSync('sha256', secret, '', info, 32));
  const sealing = derive('petal/wallet/seal');
  const indexing = derive('petal/wallet/index');
  return {
    seal(address) {
      const iv = randomBytes(IV_BYTES);
      const c = createCipheriv('aes-256-gcm', sealing, iv);
      const body = Buffer.concat([c.update(address, 'utf8'), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
    },
    open(sealed) {
      const all = Buffer.from(sealed, 'base64');
      const d = createDecipheriv('aes-256-gcm', sealing, all.subarray(0, IV_BYTES));
      d.setAuthTag(all.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      return Buffer.concat([d.update(all.subarray(IV_BYTES + TAG_BYTES)), d.final()]).toString(
        'utf8',
      );
    },
    index: (address) => createHmac('sha256', indexing).update(address, 'utf8').digest('hex'),
  };
}

/**
 * The cipher a server uses. A bad key always stops the start. No key stops a real server that spends
 * in gated mode. Everywhere else (a test, `next dev`, the open local app, the keyless copy that spends
 * nothing) it's a throwaway key, generated at the first sign-in with one warning line: wallets bound
 * under it can't be read after a restart.
 */
export function walletCipherFrom(
  env: Record<string, string | undefined>,
  o: { gated: boolean; spends: boolean; warn?: (line: string) => void },
): () => WalletCipher {
  const key = env.PETAL_WALLET_KEY?.trim();
  if (key) {
    const cipher = walletCipher(parseWalletKey(key));
    return () => cipher;
  }
  const dev = env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
  if (o.gated && o.spends && !dev) {
    throw new Error(
      'petal: PETAL_WALLET_KEY is not set, so this server refuses to start: it would keep wallet addresses under a key that dies with the process. Set it with `openssl rand -hex 32`, or PETAL_AGENT_ACCESS=open for your own local tool.',
    );
  }
  let throwaway: WalletCipher | undefined;
  return () => {
    if (!throwaway) {
      (o.warn ?? console.warn)(
        "petal: PETAL_WALLET_KEY is not set, so wallets are sealed under a throwaway key: they can't be read after a restart. Fine for development only.",
      );
      throwaway = walletCipher(randomBytes(32));
    }
    return throwaway;
  };
}
