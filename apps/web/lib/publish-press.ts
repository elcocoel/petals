// Publishing what a person kept about a map, with one press (Elco, 12 Nov: "let's try to get our information
// published - I think we found names etc - but it's not yet on the global map"; on /docs: "we need this live
// soon"). The names and notes that can go are signed for once with the wallet (no transaction, nothing spent)
// and go on the shared map in the person's name; the rest stay private, each saying why. Words are drafts.
import type { PublishableData } from './agent-client.ts';

export type PublishPhase = 'ready' | 'signing' | 'published' | 'failed';

export const publishWords = {
  press: 'Publish your names and notes',
  /** how many can go, and how many stay */
  counts: (ready: number, kept: number) =>
    kept > 0
      ? `${ready} can go on the shared map in your name; ${kept} ${kept === 1 ? 'stays' : 'stay'} private.`
      : `${ready} can go on the shared map in your name.`,
  sign: 'Your wallet signs once. Nothing is spent.',
  why: 'Why some stay private',
  signing: 'Waiting for your wallet…',
  published: (n: number) => `Published on the shared map: ${n}.`,
  failed: 'That didn’t publish. Try again.',
  otherWallet: 'Sign with the wallet you signed in with.',
} as const;

export interface PublishPressView {
  /** the press, or null when nothing can go now */
  press: string | null;
  counts: string | null;
  sign: string;
  /** the private ones and why, folded */
  why: { label: string; lines: string[] } | null;
  /** what happened, once something did */
  said: string | null;
  busy: boolean;
}

export function publishPressView(
  data: PublishableData | null,
  phase: PublishPhase,
  said: string | null,
): PublishPressView | null {
  if (!data) return null;
  if (phase === 'published') {
    return { press: null, counts: null, sign: publishWords.sign, why: null, said, busy: false };
  }
  if (data.ready <= 0) return null;
  const kept = data.private.length;
  return {
    press: phase === 'signing' ? publishWords.signing : publishWords.press,
    counts: publishWords.counts(data.ready, kept),
    sign: publishWords.sign,
    why:
      kept > 0
        ? { label: publishWords.why, lines: data.private.map((p) => `${p.subject}: ${p.why}`) }
        : null,
    said: phase === 'failed' ? said : null,
    busy: phase === 'signing',
  };
}
