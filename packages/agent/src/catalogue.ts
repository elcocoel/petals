// What each provider offers (T312; design/workspace-data.md, design/connectors.md 1A and 1B). A table in
// code, and the allow-list too: a person's pick spends the sponsor's money, so a chat can only name what
// is here. Effort, the cap, the window and fallback are facts about a model, not about the server. For v1
// only NEAR AI's models run inside Petals, and other agents keep their door, so `near-ai` is the one
// provider. The shape holds more: adding one is a row, with no change for a reader.
//
// This file imports nothing, so anything can read a model's facts from it with a plain import: the thread
// its window, the client its effort. Don't give it dependencies.
//
// Prices and windows are from research/connectors/near-agents-now.md, as read on 2026-11-06. A flower's
// price is its estimate there, and only DeepSeek's is measured. `usd_per_chat` is Petals' own number: the
// $0.05 is http-api.md's, and Sonnet's $0.30 is ours, about twice its estimated flower, and has never run.
// Only `low` has ever run; medium and high are listed and untried.

/**
 * What a model promises about each answer:
 * `signed`, its enclave signs it; `enclave`, it runs in one but doesn't sign each answer; `passed_through`,
 * the prompt goes to another company, named in `runs_at`, and nothing is proved.
 */
export type ModelPromise = 'signed' | 'enclave' | 'passed_through';

export interface CatalogueModel {
  id: string;
  name: string;
  promise: ModelPromise;
  runs_at: string;
  /** tokens: how much the model can hold */
  context_window: number;
  /**
   * tokens: where a conversation starts compacting. Older tool detail is dropped there, and the words
   * stay. The wheel reads `context_tokens` over `context_window`, and this says where it starts to act.
   */
  compacts_at_tokens: number;
  usd_per_million: { in: number; out: number; cached: number };
  /** what `reasoning_effort` may be. Empty: the model's route refuses the field, so it isn't sent */
  efforts: string[];
  default_effort: string | null;
  /** where a chat on this model stops */
  usd_per_chat: number;
  /** about what a flower costs; an estimate unless the research says measured */
  usd_per_flower: number;
  /** tried in this order when it fails. Only the same promise: a signed pick never becomes unsigned */
  fallbacks: string[];
}

export interface CatalogueProvider {
  id: string;
  /** `recorded`: this server has no model key, so chats replay a recorded run and nothing here applies */
  status: 'ready' | 'recorded';
  /** where the credential lives */
  credential: 'server' | 'tab' | 'helper' | 'none';
  /** where the agent runs */
  runs: 'server' | 'tab' | 'helper' | 'elsewhere';
  /** `ask` waits for a yes before a new read or draw; `auto` draws without asking. `ask` is the default */
  permissions: string[];
  models: CatalogueModel[];
}

/** What a conversation has picked. `model` here is the pick: what answered is on each turn. */
export interface Settings {
  provider: string;
  model: string;
  effort: string | null;
  permissions: string;
}

/** How full a model's window gets before older tool detail goes. */
export const COMPACT_AT_FRACTION = 0.8;
const compactsAt = (window: number) => Math.floor(window * COMPACT_AT_FRACTION);

const ALL_EFFORTS = ['low', 'medium', 'high'];
const DEEPSEEK = 'deepseek-ai/DeepSeek-V4.1-Flash-1017';
const GLM = 'z-ai/glm-5.3-flash';
const QWEN = 'Qwen/Qwen3.8-27B';
const NEAR_ENCLAVE = "NEAR AI's enclave";

