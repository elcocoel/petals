// compose/v1's facts (specs/005-mapping-brain/composition.md, sections 3, 4 and 8): what a layer says, one value for
// one thing about one subject at one moment of the chain. Each of Petals' formats has one fixed rule, so the same
// layer always gives the same facts, and two authors who read the same block state the same facts whatever else
// differs between their documents (when they collected it, their sources, their parameters). Absence is never a
// fact: only what a layer states counts. Pure.
import { canonicalJson, sha256Hex } from '../hash.ts';
import { grouped, isoOf } from '../instant.ts';

export const COMPOSE_RULE = 'compose/v1';

/**
 * When on the chain a value holds: a chain and its block, or else the instant; and for facts about a span, the
 * window. Collected-at (when the author read it) is never part of it.
 */
export interface State {
  chain?: string;
  block?: number;
  at?: string;
  window?: { from: string; to: string };
}

export interface Fact {
  subject: string;
  what: string;
  state: State;
  value: string;
}

/** The state as one text, for grouping: `<chain>@<block>`, or `@<instant>`, then `[from,to)` for a window. */
export function stateKey(s: State): string {
  const at =
    s.block !== undefined
      ? `${s.chain ?? ''}@${s.block}`
      : s.at !== undefined
        ? `@${iso(s.at)}`
        : '@';
  const span = s.window;
  return span ? `${at}[${span.from},${span.to})` : at;
}

/** A fact's slot: what it is about, what it says, and when. Two facts in one slot are the same question. */
export const slotOf = (f: Fact) => `${f.subject}\u0000${f.what}\u0000${stateKey(f.state)}`;

/** An instant in one form, so two spellings of one moment are one moment. */
function iso(t: string): string {
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? t : isoOf(ms);
}

/** A decimal in one form: no plus sign, no leading or trailing zeros ("100.0" and "0100" are "100"). */
export function decimal(text: string): string {
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(text.trim());
  if (!m) return text;
  const int = (m[2] ?? '').replace(/^0+(?=\d)/, '') || '0';
  const frac = (m[3] ?? '').replace(/0+$/, '');
  const body = frac ? `${int}.${frac}` : int;
  return m[1] && body !== '0' ? `-${body}` : body;
}

/** An account as CAIP-10 on its chain, an EVM address in lower case: one account, one spelling. */
export function account(chain: string, id: string): string {
  const full = /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}:/.test(id) ? id : `${chain}:${id}`;
  return full.startsWith('eip155:') ? full.toLowerCase() : full;
}

/** The chain of an address `chain:address`: everything before its last part. */
const chainOf = (about: string) => about.slice(0, about.lastIndexOf(':'));

const hashOf = (x: unknown) => sha256Hex(canonicalJson(x));

type Doc = Record<string, unknown>;
const str = (x: unknown): string | undefined => (typeof x === 'string' && x ? x : undefined);
const num = (x: unknown): string | undefined =>
  typeof x === 'number' && Number.isFinite(x)
    ? decimal(String(x))
    : typeof x === 'string'
      ? decimal(x)
      : undefined;

function snapshotFacts(d: Doc): Fact[] {
  const network = d.network as { chain: string };
  const snap = d.snapshot as {
    as_of: string;
    block_height?: number;
    window?: { from?: string; to?: string };
  };
  const chain = network.chain;
  const state: State =
    snap.block_height !== undefined ? { chain, block: snap.block_height } : { at: snap.as_of };
  const span = snap.window;
  if (span?.from && span?.to) state.window = { from: span.from, to: span.to };
  const out: Fact[] = [];
  for (const h of (d.holdings ?? []) as {
    participant: string;
    measure: string;
    unit: string;
    amount: string;
  }[])
    out.push({
      subject: account(chain, h.participant),
      what: `snapshot/${h.measure} ${h.unit}`,
      state,
      value: decimal(h.amount),
    });
  for (const r of (d.relationships ?? []) as {
    from: string;
    to: string;
    type: string;
    unit?: string;
    amount?: string;
  }[])
    out.push({
      subject: `${account(chain, r.from)}→${account(chain, r.to)}`,
      what: `snapshot/${r.type}${r.unit ? ` ${r.unit}` : ''}`,
      state,
      value: r.amount !== undefined ? decimal(r.amount) : '1',
    });
  return out;
}

