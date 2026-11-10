// What a person pays for Petals' agent (price/v2; coordinator/pricing-protocol.md). Elco, 10 Nov: "there's
// three components to the price. There is the inevitable payment that we have to collect to pay for the AI.
// We have to know that price. Then we can add a base fee, which would be unavoidable. And then a tip, an
// optional donation type payment ... how much the users tip in relation to their usage, they could set it".
// So a charge is NEAR AI's own bill, plus the base fee (each part a switch), plus the person's tip: a percent
// of their usage on a scale they set, a donation, always charged apart. Every switch off and a tip of 0 is
// Petals at cost. It replaces price/v1, whose fees were multiplied by a tip; v1's schema stays readable.
import { canonicalJson, sha256Hex } from './hash.ts';

export interface Price {
  petal: 'price/v2';
  form: 'bill + base + tip';
  base: {
    usage: { on: boolean; percent: number };
    top_up: { on: boolean; percent: number };
    per_turn: { on: boolean; usd: number };
    per_tool: { on: boolean; usd: Record<string, number> };
    free: { on: boolean; usd: number };
  };
  tip: {
    of: 'bill';
    default_percent: number;
    min_percent: number;
    max_percent: number;
    step_percent: number;
  };
}

/** What a part of the price is about: a call NEAR AI billed, a turn and the tools it used, or a top-up. */
export type Priced =
  | { kind: 'call'; billed_usd: number }
  | { kind: 'turn'; tools: Record<string, number> }
  | { kind: 'top_up'; usd: number };

const usd = (n: number) => Math.round(n * 1e9) / 1e9;

/** A price's identity: the hash of its canonical JSON. Each charge names it. */
export const priceHash = (p: Price): string => sha256Hex(canonicalJson(p));

/**
 * The base fee for one priced thing: its switches that are on. `billedBefore` is what NEAR AI has billed the
 * person in all before this: while that's under the free allowance (when it's on), the base fee is nothing.
 */
export function baseFee(p: Price, e: Priced, billedBefore = 0): number {
  const b = p.base;
  if (b.free.on && billedBefore < b.free.usd) return 0;
  if (e.kind === 'call') return b.usage.on ? usd((e.billed_usd * b.usage.percent) / 100) : 0;
  if (e.kind === 'top_up') return b.top_up.on ? usd((e.usd * b.top_up.percent) / 100) : 0;
  let fee = b.per_turn.on ? b.per_turn.usd : 0;
  if (b.per_tool.on) {
    for (const [tool, n] of Object.entries(e.tools)) fee += n * (b.per_tool.usd[tool] ?? 0);
  }
  return usd(fee);
}

/** The person's tip on a call: their percent of its bill. A donation, so it's charged apart from the fee. */
export const tipOn = (billedUsd: number, percent: number): number =>
  usd((billedUsd * percent) / 100);

/** Their tip percent, or the price's default; and whether one they ask for is on the price's scale. */
export const tipPercentOf = (p: Price, asked?: number | null): number =>
  typeof asked === 'number' && Number.isFinite(asked) ? asked : p.tip.default_percent;
export function tipAllowed(p: Price, percent: number): boolean {
  const { min_percent: min, max_percent: max, step_percent: step } = p.tip;
  if (!Number.isFinite(percent) || percent < min || percent > max) return false;
  const steps = (percent - min) / step;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}
