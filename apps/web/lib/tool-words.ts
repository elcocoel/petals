// What Petals' agent is doing, in plain words, from a tool call as it starts: the person sees each step of a
// turn as it happens ("Searching the map for “the largest treasury”"), not a tool's name. Pure.
import { shortId } from './flower-view.ts';

const said = (args: unknown, key: string): string | null => {
  if (!args || typeof args !== 'object') return null;
  const v = (args as Record<string, unknown>)[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};

const quoted = (s: string) => `“${s.length > 60 ? `${s.slice(0, 59)}…` : s}”`;

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
    case 'show':
      return 'Moving the map';
    case 'brain_context':
    case 'brain_route':
    case 'brain_file':
    case 'brain_index':
      return 'Reading Petals’ notes on how to answer';
    case 'get_snapshot':
    case 'describe_snapshot':
      return 'Reading who holds what';
    case 'compute_figures':
      return 'Counting how concentrated it is';
    case 'find_voting_blocs':
      return 'Finding who votes together';
    case 'list_payouts':
      return 'Reading the payouts';
    case 'power_path':
      return 'Tracing the path of power';
    case 'shared_accounts':
    case 'related_groups':
    case 'relations_overview':
    case 'account_groups':
      return 'Reading how the maps connect';
    case 'read_chain':
      return 'Reading the chain';
    case 'read_page':
      return 'Reading a web page';
    case 'propose_spec':
    case 'validate_spec':
      return 'Preparing the drawing';
    case 'render_flower':
      return 'Drawing the flower';
    default: {
      const words = name.replaceAll('_', ' ');
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
  }
}
