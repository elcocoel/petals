// The composer's model picker: what's picked, what really answered, and what can be picked instead. Every
// option comes from the catalogue (GET /api/v1/catalogue). Pure, so the views only lay it out.
import { type Money, money } from './pay.ts';

export interface Settings {
  provider: string;
  model: string;
  effort: string | null;
  permissions: string;
}

export interface CatalogueModel {
  id: string;
  name: string;
  promise: 'signed' | 'enclave' | 'passed_through';
  runs_at: string;
  default_effort: string | null;
  usd_per_flower: number;
  /** What a turn costs here, measured: the median of its last turns, as NEAR AI bills them; null until one is (SYSTEMS, 10 Nov). */
  usd_per_turn?: number | null;
}

export interface Catalogue {
  default: Settings;
  providers: { id: string; models: CatalogueModel[] }[];
}

const PROMISE: Record<CatalogueModel['promise'], string> = {
  signed: 'Signed',
  enclave: 'In an enclave',
  passed_through: 'Passed through',
};

const modelOf = (c: Catalogue, id: string) =>
  c.providers.flatMap((p) => p.models).find((m) => m.id === id);

/** The name of what's picked, and of what really answered last, when that isn't it. */
export function modelPill(c: Catalogue, s: Settings, answered: string | null): string {
  const picked = modelOf(c, s.model)?.name ?? s.model;
  if (!answered || answered === s.model) return picked;
  return `${picked}  ·  ran ${modelOf(c, answered)?.name ?? answered}`;
}

export interface ModelOption {
  id: string;
  label: string;
  /** what it promises, where it runs, and what a turn costs once that's measured: dollars, NEAR beside */
  sub: string;
  on: boolean;
}

/**
 * `near_usd` is NEAR's price, as the one balance read it (useFunds), so a turn's cost reads as the balance
 * does (Elco, 10 Nov: dollars first, NEAR beside). A model with no measured turn says nothing of cost.
 */
export function modelOptions(c: Catalogue, s: Settings, near_usd: number | null): ModelOption[] {
  const provider = c.providers.find((p) => p.id === s.provider);
  return (provider?.models ?? []).map((m) => ({
    id: m.id,
    label: m.name,
    sub: [
      PROMISE[m.promise],
      m.runs_at,
      typeof m.usd_per_turn === 'number'
        ? `${turnCost(money(m.usd_per_turn, near_usd, 'cost'))}`
        : null,
    ]
      .filter(Boolean)
      .join('  ·  '),
    on: m.id === s.model,
  }));
}

/** A turn's cost: "$0.012 a turn · 0.003 NEAR". A draft (WORKSPACE, LOBBY, 10 Nov). */
const turnCost = (m: Money) =>
  m.near === null ? `$${m.usd} a turn` : `$${m.usd} a turn · ${m.near} NEAR`;

/** A new model brings its own effort: its default, or none if it offers none. */
export function withModel(c: Catalogue, s: Settings, id: string): Settings {
  return { ...s, model: id, effort: modelOf(c, id)?.default_effort ?? null };
}
