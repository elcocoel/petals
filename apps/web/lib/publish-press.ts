// Publishing what a person mapped, with one press (Elco, 12 Nov: "let's try to get our information published";
// 13 Nov, wave 8: "it's the heart of the promise of the protocol (collective mapping)"). The press publishes one
// signed version of the layers the Mapping box lists (SYSTEMS's publication/v1, specs/005-mapping-brain/
// composition.md §2): the wallet the person chose signs two readable lines once, no transaction, nothing spent,
// and the layers join the shared map in that wallet's name, credited per fact. Who did the work for them (their
// agent) is recorded, never credited in their place. The names that go are listed first, each with its source
// (Elco: "Let me look first"); the rest stay private, each saying why. Words are drafts.
import type { PublicationVia, PublishableData, PublishSource } from './agent-client.ts';
import { shortId } from './flower-view.ts';
import { type ProvenWallet, walletRows } from './profile-view.ts';

export type PublishPhase = 'ready' | 'signing' | 'published' | 'failed';

export const publishWords = {
  press: 'Publish in your name',
  sign: 'Your wallet signs once. Nothing is spent.',
  /** the wallet that signs, when there's more than one (composition.md §2: the person chooses) */
  signsAs: 'Signs as',
  signer: (chain: string, shown: string) => `${chain} · ${shown}`,
  /** who did the work on /make, as the publication records it */
  agent: 'Petals’ agent',
  /** who did the work, recorded with the publication (it's inside what they sign) */
  via: (v: PublicationVia) => `Mapped with ${v.name}${v.model ? ` (${v.model})` : ''}`,
  signing: 'Waiting for your wallet…',
  published: (line: string | null) =>
    line ? `On the shared map in your name: ${line}.` : 'On the shared map in your name.',
  failed: 'That didn’t publish. Try again.',
  otherWallet: 'Sign with the wallet you chose.',
  why: 'Why some stay private',
  /** the names, read before the press (Elco: "Let me look first") */
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

/** A wallet that can sign: its key, its author (CAIP-10), how the press names it, and its account, short. */
export interface Signer {
  key: string;
  author: string;
  label: string;
  shown: string;
}

/** The person's wallets that can sign a publication: each with its author, as GET /api/v1/me gives it. */
export function signersOf(wallets: readonly ProvenWallet[]): Signer[] {
  const rows = walletRows(wallets);
  return wallets.flatMap((w, i) => {
    const row = rows[i];
    return w.author && row
      ? [
          {
            key: row.key,
            author: w.author,
            label: publishWords.signer(row.chain, row.shown),
            shown: row.shown,
          },
        ]
      : [];
  });
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
  /** the wallet that signs, chosen from the person's, when they have more than one */
  signers: { label: string; options: { value: string; label: string }[]; chosen: string } | null;
  /** who did the work, as it's recorded */
  via: string | null;
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
  o: { signers: readonly Signer[]; chosen: string | null; via: PublicationVia | null },
): PublishPressView | null {
  if (!data) return null;
  const quiet = { why: null, rows: null, signers: null, via: null, busy: false };
  if (phase === 'published') return { ...quiet, press: null, sign: publishWords.sign, said };
  const signer = o.signers.find((s) => s.key === o.chosen) ?? null;
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
    signers:
      o.signers.length > 1
        ? {
            label: publishWords.signsAs,
            options: o.signers.map((s) => ({ value: s.key, label: s.label })),
            chosen: signer.key,
          }
        : null,
    via: o.via ? publishWords.via(o.via) : null,
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
