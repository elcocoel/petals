// How the agent sees the tool registry (T057). The registry (@petal/tools, W4) is the one source of
// names and input schemas; this file only adds a short description per tool when the registry has
// none, leaves out the tools that need a person's NEP-413 proof, and maps tools to stages.
import type { Stage } from '@petal/core/types';
import type { Tool } from '@petal/tools';
import type { LlmToolDef } from './llm.ts';

// biome-ignore lint/suspicious/noExplicitAny: the registry is heterogeneous (packages.md)
export type AnyTool = Tool<any, any>;

/** One line per tool, from contracts/tools.md, for registries that carry no description. */
const DESCRIPTIONS: Record<string, string> = {
  list_networks:
    "The networks Petal can read. If the question is about one it can't read, say so and use cannot_read_hint.",
  get_network: 'One network: its descriptor and the snapshots already mapped.',
  get_snapshot:
    'Resolve a network and date to a snapshot; reused when already stored. Returns sha256, reused, as_of, block_height, sources and counts, never the body.',
  describe_snapshot:
    'What a snapshot holds: measures, kinds, segment options, primitives with their status, top participants, sources. Use it to choose the mapping.',
  compute_figures:
    'The numbers: total, shares, top-k shares, Nakamoto coefficient, HHI, Gini, tail and figure ids. Quote only these.',
  propose_spec:
    'Build the full canonical spec from a few choices; defaults and standard meanings fill the rest.',
  validate_spec:
    'Check a spec, with your interpretation. Fix the errors it names and call it again.',
  render_flower: 'Draw a validated spec. Returns view_url, the legend and render_sha256.',
  list_flowers:
    'Flowers already on the shared map, and the hero fixtures. Check here before drawing a new one.',
  get_flower: 'One published flower: its entry, where it is, and what was verified.',
  prepare_publish:
    'Prepare a flower for publishing. Returns sign_url: the person signs with their own NEAR wallet; never ask for a key.',
  quote_payment: 'A dry NEAR Intents quote to sponsor a refresh or new coverage. No money moves.',
  compare_figures: 'What changed between two snapshots of one network. Quote only these numbers.',
  find_documents: 'Public documents and forum pages to cite.',
  get_labels: 'Labels for addresses, from the label layer.',
  prepare_correction:
    'Prepare a request to correct or remove a label. Returns a link for the person to sign or file.',
};

/** Tools that need the person's own NEP-413 signature: the agent hands over a link instead. */
const NOT_FOR_THE_AGENT = new Set(['publish_flower', 'submit_correction']);

export function forAgent(t: AnyTool): boolean {
  return !NOT_FOR_THE_AGENT.has(t.name);
}

function describe(t: AnyTool): string {
  const own = (t as { description?: unknown }).description;
  if (typeof own === 'string' && own) return own;
  const fromSchema = t.input?.description;
  if (typeof fromSchema === 'string' && fromSchema) return fromSchema;
  return DESCRIPTIONS[t.name] ?? t.name.replaceAll('_', ' ');
}

/** OpenAI-style function parameters: an object schema, without $schema/$id that some reject. */
function parameters(schema: Record<string, unknown> | undefined): Record<string, unknown> {
  const { $schema: _s, $id: _i, ...rest } = schema ?? {};
  return rest.type ? rest : { type: 'object', properties: {}, ...rest };
}

export function llmTools(registry: readonly AnyTool[]): LlmToolDef[] {
  return registry.filter(forAgent).map((t) => ({
    name: t.name,
    description: describe(t),
    parameters: parameters(t.input),
  }));
}

export const STAGE_OF: Record<string, Stage> = {
  list_flowers: 'reading_map',
  get_flower: 'reading_map',
  list_networks: 'fetching',
  get_network: 'fetching',
  get_snapshot: 'fetching',
  describe_snapshot: 'counting',
  compute_figures: 'counting',
  compare_figures: 'counting',
  propose_spec: 'proposing',
  validate_spec: 'validating',
  render_flower: 'drawing',
};

export const STAGE_MESSAGE: Record<Stage, string> = {
  thinking: 'Thinking',
  reading_map: 'Reading the shared map',
  fetching: 'Finding the snapshot',
  counting: 'Counting',
  proposing: 'Proposing a spec',
  validating: 'Checking the spec',
  drawing: 'Drawing the flower',
};
