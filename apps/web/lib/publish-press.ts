// Publishing what a person mapped, with one press: the heart of collective mapping. The press publishes one
// signed version of the layers the Mapping box lists (publication/v1, specs/005-mapping-brain/
// composition.md §2): the wallet the person chose signs two readable lines once, no transaction, nothing spent,
// and the layers join the shared map in that wallet's name, credited per fact. The press comes first, with one
// line of what goes and a line that always says the true step (preparing, waiting for the wallet, sending); the
// names that go, each with its source, and the ones that stay private, each saying why, are folded under it.
import type { PublishableData, PublishSource } from './agent-client.ts';
import { shortId } from './flower-view.ts';
import { type ProvenWallet, walletRows } from './profile-view.ts';

/**
 * Where a press is: ready; preparing its version (the server's prepare, seconds over many maps); waiting for the
 * wallet, once its request is out; sending the signed version; then published or failed.
 */
export type PublishPhase = 'ready' | 'preparing' | 'waiting' | 'sending' | 'published' | 'failed';

/** The phases a press is running in: its button waits, and its step line runs. */
export const pressRuns = (p: PublishPhase) =>
  p === 'preparing' || p === 'waiting' || p === 'sending';

export const publishWords = {
  press: 'Publish in your name',
  sign: 'Your wallet signs once. Nothing is spent.',
  /** when the wallet isn't connected on this page as the author: it signs in first, a new QR by phone */
  signInFirst:
    'Your wallet asks you to sign in, then signs once. By phone, that’s one more scan. Nothing is spent.',
  /** the press's title, the same in every state */
  kept: 'What you’ve kept here',
  /** what goes, on its own line under the title */
  count: (layers: number) => (layers === 1 ? '1 layer' : `${layers} layers`),
  preparing: 'Preparing your version…',
  /** only once the wallet's request is out */
  waiting: 'Waiting for your wallet: sign there',
  waitingSignIn: 'Waiting for your wallet: sign in, then sign',
  sending: 'Sending it to the shared map…',
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
  /** the press's title, the same in every state; null with no press */
  title: string | null;
  /** what goes, on its own line under the title; empty until it's read */
  count: string;
  /** the press, or null when nothing can go now */
  press: string | null;
  /** the true step, from the first second: preparing, waiting for the wallet, sending, then what happened */
  step: string | null;
  /** the step is running now: it ends on a moving cursor */
  running: boolean;
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
  /** the press asks the wallet to sign in first (lib/publication-sign.ts asksSignIn) */
  signsIn = false,
): PublishPressView | null {
  if (!data) return null;
  // published, the card stays, with what joined the map; its press has nothing left to do
  if (phase === 'published')
    return {
      title: publishWords.kept,
      count: publishWords.count(data.layers?.length ?? 0),
      press: publishWords.press,
      step: said,
      running: false,
      sign: publishWords.sign,
      why: null,
      rows: null,
      said,
      busy: true,
    };
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
    title: publishWords.kept,
    count: publishWords.count(data.layers.length),
    press: publishWords.press,
    step: stepOf(phase, said, signsIn, publishWords.preparing),
    running: pressRuns(phase),
    sign: signsIn ? publishWords.signInFirst : publishWords.sign,
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
    busy: pressRuns(phase),
  };
}

/** The step line of a press in `phase`: what it's doing now, or what happened; nothing while it's ready. */
export function stepOf(
  phase: PublishPhase,
  said: string | null,
  signsIn: boolean,
  preparing: string,
): string | null {
  switch (phase) {
    case 'preparing':
      return preparing;
    case 'waiting':
      return signsIn ? publishWords.waitingSignIn : publishWords.waiting;
    case 'sending':
      return publishWords.sending;
    case 'published':
    case 'failed':
      return said;
    default:
      return null;
  }
}
