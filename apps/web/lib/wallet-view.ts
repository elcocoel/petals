// A wallet chosen on the map, said in the map's Information box (/make has no flower box of its own, so a
// petal press shows exactly what /map's does: one thing to edit, one to improve): its name or address,
// who it is where it's named, its kind, what it holds and its share, and its dollars where the map's price allows.
// Only what the reading says. Pure.
import type { ReadingPetal } from '@petal/core/types';
import { type MapValue, petalWorth } from './value-view.ts';

export interface WalletView {
  /** its name, or its address */
  title: string;
  /** its address, where its name says something else */
  address: string | null;
  /** each fact: what it is, then the value */
  facts: [string, string][];
  /** its dollars where priced, and where that price was read */
  worth: { text: string; source: string; link?: string } | null;
  /** where authors stated different values for it: each piece, who stated the value drawn, and each other
   * value with who stated it */
  differs?: readonly {
    what: string;
    drawnBy: string;
    values: readonly { value: string; by: string }[];
  }[];
}

export const walletWords = {
  title: 'Wallet',
  who: 'Who it is',
  notNamed: 'Not named yet',
  kind: 'Kind',
  holds: 'Holds',
  share: 'Share',
  /** Where authors differ (composition.md §5): both stand, read-only. */
  differ:
    'Authors differ here. Both values stand and anyone can check; two reads of one block should agree, so one is probably wrong.',
  value: (value: string, by: string) => `${value} by ${by}`,
  drawn: (by: string) => `drawn as ${by} stated it`,
} as const;

/** 0.081877 → 8.19%; under a tenth of a percent, said so. */
const percent = (x: number) => (x >= 0.001 ? `${(x * 100).toFixed(2)}%` : '<0.1%');

/** 1234567.5 → 1,234,567.5 (no rounding away of what's held). */
const amountWords = (a: string) => {
  const n = Number(a);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 4 }) : a;
};

export function walletView(
  p: Pick<ReadingPetal, 'id' | 'name' | 'kind' | 'identity' | 'amount' | 'share'>,
  value: MapValue | null | undefined,
): WalletView {
  const unit = value?.totals.find((t) => t.measure === value.measure)?.unit;
  const worth = value?.measure ? petalWorth(p.amount, value.measure, value) : null;
  return {
    title: p.name || p.id,
    address: p.name && p.name !== p.id ? p.id : null,
    facts: [
      [walletWords.who, p.identity?.name ?? walletWords.notNamed],
      [walletWords.kind, String(p.kind).replaceAll('_', ' ')],
      [walletWords.holds, unit ? `${amountWords(p.amount)} ${unit}` : amountWords(p.amount)],
      [walletWords.share, percent(p.share)],
    ],
    worth: worth && worth !== 'no price' ? worth : null,
  };
}

/** An account by its address alone, as a petal may name it and as credit/v1 names it (CAIP-10). */
const bare = (id: string) => (id.split(':').at(-1) ?? id).toLowerCase();

/**
 * Where authors stated different values for a wallet (composition.md §5, §9 credit): each piece, its values and who
 * stated each, named as the map's authors say. Read-only; none erased.
 */
export function differsOf(
  credit:
    | {
        pieces?: Record<
          string,
          Record<
            string,
            {
              by?: readonly string[];
              differs?: readonly { value: string; by: readonly string[] }[];
            }
          >
        >;
        authors?: Record<string, { name?: string | null }>;
      }
    | undefined,
  participant: string,
  wordsOf: (piece: string) => string,
): { what: string; drawnBy: string; values: { value: string; by: string }[] }[] {
  const names = credit?.authors ?? {};
  const who = (a: string) => names[a]?.name ?? bare(a);
  const out: { what: string; drawnBy: string; values: { value: string; by: string }[] }[] = [];
  for (const [piece, byParticipant] of Object.entries(credit?.pieces ?? {})) {
    const key = Object.keys(byParticipant).find((k) => bare(k) === bare(participant));
    const entry = key ? byParticipant[key] : undefined;
    const differs = entry?.differs;
    if (!differs || differs.length === 0) continue;
    out.push({
      what: wordsOf(piece),
      drawnBy: (entry?.by ?? []).map(who).join(', '),
      values: differs.map((d) => ({ value: d.value, by: d.by.map(who).join(', ') })),
    });
  }
  return out;
}
