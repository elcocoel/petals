// Publishing helpers shared by the publish page and the tests. No @petal/* values here: this file
// runs in the browser too, so it imports types only.
//
// Flow (shared-map.md, Writing, Phase A: relayed publish): prepare_publish gives entry_sha256,
// nonce, recipient and the message; the maker signs the message with NEP-413 in a wallet; the
// site sends the proof to publish_flower, which verifies it and writes with Petal's writer.
import type { Entry, Nep413Proof } from '@petal/core/types';

/** What prepare_publish takes: an entry without `id` and without `provenance.maker`. */
export type EntryDraft = Omit<Entry, 'id' | 'provenance'> & {
  provenance: Omit<Entry['provenance'], 'maker'>;
};

/** prepare_publish output (tools.md). */
export interface Prepared {
  entry_sha256: string;
  nonce: string;
  recipient: string;
  message: string;
  expires_at: string;
  sign_url?: string;
}

/** publish_flower output (tools.md). */
export interface Published {
  id: string;
  key: string;
  receiver: string;
  writer: string;
  tx_hash: string;
  explorer_url: string;
  gallery_url: string;
}

export const DEFAULT_RECIPIENT = 'petals.testnet';

/** The network a prepared entry is signed on: its recipient's (petals.near is mainnet's map). */
export const networkOf = (recipient: string): 'testnet' | 'mainnet' =>
  recipient.endsWith('.testnet') ? 'testnet' : 'mainnet';

/** The exact text a maker signs (shared-map.md): {"petal":"publish/v1","entry_sha256":"…"}. */
export function publishMessage(entrySha256: string): string {
  return JSON.stringify({ petal: 'publish/v1', entry_sha256: entrySha256 });
}

export function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** What a near-connect wallet returns for a signed message. */
export interface WalletSignature {
  accountId: string;
  publicKey: string;
  signature: string;
}

/** The proof publish_flower takes, from a wallet's signature over a prepared message. */
export function proofFrom(signed: WalletSignature, p: Prepared): Nep413Proof {
  return {
    type: 'nep413',
    account_id: signed.accountId,
    public_key: signed.publicKey,
    signature: signed.signature,
    message: p.message,
    nonce: p.nonce,
    recipient: p.recipient,
  };
}

export const isEntrySha = (s: string): boolean => /^[0-9a-f]{64}$/.test(s);

/**
 * What /publish/[draft] holds. A run id: the page loads the run's flower and calls prepare_publish
 * itself. An entry_sha256 with ?nonce= (a sign_url from prepare_publish, for a maker whose own
 * agent made the flower): the page signs that prepared draft as it is.
 */
export type PublishTarget =
  | { kind: 'run'; run_id: string }
  | { kind: 'prepared'; prepared: Prepared }
  | { kind: 'bad'; error: string };

export function publishTarget(
  draft: string,
  query: Record<string, string | string[] | undefined>,
): PublishTarget {
  const one = (k: string) => {
    const v = query[k];
    return Array.isArray(v) ? v[0] : v;
  };
  if (isEntrySha(draft)) {
    const nonce = one('nonce');
    if (!nonce) {
      return {
        kind: 'bad',
        error:
          'This link names a prepared entry but carries no nonce. Ask your agent for a fresh sign_url (prepare_publish).',
      };
    }
    return {
      kind: 'prepared',
      prepared: {
        entry_sha256: draft,
        nonce,
        recipient: one('recipient') ?? DEFAULT_RECIPIENT,
        message: one('message') ?? publishMessage(draft),
        expires_at: one('expires_at') ?? '',
      },
    };
  }
  if (/^[A-Za-z0-9_-]{1,128}$/.test(draft)) return { kind: 'run', run_id: draft };
  return { kind: 'bad', error: 'This is not a run id or an entry hash.' };
}

export function explorerTxUrl(txHash: string, network: 'testnet' | 'mainnet' = 'testnet'): string {
  return network === 'testnet'
    ? `https://testnet.nearblocks.io/txns/${txHash}`
    : `https://nearblocks.io/txns/${txHash}`;
}
