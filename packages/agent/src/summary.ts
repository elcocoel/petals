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
    case 'look_up': {
      const kinds = arr(out.chain).map((c) => `${obj(c).chain} ${obj(c).kind}`);
      const down = arr(out.searched)
        .filter((x) => obj(x).status === 'down')
        .map((x) => obj(x).id);
      return [
        `${arr(out.flowers).length} flowers`,
        `${arr(out.stored).length} stored reads`,
        `${arr(out.accounts).length} account rows`,
        ...(kinds.length ? [`chain: ${kinds.join(', ')}`] : []),
        `${arr(out.listed).length} listed${out.ambiguous ? ', several things share this name' : ''}`,
        ...(down.length ? [`down: ${down.join(', ')}`] : []),
      ].join('; ');
    }
    case 'read_chain': {
      const said = arr(out.read).map((r) => {
        const x = obj(r);
        if (x.status !== 'answered') return `${x.chain} ${x.status}`;
        const verified = obj(x.verified_source).name;
        const calls = arr(x.calls).filter((c) => obj(c).ok).length;
        return `${x.chain} ${x.kind}${verified ? ` ${verified}` : ''}${x.kind === 'contract' ? `, ${calls} calls answered` : ''}`;
      });
      return said.join('; ') || 'nothing read';
    }
    case 'read_page':
      return `${out.status}: ${out.final_url ?? out.url ?? '?'}, ${String(out.text ?? '').length} characters, ${arr(out.addresses).length} addresses`;
    case 'search':
      return out.status === 'answered'
        ? `${arr(out.results).length} results; first: ${obj(arr(out.results)[0]).url ?? 'none'}`
        : `search ${out.status}`;
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
      const read = obj(out.not_read);
      const of =
        typeof read.share_of_whole === 'number'
          ? `; of what was read, ${pct(1 - read.share_of_whole)} of the whole`
          : '';
      return `Nakamoto ${n.count ?? '?'} at ${n.threshold ?? '?'}; ${out.participants_included ?? '?'} included; top 10 hold ${pct(top['10'])}${of}`;
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
      return `${arr(out.flowers).length} flowers${out.hint ? `; ${out.hint}` : ''}`;
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
// What the model reads back. Nothing it could use is cut for size alone: with 10 shares, Sonnet
// couldn't say "the 20 equal holders add up to 53%", and could with all of them. What goes is what
// no model can use (bodies, SVG, base64) and what another result already says. The doors keep the
// full outputs (tools.md); the tool_call and flower events are not affected.

/** compute_figures: as many shares as a flower can have petals (specs: petals 5 to 300). */
export const SHARES_FOR_MODEL = 300;

/**
 * render_flower's view_url holds the whole spec in base64 (about 2 KB). The model gets this short
 * link and writes that into its answer; the loop puts the real one into the message (run.ts), so
 * no model has to copy 2 KB of base64 without a slip.
 */
export function draftLink(specSha256: string): string {
  return `/draft?flower=${specSha256.slice(0, 8)}`;
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

/** The tools offer every door a dry quote as a way forward. In this one it never is (prompt.md). */
const QUOTE_OFFER = /[;.]?\s*(?:To ask for new coverage, )?quote_payment with purpose [^.]*\./g;
const noQuote = (text: unknown) =>
  typeof text === 'string' ? text.replace(QUOTE_OFFER, '.') : text;

/** `next` tells every door to ask first. In this one the prompt and the gate decide (approval.ts). */
const ASKS_FIRST = /^(?:One clear match|Different things carry this name)/;

export function forModel(name: string, out: unknown): unknown {
  if (isToolError(out)) {
    const hint = noQuote(out.error.hint);
    return hint === out.error.hint ? out : { ...out, error: { ...out.error, hint } };
  }
  const o = obj(out);
  switch (name) {
    case 'find_target': {
      if (typeof o.next !== 'string' || !ASKS_FIRST.test(o.next)) return out;
      const { next: _next, ...rest } = o;
      return rest;
    }
    case 'list_networks':
      return {
        ...o,
        networks: arr(o.networks).map(networkForModel),
        cannot_read_hint: noQuote(o.cannot_read_hint),
      };
    case 'get_network':
      return { ...o, network: networkForModel(o.network) };
    case 'get_snapshot': {
      // coverage comes back from describe_snapshot as coverage_note; the body is never read
      const { coverage: _coverage, body_url: _body, ...rest } = o;
      return { ...rest, sources: arr(o.sources).map((s) => obj(s).id) };
    }
    case 'compute_figures': {
      const shares = arr(o.shares);
      if (shares.length <= SHARES_FOR_MODEL) return o;
      return {
        ...o,
        shares: shares.slice(0, SHARES_FOR_MODEL),
        shares_note: `the largest ${SHARES_FOR_MODEL} of ${shares.length} shares`,
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