function layerFacts(d: Doc): Fact[] {
  const about = d.about as string;
  const chain = chainOf(about);
  const when = d.when as { as_of: string; block_height?: number };
  const state: State =
    when.block_height !== undefined ? { chain, block: when.block_height } : { at: when.as_of };
  const measures = new Map(
    ((d.measures ?? []) as { name: string; unit: string; kind: string }[]).map((m) => [m.name, m]),
  );
  return ((d.rows ?? []) as { participant: string; measure: string; value: string }[]).map((r) => {
    const m = measures.get(r.measure);
    const numeric = m?.kind === 'amount' || m?.kind === 'count' || m?.kind === 'share';
    return {
      subject: account(chain, r.participant),
      what: `layer/${r.measure} ${m?.unit ?? ''} ${m?.kind ?? ''}`.trim(),
      state,
      value: numeric ? decimal(r.value) : r.value,
    };
  });
}

function valueFacts(d: Doc): Fact[] {
  const about = d.about as string;
  const read_at = d.read_at as string;
  const out: Fact[] = [];
  const add = (what: string, said: unknown, pick: (x: Doc) => unknown) => {
    if (!said || typeof said !== 'object') return;
    const v = num(pick(said as Doc));
    if (v === undefined) return;
    out.push({ subject: about, what, state: { at: str((said as Doc).at) ?? read_at }, value: v });
  };
  add('value/price usd', d.price, (x) => x.usd);
  add('value/circulating', d.circulating, (x) => x.amount);
  add('value/market_cap usd', d.market_cap, (x) => x.usd);
  add('value/treasury usd', d.treasury, (x) => x.usd ?? x.total_usd);
  if (d.max && typeof d.max === 'object') {
    const max = d.max as Doc;
    out.push({
      subject: about,
      what: 'value/max',
      state: { at: str(max.at) ?? read_at },
      value: max.amount === null ? 'none' : (num(max.amount) ?? 'none'),
    });
  }
  return out;
}

function proposalsFacts(d: Doc): Fact[] {
  const about = d.about as string;
  const chain = chainOf(about);
  const state: State = { at: (d.source as { at: string }).at };
  const out: Fact[] = [];
  for (const p of (d.proposals ?? []) as {
    id: string;
    ref: string;
    outcome: string;
    votes: { account: string; vote: string; weight?: string | null }[];
  }[]) {
    const subject = p.ref?.startsWith('proposal:') ? p.ref : `proposal:${about}:${p.id}`;
    out.push({ subject, what: 'proposals/outcome', state, value: p.outcome });
    for (const v of p.votes ?? [])
      out.push({
        subject: `${subject}#${account(chain, v.account)}`,
        what: 'proposals/vote',
        state,
        value: v.weight ? `${v.vote} ${decimal(v.weight)}` : v.vote,
      });
  }
  return out;
}

function markFacts(d: Doc): Fact[] {
  const about = d.about as string;
  const read_at = d.read_at as string;
  const out: Fact[] = [];
  for (const [what, said, pick] of [
    ['mark/name', d.name, (x: Doc) => x.value],
    ['mark/symbol', d.symbol, (x: Doc) => x.value],
    ['mark/logo', d.logo, (x: Doc) => x.sha256],
  ] as const) {
    if (!said || typeof said !== 'object') continue;
    const v = str(pick(said as Doc));
    if (v)
      out.push({ subject: about, what, state: { at: str((said as Doc).at) ?? read_at }, value: v });
  }
  return out;
}

