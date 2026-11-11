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
  find_target:
    'From a plain name or an address to candidates: what would draw each one, or why nothing can.',
  list_networks:
    "The networks Petals can read. If the question is about one it can't read, say so and use cannot_read_hint.",
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
const NOT_FOR_THE_AGENT = new Set([
  'publish_flower',
  'submit_correction',
  // Models offer it when they're stuck, and it helps nobody. It stays on the doors.
  'quote_payment',
  // Every door has these. Petal's own agent waits: they add 4.6 KB to each model call, so giving
  // them to it is a reviewed step, with prompt text, once it has a reason to use them.
  'account_groups',
  'shared_accounts',
  'related_groups',
  'relations_overview',
  'power_path',
  // Every door has these too. Petal's own agent doesn't need them: its run saves steps by itself
  // (jobs.ts), so they would only add 2.7 KB, about 685 tokens, to each model call.
  'list_explorations',
  'get_exploration',
  'start_exploration',
  'save_step',
  'add_note',
  // The person's agent's side of a job (9 Nov, C). Petals' agent hands jobs out with its own hand_job and
  // reads where they stand in its system message (hand-job.ts), so these would only add bytes.
  'take_job',
  'report_job',
  'list_jobs',
  // The brain's doors (005) are for the person's own agent, which reads chapters to know what to do.
  // Petals' agent has its prompt; giving it these is a reviewed step, as with the exploration tools.
  'brain_route',
  'brain_file',
  'brain_index',
  // layers kept on the site (005): the person's agent keeps them; Petals' agent doesn't yet
  'keep_layer',
  'list_layers',
  'fork_dataset',
  // annotations (annotation-layer.md step 2): the person's agent adds them; Petals' agent gets its own way
  // in step 3, with prompt words, saving what the person says in the same turn
  'add_annotation',
  'list_annotations',
]);

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

/**
 * OpenAI-style function parameters: an object schema, without $schema/$id that some reject and
 * without the top-level description, which the function's own description already says (every
 * turn pays for every byte of these).
 */
function parameters(schema: Record<string, unknown> | undefined): Record<string, unknown> {
  const { $schema: _s, $id: _i, description: _d, ...rest } = schema ?? {};
  return rest.type ? rest : { type: 'object', properties: {}, ...rest };
}

/**
 * In this door a spec is named, not copied: the loop fills it in from its spec_sha256 (run.ts).
 * Copying long JSON costs tokens and is where small models slip. The HTTP, MCP and CLI doors still
 * take the spec itself.
 */
const SPEC_BY_HASH = {
  type: 'string',
  pattern: '^[0-9a-f]{64}$',
  description: 'the spec_sha256 propose_spec returned; the loop fills in the spec itself',
};
const NAMES_ITS_SPEC = new Set(['validate_spec', 'render_flower']);

function agentParameters(t: AnyTool): Record<string, unknown> {
  const p = parameters(t.input);
  if (t.name === 'propose_spec') {
    // named here too: variation_of is enough, and the loop fills in the parent
    const { parent: _copied, ...own } = (p.properties ?? {}) as Record<string, unknown>;
    return { ...p, properties: own };
  }
  if (!NAMES_ITS_SPEC.has(t.name)) return p;
  const {
    include_svg: _svg,
    include_reading: _reading,
    size: _size,
    // The viewer's to choose (specs/006-the-map), never the agent's: it proposes through its spec.
    view: _view,
    ...own
  } = (p.properties ?? {}) as Record<string, unknown>;
  return { ...p, properties: { ...own, spec: SPEC_BY_HASH } };
}

export function llmTools(registry: readonly AnyTool[]): LlmToolDef[] {
  return registry.filter(forAgent).map((t) => ({
    name: t.name,
    description: describe(t),
    parameters: agentParameters(t),
  }));
}

export const STAGE_OF: Record<string, Stage> = {
  look_up: 'reading_map',
  find_target: 'fetching',
  read_chain: 'fetching',
  read_page: 'fetching',
  search: 'fetching',
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
  recorded:
    'Recorded run: no AI model is running here. This replays one saved run; your question was not read.',
  thinking: 'Thinking',
  reading_map: 'Reading the shared map',
  fetching: 'Finding the snapshot',
  counting: 'Counting',
  proposing: 'Proposing a spec',
  validating: 'Checking the spec',
  drawing: 'Drawing the flower',
};
