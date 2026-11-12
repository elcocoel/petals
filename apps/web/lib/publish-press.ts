// Publishing what a person kept about a map, with one press (Elco, 12 Nov: "let's try to get our information
// published - I think we found names etc - but it's not yet on the global map"; on /docs: "we need this live
// soon"). The names and notes that can go are signed for once with the wallet (no transaction, nothing spent)
// and go on the shared map in the person's name; the rest stay private, each saying why. Words are drafts.
import type { PublishableData, PublishSource } from './agent-client.ts';
import { shortId } from './flower-view.ts';

export type PublishPhase = 'ready' | 'signing' | 'published' | 'failed';

export const publishWords = {
  press: 'Publish your names and notes',
  /** with readings too (wave 7) */
  pressAll: 'Publish in your name',
  readings: 'Readings you drew',
  readingsCount: (n: number) =>
    n === 1 ? '1 reading you drew goes with them.' : `${n} readings you drew go with them.`,
  publishedAll: (claims: number, readings: number) =>
    readings > 0
      ? `Published on the shared map: ${claims} names and notes, ${readings} ${readings === 1 ? 'reading' : 'readings'}.`
      : `Published on the shared map: ${claims}.`,
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
  /** the list, read before the press (Elco: "Let me look first") */
  goes: 'What goes on the shared map',
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

/** One item in the list: what it names, where, from what, and how sure; or why it stays. */
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
  counts: string | null;
  sign: string;
  /** the private ones and why, folded */
  why: { label: string; lines: string[] } | null;
  /** every item, read before the press: what goes, then what stays and why */
  rows: {
    goes: string;
    stays: string;
    going: PublishRow[];
    staying: PublishRow[];
    /** the readings that go with them, credited to the person (wave 7) */
    readings?: { heading: string; rows: PublishRow[] } | undefined;
  } | null;
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
    return {
      press: null,
      counts: null,
      sign: publishWords.sign,
      why: null,
      rows: null,
      said,
      busy: false,
    };
  }
  const drawn = data.readings ?? [];
  if (data.ready <= 0 && drawn.length === 0) return null;
  const kept = data.private.length;
  const readingRows: PublishRow[] = drawn.map((r) => ({
    key: r.id,
    name: r.what || r.title,
    address: `${r.accounts} accounts`,
    source: null,
    sourceUrl: null,
    confidence: null,
    why: null,
  }));
  const going: PublishRow[] = (data.claims ?? []).map((c) => ({
    key: c.id,
    name: c.name,
    address: shortId(c.subject),
    source: c.source ? publishWords.source(c.source) : null,
    sourceUrl: c.source?.url ?? null,
    confidence:
      c.confidence === undefined || c.confidence === null
        ? null
        : publishWords.confidence(c.confidence),
    why: null,
  }));
  const staying: PublishRow[] = data.private.map((p) => ({
    key: p.id,
    name: p.name ?? p.verb,
    address: shortId(p.subject),
    source: p.source ? publishWords.source(p.source) : null,
    sourceUrl: p.source?.url ?? null,
    confidence:
      p.confidence === undefined || p.confidence === null
        ? null
        : publishWords.confidence(p.confidence),
    why: p.why,
  }));
  return {
    press:
      phase === 'signing'
        ? publishWords.signing
        : drawn.length > 0
          ? publishWords.pressAll
          : publishWords.press,
    counts: [
      data.ready > 0 ? publishWords.counts(data.ready, kept) : null,
      drawn.length > 0 ? publishWords.readingsCount(drawn.length) : null,
    ]
      .filter(Boolean)
      .join(' '),
    sign: publishWords.sign,
    // with the list, the private ones are in it, each with why; without it, folded under one line
    why:
      kept > 0 && going.length === 0
        ? { label: publishWords.why, lines: data.private.map((p) => `${p.subject}: ${p.why}`) }
        : null,
    rows:
      going.length > 0 || readingRows.length > 0
        ? {
            goes: publishWords.goes,
            stays: publishWords.stays,
            going,
            staying,
            ...(readingRows.length > 0
              ? { readings: { heading: publishWords.readings, rows: readingRows } }
              : {}),
          }
        : null,
    said: phase === 'failed' ? said : null,
    busy: phase === 'signing',
  };
}
