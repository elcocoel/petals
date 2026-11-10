// What Petals charges (price/v1; coordinator/pricing-protocol.md). Elco, 10 Nov: "We have a set of fees *
// multiplied * by a user defined 'tip' rate *added* protocol defined rate - just so we can either be free, or
// charge and some users can choose to 'pay more to support' - this is optional switches for now". So a
// charge on top of NEAR AI's own bill is the fees that are switched on, times the person's tip, plus the
// protocol's percent of the bill. Every switch off is Petals at cost.
import { canonicalJson, sha256Hex } from './hash.ts';

export interface Price {
  petal: 'price/v1';
  form: 'bill + fees * tip + protocol * bill';
  fees: {
    usage: { on: boolean; percent: number };
    top_up: { on: boolean; percent: number };
    per_turn: { on: boolean; usd: number };
    per_tool: { on: boolean; usd: Record<string, number> };
    free: { on: boolean; usd: number };
  };
  protocol: { on: boolean; percent: number };
  tip: { default: number; min: number; max: number };
}

/** What a charge is about: a call NEAR AI billed, a turn and the tools it used, or a top-up. */
export type Priced =
  | { kind: 'call'; billed_usd: number }
  | { kind: 'turn'; tools: Record<string, number> }
  | { kind: 'top_up'; usd: number };

export interface PetalsCharge {
  /** the fees switched on, before the tip */
  fees_usd: number;
  tip: number;
  /** the protocol's percent of the bill, which the tip doesn't touch */
  protocol_usd: number;
  /** fees × tip + protocol: what Petals takes on top of NEAR AI's bill */
  total_usd: number;
}

const usd = (n: number) => Math.round(n * 1e9) / 1e9;

/** A price's identity: the hash of its canonical JSON. Each charge names it. */
export const priceHash = (p: Price): string => sha256Hex(canonicalJson(p));

/** The person's tip, theirs or the default, and whether one they asked for is within the price's bounds. */
export const tipOf = (p: Price, asked?: number | null): number =>
  typeof asked === 'number' && Number.isFinite(asked) ? asked : p.tip.default;
export const tipAllowed = (p: Price, t: number): boolean =>
  Number.isFinite(t) && t >= p.tip.min && t <= p.tip.max;

/**
 * Petals' part of a charge, by the price's form. `billedBefore` is what NEAR AI has billed the person in all
 * before this: while that's under the free allowance (E, when it's on), Petals takes nothing.
 */
export function petalsCharge(p: Price, tip: number, e: Priced, billedBefore = 0): PetalsCharge {
  const none = { fees_usd: 0, tip, protocol_usd: 0, total_usd: 0 };
  if (p.fees.free.on && billedBefore < p.fees.free.usd) return none;
  let fees = 0;
  let protocol = 0;
  if (e.kind === 'call') {
    if (p.fees.usage.on) fees += (e.billed_usd * p.fees.usage.percent) / 100;
    if (p.protocol.on) protocol += (e.billed_usd * p.protocol.percent) / 100;
  } else if (e.kind === 'turn') {
    if (p.fees.per_turn.on) fees += p.fees.per_turn.usd;
    if (p.fees.per_tool.on) {
      for (const [tool, n] of Object.entries(e.tools)) fees += n * (p.fees.per_tool.usd[tool] ?? 0);
    }
  } else if (p.fees.top_up.on) {
    fees += (e.usd * p.fees.top_up.percent) / 100;
  }
  return {
    fees_usd: usd(fees),
    tip,
    protocol_usd: usd(protocol),
    total_usd: usd(fees * tip + protocol),
  };
}
