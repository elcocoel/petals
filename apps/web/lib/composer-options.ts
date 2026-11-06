// The composer's model picker: what's picked, what really answered, and what can be picked instead. Every
// option comes from the catalogue (GET /api/v1/catalogue). Pure, so the views only lay it out.

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

const dollars = (usd: number) => `$${usd < 0.01 ? usd.toFixed(3) : usd.toFixed(2)}`;

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
  /** what it promises, where it runs, what a flower costs */
  sub: string;
  on: boolean;
}

export function modelOptions(c: Catalogue, s: Settings): ModelOption[] {
  const provider = c.providers.find((p) => p.id === s.provider);
  return (provider?.models ?? []).map((m) => ({
    id: m.id,
    label: m.name,
    sub: `${PROMISE[m.promise]}  ·  ${m.runs_at}  ·  ${dollars(m.usd_per_flower)} a flower`,
    on: m.id === s.model,
  }));
}

/** A new model brings its own effort: its default, or none if it offers none. */
export function withModel(c: Catalogue, s: Settings, id: string): Settings {
  return { ...s, model: id, effort: modelOf(c, id)?.default_effort ?? null };
}