function vestingFacts(d: Doc): Fact[] {
  const read_at = d.read_at as string;
  return (
    (d.allocations ?? []) as { holder: string; name: string; total: string; schedule: unknown }[]
  ).map((a) => ({
    subject: `${a.holder}#${a.name}`,
    what: 'vesting/schedule',
    state: { at: read_at },
    value: hashOf({ total: decimal(a.total), schedule: a.schedule }),
  }));
}

function payoutsFacts(d: Doc): Fact[] {
  const about = d.about as string;
  const chain = chainOf(about);
  return (
    (d.payouts ?? []) as {
      asset: { id: string };
      raw: string;
      when: string | null;
      proposal: { id: string };
      evidence: { tx: string; block: number } | null;
    }[]
  ).map((p) => ({
    subject: p.evidence ? `${chain}:tx/${p.evidence.tx}` : `proposal:${about}:${p.proposal.id}`,
    what: 'payouts/paid',
    state: p.evidence ? { chain, block: p.evidence.block } : p.when ? { at: p.when } : {},
    value: `${p.asset.id} ${p.raw}`,
  }));
}

function claimFacts(d: Doc): Fact[] {
  const object = d.object as unknown;
  const value =
    typeof object === 'string'
      ? object
      : object && typeof (object as Doc).value === 'string'
        ? ((object as Doc).value as string)
        : hashOf(object);
  // a claim with no chain moment of its own holds now: claims about the same subject meet whenever they were made
  const as_of = str(d.as_of);
  return [
    {
      subject: d.subject as string,
      what: `claim/${d.verb as string}`,
      state: as_of ? { at: as_of } : {},
      value,
    },
  ];
}

/** The rule for each format, by the name before its version. */
const RULES: Record<string, (d: Doc) => Fact[]> = {
  snapshot: snapshotFacts,
  layer: layerFacts,
  value: valueFacts,
  proposals: proposalsFacts,
  mark: markFacts,
  vesting: vestingFacts,
  payouts: payoutsFacts,
  claim: claimFacts,
};

/** The formats compose/v1 has a rule for: any other publishes as a layer and gives no facts yet. */
export const FORMATS_WITH_FACTS = Object.keys(RULES);

/** A layer's facts, by its format's rule; none for a format compose/v1 has no rule for. */
export function factsOf(doc: unknown): Fact[] {
  if (!doc || typeof doc !== 'object') return [];
  const petal = String((doc as Doc).petal ?? '');
  const rule = RULES[petal.split('/')[0] as string];
  return rule ? rule(doc as Doc) : [];
}

/**
 * Whats an account or subject may hold several values of at once (an account has several names, several types):
 * values there stand side by side, and are never "differs".
 */
export const isManyValued = (what: string) => what.startsWith('claim/');

/** A layer's title in words, from the document alone: what the map and the credit record call it. */
export function layerTitle(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return 'a layer';
  const d = doc as Doc;
  const kind = String(d.petal ?? '').split('/')[0];
  if (kind === 'snapshot') {
    const n = d.network as { title?: string; id: string };
    const s = d.snapshot as { block_height?: number; as_of: string };
    const at =
      s.block_height !== undefined ? `block ${grouped(s.block_height)}` : s.as_of.slice(0, 10);
    return `${n.title ?? n.id} at ${at}`;
  }
  const at =
    str(d.read_at)?.slice(0, 10) ?? str((d.when as Doc | undefined)?.as_of)?.slice(0, 10) ?? '';
  const words: Record<string, string> = {
    layer: `${((d.measures ?? []) as { name: string }[]).map((m) => m.name.replaceAll('_', ' ')).join(', ')}`,
    value: 'Value',
    proposals: 'Proposals and votes',
    mark: 'Name, symbol and logo',
    vesting: 'Vesting schedules',
    payouts: 'Payouts',
    claim: `${String(d.verb ?? 'claim')} ${String(d.subject ?? '')}`.trim(),
  };
  const w = words[kind as string] ?? kind ?? 'a layer';
  return at ? `${w}, ${at}` : w;
}