const NEAR_AI_MODELS: readonly CatalogueModel[] = [
  {
    id: DEEPSEEK,
    name: 'DeepSeek V4.1 Flash',
    promise: 'signed',
    runs_at: NEAR_ENCLAVE,
    context_window: 1_000_000,
    compacts_at_tokens: compactsAt(1_000_000),
    usd_per_million: { in: 0.3, out: 1.2, cached: 0.006 },
    efforts: ALL_EFFORTS,
    default_effort: 'low',
    usd_per_chat: 0.05,
    usd_per_flower: 0.0205,
    fallbacks: [GLM, QWEN],
  },
  {
    id: GLM,
    name: 'GLM 5.3 Flash',
    promise: 'signed',
    runs_at: NEAR_ENCLAVE,
    context_window: 1_000_000,
    compacts_at_tokens: compactsAt(1_000_000),
    usd_per_million: { in: 0.08, out: 0.5, cached: 0.012 },
    efforts: ALL_EFFORTS,
    default_effort: 'low',
    usd_per_chat: 0.05,
    usd_per_flower: 0.0059,
    fallbacks: [QWEN, DEEPSEEK],
  },
  {
    id: QWEN,
    name: 'Qwen 3.8',
    promise: 'signed',
    runs_at: NEAR_ENCLAVE,
    context_window: 262_000,
    compacts_at_tokens: compactsAt(262_000),
    usd_per_million: { in: 0.04, out: 1.35, cached: 0.018 },
    efforts: ALL_EFFORTS,
    default_effort: 'low',
    usd_per_chat: 0.05,
    usd_per_flower: 0.0052,
    fallbacks: [GLM, DEEPSEEK],
  },
  {
    id: 'anthropic/claude-haiku-5-5',
    name: 'Claude Haiku 5.5',
    promise: 'passed_through',
    runs_at: 'Anthropic',
    context_window: 1_000_000,
    compacts_at_tokens: compactsAt(1_000_000),
    usd_per_million: { in: 0.1, out: 0.5, cached: 0.01 },
    efforts: [],
    default_effort: null,
    usd_per_chat: 0.05,
    usd_per_flower: 0.007,
    fallbacks: [],
  },
  {
    id: 'anthropic/claude-sonnet-5-5',
    name: 'Claude Sonnet 5.5',
    promise: 'passed_through',
    runs_at: 'Anthropic',
    context_window: 1_000_000,
    compacts_at_tokens: compactsAt(1_000_000),
    usd_per_million: { in: 2, out: 10, cached: 0.1 },
    efforts: [],
    default_effort: null,
    usd_per_chat: 0.3,
    usd_per_flower: 0.141,
    fallbacks: [],
  },
];

const NEAR_AI = 'near-ai';
const PERMISSIONS = ['ask', 'auto'];

function providers(status: CatalogueProvider['status']): CatalogueProvider[] {
  return [
    {
      id: NEAR_AI,
      status,
      credential: 'server',
      runs: 'server',
      permissions: [...PERMISSIONS],
      models: NEAR_AI_MODELS.map((m) => ({ ...m })),
    },
  ];
}

export function modelOf(id: string): CatalogueModel | null {
  return NEAR_AI_MODELS.find((m) => m.id === id) ?? null;
}

const asDefault = (m: CatalogueModel): Settings => ({
  provider: NEAR_AI,
  model: m.id,
  effort: m.default_effort,
  permissions: 'ask',
});

/** PETAL_MODEL, when it's a model a person could pick; else the first in the table. */
export function defaultSettings(env: Record<string, string | undefined> = process.env): Settings {
  return asDefault(modelOf(env.PETAL_MODEL?.trim() ?? '') ?? (NEAR_AI_MODELS[0] as CatalogueModel));
}

/** The answer of GET /api/v1/catalogue. */
export function catalogue(
  llmKind: 'near-ai-cloud' | 'recorded',
  env: Record<string, string | undefined> = process.env,
) {
  return {
    default: defaultSettings(env),
    providers: providers(llmKind === 'recorded' ? 'recorded' : 'ready'),
  };
}

/** Settings as stored, or the default when there are none or they no longer name a listed model. */
export function settingsOf(stored: string | null | undefined): Settings {
  if (stored) {
    try {
      const s = JSON.parse(stored) as Settings;
      if (modelOf(s.model)) return s;
    } catch {
      // a row that can't be read falls back with the rest
    }
  }
  return defaultSettings();
}

/**
 * A person's change, over what the conversation has now. Only what's named changes, except that a new
 * model with no effort named takes that model's own default: efforts are per model. Returns the whole
 * settings, or what's wrong. Checked before any model is called, so a bad pick spends nothing.
 */
export function resolveSettings(wanted: unknown, current: Settings): Settings | string {
  if (!wanted || typeof wanted !== 'object' || Array.isArray(wanted)) {
    return 'settings must be an object';
  }
  const w = wanted as Record<string, unknown>;
  if (w.provider !== undefined && w.provider !== NEAR_AI) {
    return `${String(w.provider)} isn't a provider here: only ${NEAR_AI} runs inside Petals`;
  }
  const id = w.model ?? current.model;
  const model = typeof id === 'string' ? modelOf(id) : null;
  if (!model) return `${String(id)} isn't in the catalogue`;
  const changedModel = model.id !== current.model;
  const effort =
    w.effort !== undefined ? w.effort : changedModel ? model.default_effort : current.effort;
  if (effort !== null && !model.efforts.includes(effort as string)) {
    return `${model.name} doesn't offer effort ${String(effort)}`;
  }
  if (effort === null && model.efforts.length) {
    return `${model.name} needs an effort: ${model.efforts.join(', ')}`;
  }
  const permissions = w.permissions ?? current.permissions;
  if (typeof permissions !== 'string' || !PERMISSIONS.includes(permissions)) {
    return `permissions must be one of ${PERMISSIONS.join(', ')}`;
  }
  return { provider: NEAR_AI, model: model.id, effort: effort as string | null, permissions };
}
