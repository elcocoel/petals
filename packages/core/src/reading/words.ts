// The words a reading uses for what the encodings resolve to, kept apart from how they look.
import type { Kind } from '../types/index.ts';

/** Legend label per kind of account; this order is the legend's (first wins on a shared label). */
export const KIND_LABELS: Record<Kind, string> = {
  mining_pool: 'pool',
  staking_pool: 'pool',
  validator: 'pool',
  exchange: 'exchange',
  custodian: 'custodian',
  staking_entity: 'liquid staking',
  contract: 'contract',
  treasury: 'treasury',
  organisation: 'person or organisation',
  person: 'person or organisation',
  delegator: 'delegator',
  group: 'group',
  unknown: 'unknown',
};

export const KIND_ORDER: Kind[] = Object.keys(KIND_LABELS) as Kind[];

const OTHER_COLOUR_LABELS: Record<string, string> = {
  named: 'named',
  anonymous: 'anonymous',
  single: 'every petal',
};

/** The words for a colour key: a kind, `named`, `anonymous` or `single`. */
export function colourLabel(key: string): string {
  return OTHER_COLOUR_LABELS[key] ?? KIND_LABELS[key as Kind] ?? KIND_LABELS.unknown;
}

/** 0.0561 -> "5.61%"; 0.1234 -> "12.3%"; under 0.1% -> "<0.1%" (the spike's format). */
export function pct(x: number): string {
  if (x >= 0.1) return `${(x * 100).toFixed(1)}%`;
  if (x >= 0.001) return `${(x * 100).toFixed(2)}%`;
  return '<0.1%';
}
