// Publishing what a person mapped, with one press: the heart of collective mapping. The press publishes one
// signed version of the layers the Mapping box lists (publication/v1, specs/005-mapping-brain/
// composition.md §2): the wallet the person chose signs two readable lines once, no transaction, nothing spent,
// and the layers join the shared map in that wallet's name, credited per fact. The names that go are listed
// first, each with its source, to look at before the press; the rest stay private, each saying why.
import type { PublishableData, PublishSource } from './agent-client.ts';
import { shortId } from './flower-view.ts';
import { type ProvenWallet, walletRows } from './profile-view.ts';

export type PublishPhase = 'ready' | 'signing' | 'published' | 'failed';

export const publishWords = {
  press: 'Publish in your name',
  sign: 'Your wallet signs once. Nothing is spent.',
  signing: 'Waiting for your wallet…',
  published: (line: string | null) =>
    line ? `On the shared map in your name: ${line}.` : 'On the shared map in your name.',
  failed: 'That didn’t publish. Try again.',
  otherWallet: 'Sign with the wallet you chose.',
  why: 'Why some stay private',
  /** the names, read before the press */
  goes: 'Names and notes that go',
  stays: 'Stays private',
  source: (s: PublishSource) => {
    const quote = s.quote ? `: “${s.quote}”` : '';
    if (s.kind === 'proposal') return `${s.ref ? `Proposal ${s.ref}` : 'A proposal'}${quote}`;
    if (s.kind === 'transaction')
      return `${s.ref ? `Transaction ${shortId(s.ref)}` : 'A transaction'}${quote}`;
    return `${s.ref ?? s.kind}${quote}`;
  },
  confidence: (c: number) => `Confidence ${Math.round(c * 100)}%`,
} as const;

/** The wallet that signs: the person's first that names its author (GET /api/v1/me), and its account, short. */
export interface Signer {
  wallet: ProvenWallet;
  author: string;
  shown: string;
}

export function signerOf(wallets: readonly ProvenWallet[]): Signer | null {
  const wallet = wallets.find((w) => w.author);
  if (!wallet?.author) return null;
  return {
    wallet,
    author: wallet.author,
    shown: walletRows([wallet])[0]?.shown ?? wallet.account_id,
  };
}

const isNear = (w: ProvenWallet) => w.network === 'mainnet' || w.network === 'testnet';

/**
 * The wallet a press over many maps is signed by: the profile's master key, NEAR. The NEAR wallet this session
 * signed in with, else (signed in with a linked Ethereum or Solana wallet) the person's first NEAR wallet. The same
 * author goes to the read and to the prepare, so what's listed is what goes, in that name.
 */
export function nearSigner(me: {
  network: string;
  account: string | null;
  wallets: readonly ProvenWallet[];
}): Signer | null {
  const near = me.wallets.filter((w) => isNear(w) && w.author);
  const wallet =
    near.find((w) => w.network === me.network && w.account_id === me.account) ?? near[0];
  if (!wallet?.author) return null;
  return {
    wallet,
    author: wallet.author,
    shown: walletRows([wallet])[0]?.shown ?? wallet.account_id,
  };
}

/** One name in the list: what it names, where, from what, and how sure; or why it stays. */
export interface PublishRow {
  key: string;
  name: string;
  address: string;
  source: string | null;
  /** where the source can be read */
  sourceUrl: string | null;
  confidence: string | null;
  /** set on the ones that stay private: why */
  why: string | null;
}

export interface PublishPressView {
  /** the press, or null when nothing can go now */
  press: string | null;
  sign: string;
  /** the private ones and why, folded */
  why: { label: string; lines: string[] } | null;
  /** the names, read before the press: what goes, then what stays and why */
  rows: { goes: string; stays: string; going: PublishRow[]; staying: PublishRow[] } | null;
  /** what happened, once something did */
  said: string | null;
  busy: boolean;
}

const confidenceOf = (c: number | null | undefined) =>
  c === undefined || c === null ? null : publishWords.confidence(c);

export function publishPressView(
  data: PublishableData | null,
  phase: PublishPhase,
  said: string | null,
  signer: Signer | null,
): PublishPressView | null {
  if (!data) return null;
  if (phase === 'published')
    return { press: null, sign: publishWords.sign, why: null, rows: null, said, busy: false };
  if (!(data.layers?.length && signer)) return null;
  const going: PublishRow[] = (data.claims ?? []).map((c) => ({
    key: c.id,
    name: c.name,
    address: shortId(c.subject),
    source: c.source ? publishWords.source(c.source) : null,
    sourceUrl: c.source?.url ?? null,
    confidence: confidenceOf(c.confidence),
    why: null,
  }));
  const staying: PublishRow[] = data.private.map((p) => ({
    key: p.id,
    name: p.name ?? p.verb,
    address: shortId(p.subject),
    source: p.source ? publishWords.source(p.source) : null,
    sourceUrl: p.source?.url ?? null,
    confidence: confidenceOf(p.confidence),
    why: p.why,
  }));
  return {
    press: phase === 'signing' ? publishWords.signing : publishWords.press,
    sign: publishWords.sign,
    // with the list, the private ones are in it, each with why; without it, folded under one line
    why:
      staying.length > 0 && going.length === 0
        ? { label: publishWords.why, lines: data.private.map((p) => `${p.subject}: ${p.why}`) }
        : null,
    rows:
      going.length > 0
        ? { goes: publishWords.goes, stays: publishWords.stays, going, staying }
        : null,
    said: phase === 'failed' ? said : null,
    busy: phase === 'signing',
  };
}
