// The person's tip to Petals (price/v2, Elco, 10 Nov: NEAR AI's bill, a base fee, and "some form of a slider
// or scale" for an optional tip): a percent of what the AI costs, a donation charged apart from it. What a
// tip adds to a typical turn reads as every amount does, dollars first and NEAR beside (lib/pay.ts). Pure,
// so the panel only lays it out (design/side-panel.md, lines 34 to 38).
import type { Catalogue } from './composer-options.ts';
import { money, moneyWords } from './pay.ts';

/** What GET and PUT /api/v1/me/tip answer: the person's tip, and the price's scale for it. */
export interface Tip {
  tip_percent: number;
  min_percent: number;
  max_percent: number;
  step_percent: number;
}

/** A typical turn: the default model's, as its last turns measured it. */
export interface TypicalTurn {
  model: string;
  usd: number;
}

/** The default model's measured turn, or null while none is measured. */
export function typicalTurn(c: Catalogue | null): TypicalTurn | null {
  if (!c) return null;
  const m = c.providers.flatMap((p) => p.models).find((x) => x.id === c.default.model);
  return m && typeof m.usd_per_turn === 'number' && m.usd_per_turn > 0
    ? { model: m.name, usd: m.usd_per_turn }
    : null;
}

/** Drafts, for Elco's list. */
export const tipWords = {
  label: 'Tip',
  percent: (p: number) => `${p}%`,
  about:
    'An optional donation to Petals: a percent of what the AI costs you, on top of it and charged apart.',
  slider: 'Tip, as a percent of what the AI costs',
  nothing: 'Nothing on top of what the AI costs.',
  /** What it adds to a typical turn, as the model list says a turn's cost. */
  onTurn: (adds: string, turn: string, model: string) =>
    `+${adds} a turn, on a typical turn of ${turn} with ${model}.`,
  /** No turn is measured yet: only the percent. */
  noTurn: (p: number) => `${p}% of what the AI costs, each turn.`,
} as const;

/** What a tip of `percent` adds to a typical turn, in words; `near_usd` is NEAR's price, as the balance reads it. */
export function tipLine(
  percent: number,
  turn: TypicalTurn | null,
  near_usd: number | null,
): string {
  if (percent <= 0) return tipWords.nothing;
  if (!turn) return tipWords.noTurn(percent);
  const adds = moneyWords(money((turn.usd * percent) / 100, near_usd, 'cost'));
  return tipWords.onTurn(adds, moneyWords(money(turn.usd, near_usd, 'cost')), turn.model);
}
