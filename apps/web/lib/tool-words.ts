// What Petals' agent is doing, in plain words, from a tool call as it starts: the person sees each step of a
// turn as it happens ("Searching the map for “the largest treasury”"), not a tool's name. Every tool has its
// words (test/tool-words.test.ts holds the registry to it). Pure.
import { shortId } from './flower-view.ts';

const said = (args: unknown, key: string): string | null => {
  if (!args || typeof args !== 'object') return null;
  const v = (args as Record<string, unknown>)[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};

const quoted = (s: string) => `“${s.length > 60 ? `${s.slice(0, 59)}…` : s}”`;

/** what rank_maps ranks by, in words */
const RANKED: Record<string, string> = {
  treasury: 'treasury',
  market_cap: 'market value',
  holders: 'number of holders',
  proposals: 'number of proposals',
};

/** The steps whose words don't depend on what they're given. */
const WORDS: Record<string, string> = {
  show: 'Moving the map',
  brain_context: 'Reading Petals’ notes on how to answer',
  brain_route: 'Reading Petals’ notes on how to answer',
  brain_file: 'Reading Petals’ notes on how to answer',
  brain_index: 'Reading Petals’ notes on how to answer',
  brain_usage: 'Reading Petals’ notes on how to answer',
  list_networks: 'Reading which networks Petals knows',
  get_network: 'Reading the network',
  get_snapshot: 'Reading who holds what',
  describe_snapshot: 'Reading who holds what',
  compute_figures: 'Counting how concentrated it is',
  add_layer: 'Adding a layer to the view',
  compose_view: 'Putting the layers together',
  propose_spec: 'Preparing the drawing',
  validate_spec: 'Preparing the drawing',
  render_flower: 'Drawing the flower',
  list_flowers: 'Looking through the flowers',
  get_flower: 'Opening a flower',
  prepare_publish: 'Preparing what you’d publish',
  publish_flower: 'Publishing the flower',
  list_publishable: 'Reading what you could publish',
  quote_payment: 'Getting a price',
  find_voting_blocs: 'Finding who votes together',
  list_payouts: 'Reading the payouts',
  list_calls: 'Reading the open calls for funding',
  power_path: 'Tracing the path of power',
  shared_accounts: 'Reading how the maps connect',
  related_groups: 'Reading how the maps connect',
  relations_overview: 'Reading how the maps connect',
  account_groups: 'Reading how the maps connect',
  read_chain: 'Reading the chain',
  read_page: 'Reading a web page',
  keep_data: 'Keeping the data',
  list_data: 'Reading what you’ve kept',
  keep_layer: 'Keeping the layer',
  list_layers: 'Reading the map’s layers',
  fork_dataset: 'Making your own copy of the data',
  list_explorations: 'Reading your explorations',
  get_exploration: 'Opening an exploration',
  start_exploration: 'Starting an exploration',
  save_step: 'Saving this step',
  add_note: 'Writing a note',
  add_annotation: 'Writing a note on a petal',
  annotate: 'Writing a note on a petal',
  list_annotations: 'Reading the notes on it',
  take_job: 'Taking a job',
  report_job: 'Reporting on a job',
  list_jobs: 'Reading the jobs',
  hand_job: 'Handing the work to your agent',
};

/** The steps that say what they're doing with what they're given. */
const ASKED = new Set([
  'search_petals',
  'search',
  'look_up',
  'find_target',
  'get_map',
  'rank_maps',
]);

/** Whether a tool has its own words (else its name stands in, which should never happen). */
export const hasWords = (name: string) => name in WORDS || ASKED.has(name);

/** A step of the agent's turn, in words: what it's doing with this tool and these arguments. */
export function toolDoing(name: string, args: unknown): string {
  switch (name) {
    case 'search_petals':
    case 'search': {
      const q = said(args, 'q') ?? said(args, 'query');
      return q ? `Searching the map for ${quoted(q)}` : 'Searching the map';
    }
    case 'look_up': {
      const q = said(args, 'query');
      return q ? `Looking up ${quoted(q)}` : 'Looking it up';
    }
    case 'find_target': {
      const q = said(args, 'query');
      return q ? `Finding ${quoted(q)}` : 'Finding what you mean';
    }
    case 'get_map': {
      const map = said(args, 'map');
      return map ? `Opening the map ${shortId(map)}` : 'Opening a map';
    }
    case 'rank_maps': {
      const by = said(args, 'by');
      return `Ranking the maps by ${(by && RANKED[by]) ?? by?.replaceAll('_', ' ') ?? 'what you asked'}`;
    }
    default: {
      const words = WORDS[name];
      if (words) return words;
      const plain = name.replaceAll('_', ' ');
      return plain.charAt(0).toUpperCase() + plain.slice(1);
    }
  }
}
