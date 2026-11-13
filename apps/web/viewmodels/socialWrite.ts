// Writing to NEAR Social from the person's own wallet (lib/near-social.ts has the standard): one call to
// `social` on mainnet, its hash, and then asking until it's confirmed. Shared by the profile's Publish and
// the Points widget's Publish (wave 8), so both send and confirm the same way. No timer: the asks run a few
// times, a moment apart, only after the person pressed Publish.
import { fastfsServes, readSocialKv, readSocialTx } from '../lib/agent-client.ts';
import { editorWords } from '../lib/lobby-view.ts';
import { SOCIAL_RECEIVER, type TxOutcome, txOutcome, WRITE_GAS } from '../lib/near-social.ts';
import { sentBy } from '../lib/pay.ts';
import { callFunction } from '../lib/wallet.ts';

/** How many times to ask, and how far apart: NEAR Social usually has a write within about 3 s. */
const ASKS = 20;
const APART_MS = 1500;

/** A step that stops the write, with the words to say why. */
export class Stop extends Error {}

export const pause = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
export const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const hashIn = (s: string) => /\b[1-9A-HJ-NP-Za-km-z]{43,44}\b/.exec(s)?.[0] ?? null;

/** One call to `social` from the wallet; its transaction's hash, or Stop when nothing was sent. */
export async function send(method: string, args: object | Uint8Array): Promise<string> {
  let said = '';
  try {
    const hash = sentBy(
      await callFunction('mainnet', SOCIAL_RECEIVER, method, args, WRITE_GAS),
    )?.hash;
    if (hash) return hash;
  } catch (e) {
    // Some wallets report the expected CodeDoesNotExist as an error; the hash in it is still the write.
    said = message(e);
    const hash = hashIn(said);
    if (hash) return hash;
  }
  throw new Stop(editorWords.refused);
}

/** What NEAR Social's indexer did with the transaction, asked a few times while it hasn't seen it. */
export async function confirmed(hash: string): Promise<TxOutcome> {
  for (let i = 0; i < ASKS; i++) {
    const out = txOutcome(await readSocialTx(hash).catch(() => null));
    if (out.kind !== 'waiting') return out;
    await pause(APART_MS);
  }
  return { kind: 'waiting' };
}

/** Whether FastFS serves a stored file yet, asked a few times. */
export async function served(url: string): Promise<boolean> {
  for (let i = 0; i < ASKS; i++) {
    if (await fastfsServes(url, `${Date.now()}-${i}`).catch(() => false)) return true;
    await pause(APART_MS);
  }
  return false;
}

/** NEAR Social took it, or Stop with why not. */
export const accepted = (out: TxOutcome) => {
  if (out.kind === 'refused') throw new Stop(editorWords.rejected(out.why.join('; ')));
  if (out.kind === 'waiting') throw new Stop(editorWords.slow);
};

/**
 * Whether a key outside NEAR Social's standard (its indexer ignores those) is kept under the account yet,
 * read back from FastData KV's public reader, asked a few times: the key's latest value, or null.
 */
export async function keptOnKv(account: string, key: string): Promise<unknown> {
  for (let i = 0; i < ASKS; i++) {
    const value = await readSocialKv(account, key).catch(() => null);
    if (value !== null) return value;
    await pause(APART_MS);
  }
  return null;
}
