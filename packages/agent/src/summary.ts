// One line per tool result for the `tool_result` event (http-api.md: summaries, never raw bodies),
// and the trimmed result the model reads back. Defensive: tool outputs are W4's, so every field
// is optional here and a summary never throws.
import type { ToolError } from '@petal/core/types';

type Obj = Record<string, unknown>;

export function isToolError(x: unknown): x is ToolError {
  const e = (x as { error?: unknown } | null)?.error;
  return !!e && typeof e === 'object' && typeof (e as { code?: unknown }).code === 'string';
}

const short = (h: unknown) => (typeof h === 'string' ? `${h.slice(0, 12)}…` : '?');
const pct = (x: unknown) =>
  typeof x === 'number' ? `${(Math.round(x * 1000) / 10).toString()}%` : '?';
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const obj = (x: unknown): Obj => (x && typeof x === 'object' ? (x as Obj) : {});

function line(name: string, out: Obj): string {
  switch (name) {
    case 'find_target': {
      const said = arr(out.sources)
        .filter((s) => obj(s).status === 'answered')
        .map((s) => obj(s).id);
      return `${arr(out.candidates).length} candidates${out.ambiguous ? ', several things share this name' : ''}; ${out.calls ?? '?'} calls; answered: ${said.join(', ') || 'none'}`;
    }
    case 'list_networks': {
      const ids = arr(out.networks).map((n) => obj(n).id);
      return `${ids.length} networks: ${ids.join(', ')}`;
    }
    case 'get_network':
      return `${obj(out.network).id ?? 'network'}: ${arr(out.mapped).length} snapshots mapped`;
    case 'get_snapshot': {
      const s = obj(out.snapshot);
      return `${out.reused ? 'reused' : 'read fresh'} from ${out.where ?? '?'}: block ${s.block_height ?? '?'}, ${s.as_of ?? '?'} (${short(out.sha256)})`;
    }
    case 'describe_snapshot': {
      const top = arr(out.top)
        .slice(0, 3)
        .map((p) => obj(p).label ?? obj(p).id);
      return `${arr(out.measures).length} measures; largest: ${top.join(', ') || 'none'}`;
    }
    case 'compute_figures': {
      const n = obj(out.nakamoto);
      const top = obj(out.top_k_share);
      return `Nakamoto ${n.count ?? '?'} at ${n.threshold ?? '?'}; ${out.participants_included ?? '?'} included; top 10 hold ${pct(top['10'])}`;
    }
    case 'compare_figures': {
      const n = obj(out.nakamoto);
      return `Nakamoto ${n.a ?? '?'} → ${n.b ?? '?'}; ${arr(out.moved).length} moved`;
    }
    case 'propose_spec': {
      const changed = arr(out.changed_from_default);
      return `spec ${short(out.spec_sha256)}; changed from default: ${changed.join(', ') || 'none'}`;
    }
    case 'validate_spec': {
      const errors = arr(out.errors);
      const warnings = arr(out.warnings);
      if (out.valid) return `valid${warnings.length ? `, ${warnings.length} warnings` : ''}`;
      const first = obj(errors[0]);
      return `invalid: ${errors.length} errors${first.message ? `; first: ${first.message}` : ''}`;
    }
    case 'render_flower':
      return `drawn: render ${short(out.render_sha256)}, ${arr(out.legend).length} legend lines`;
    case 'list_flowers':
      return `${arr(out.flowers).length} flowers`;
    case 'get_flower':
      return `flower ${obj(out.entry).id ?? '?'} (${out.where ?? '?'})`;
    case 'prepare_publish':
      return `ready to sign: ${out.sign_url ?? '?'}`;
    case 'quote_payment':
      return `dry quote: ${out.amount_in_usd ?? '?'} USD in`;
    default:
      return 'ok';
  }
}

export function summarize(name: string, out: unknown): string {
  if (isToolError(out)) return `${out.error.code}: ${out.error.message}`;
  try {
    return line(name, obj(out));
  } catch {
    return 'ok';
  }
}

// ---------------------------------------------------------------------------------------------
// What the model reads back. Every byte here is sent again on every later turn, so each tool's
// result is cut to what the next step needs. The doors keep the full outputs (tools.md); the
// tool_call and flower events are not affected. Never a snapshot body, either way.

/** compute_figures: enough shares for the answer; describe_snapshot lists more on request. */
export const SHARES_FOR_MODEL = 10;
/** describe_snapshot: long coverage notes end in raw import details. */
export const COVERAGE_NOTE_FOR_MODEL = 2000;

/**
 * render_flower's view_url holds the whole spec in base64 (about 2 KB). The model gets this short
 * link and writes that into its answer; the loop puts the real one into the message (run.ts), so
 * no model has to copy 2 KB of base64 without a slip.
 */
export function draftLink(specSha256: string): string {
  return `/draft?flower=${specSha256.slice(0, 8)}`;
}

function cutAtSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const end = text.lastIndexOf('. ', max);
  return `${text.slice(0, end > 0 ? end + 1 : max)} (shortened)`;
}

function networkForModel(n: unknown): Obj {
  const { id, title, description, live, params, cost, capabilities } = obj(n);
  const caps = obj(capabilities);
  return {
    id,
    title,
    description,
    live,
    params,
    cost,
    measures: arr(caps.measures).map((m) => obj(m).id),
    segments: caps.segments,
  };
}

export function forModel(name: string, out: unknown): unknown {
  if (isToolError(out)) return out;
  const o = obj(out);
  switch (name) {
    case 'list_networks':
      return { ...o, networks: arr(o.networks).map(networkForModel) };
    case 'get_network':
      return { ...o, network: networkForModel(o.network) };
    case 'get_snapshot': {
      // coverage comes back from describe_snapshot as coverage_note; the body is never read
      const { coverage: _coverage, body_url: _body, ...rest } = o;
      return { ...rest, sources: arr(o.sources).map((s) => obj(s).id) };
    }
    case 'describe_snapshot':
      return typeof o.coverage_note === 'string'
        ? { ...o, coverage_note: cutAtSentence(o.coverage_note, COVERAGE_NOTE_FOR_MODEL) }
        : o;
    case 'compute_figures': {
      const shares = arr(o.shares);
      if (shares.length <= SHARES_FOR_MODEL) return o;
      return {
        ...o,
        shares: shares.slice(0, SHARES_FOR_MODEL),
        shares_note: `the largest ${SHARES_FOR_MODEL} of ${shares.length} shares; describe_snapshot with top up to 50 lists more`,
      };
    }
    case 'render_flower': {
      // short_url is for the other doors. Here the loop puts the real link in (run.ts). A reading is
      // for a page drawing the flower, and it would add real size to every result the model reads.
      const { svg: _svg, petals: _petals, short_url: _short, reading: _reading, ...rest } = o;
      const link = typeof o.spec_sha256 === 'string' ? draftLink(o.spec_sha256) : o.view_url;
      return { ...rest, view_url: link };
    }
    default:
      return out;
  }
}
