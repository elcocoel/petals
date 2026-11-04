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

/** What the model reads back: render_flower without the SVG and the per-petal details. */
export function forModel(name: string, out: unknown): unknown {
  if (name !== 'render_flower' || isToolError(out)) return out;
  const { svg: _svg, petals, ...rest } = obj(out);
  return Array.isArray(petals) ? { ...rest, petals_drawn: petals.length } : rest;
}
