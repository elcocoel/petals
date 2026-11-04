// Subcommands are generated from the tool registry: one per tool. This file only names them.
// A tool missing from SHORT gets its own name with dashes (find_documents -> find-documents),
// and the tool's own name always works too (`petal compute_figures ...`).
import type { JSONSchema } from '@petal/tools';

/** Short names for the tools in contracts/tools.md. */
const SHORT: Record<string, string> = {
  list_networks: 'networks',
  get_network: 'network',
  get_snapshot: 'snapshot',
  describe_snapshot: 'describe',
  compute_figures: 'figures',
  compare_figures: 'compare',
  propose_spec: 'propose',
  validate_spec: 'validate',
  render_flower: 'render',
  list_flowers: 'flowers',
  get_flower: 'flower',
  prepare_publish: 'prepare-publish',
  publish_flower: 'publish',
  quote_payment: 'quote',
  find_documents: 'documents',
  get_labels: 'labels',
  prepare_correction: 'prepare-correction',
  submit_correction: 'correct',
};

/** Which input fields bare words fill, in order. Unlisted tools use the schema's `required`. */
const POSITIONAL: Record<string, string[]> = {
  list_networks: ['query'],
  get_network: ['id'],
  get_snapshot: ['network'],
  describe_snapshot: ['sha256'],
  compute_figures: ['sha256'],
  compare_figures: ['a', 'b'],
  propose_spec: ['network'],
  validate_spec: ['spec'],
  render_flower: ['spec'],
  list_flowers: ['network'],
  get_flower: ['id'],
  prepare_publish: ['entry'],
  publish_flower: ['entry_sha256'],
  quote_payment: ['purpose'],
  find_documents: ['network'],
  prepare_correction: ['flower_id'],
  submit_correction: ['correction_sha256'],
};

/** Commands the CLI adds beside the tools: they start a door, they are not tools. */
export const BUILTINS = ['mcp', 'api', 'help'] as const;

export function commandName(tool: string): string {
  return SHORT[tool] ?? tool.replaceAll('_', '-');
}

export function positionalFields(tool: string, input: JSONSchema): string[] {
  const listed = POSITIONAL[tool];
  if (listed) return listed;
  const required = input.required;
  return Array.isArray(required) ? required.filter((r): r is string => typeof r === 'string') : [];
}
