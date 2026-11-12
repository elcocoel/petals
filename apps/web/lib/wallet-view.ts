// A wallet chosen on the map, said in the map's Information box (WORKSPACE, wave 4: /make's flower box goes, so a
// petal press shows exactly what /map's does; Elco: "one thing to edit one thing to improve"): its name or address,
// who it is where it's named, its kind, what it holds and its share, and its dollars where the map's price allows.
// Only what the reading says. Pure. The words are drafts.
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
}

export const walletWords = {
  title: 'Wallet',
  who: 'Who it is',
  notNamed: 'Not named yet',
  kind: 'Kind',
  holds: 'Holds',
  share: 'Share',
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
