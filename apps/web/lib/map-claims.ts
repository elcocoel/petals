// What Petals' own mapping says about a map's accounts (Elco, 11 Nov: "we need to design how authored claims
// show on the map - it's part of the overlays mission"): the waves' checked claims, the same for every viewer,
// read from GET /api/v1/maps/:id/claims. Each as a person reads it, in the flower's box's own words
// (lib/claim-lines.ts): what it says, how it's known (never "verified"), who said it and when; and, asked,
// what it rests on: each piece of evidence with who found it and when, an inference's method, and what a note
// rests on and doesn't claim. Pure. The words are drafts.
import type { Claim } from '@petal/core/types';
import { claimWords } from './claim-lines.ts';

/** GET /api/v1/maps/:id/claims: the claims about its accounts and its own address, oldest first. */
export interface MapClaims {
  about: string;
  claims: Claim[];
}

/** One piece of what a claim rests on, in words. */
export interface EvidenceLine {
  /** a reading, a transaction, a proposal, a page, a post, a claim, a note */
  what: string;
  /** the piece itself: its note, its quote, a proposal's number, a short hash */
  says?: string;
  /** where it can be opened */
  link?: string;
  /** who found it and when */
  found?: string;
}

/** One claim, as the overlay says it, then what it rests on when asked. */
export interface MapClaimLine {
  key: string;
  says: string;
  kind: string;
  /** "Petals' mapping" */
  who: string;
  /** the tool or model that made it, quiet beside who */
  tool?: string;
  when: string;
  /** an inference's method, "name@version" */
  method?: string;
  /** what kind of note it is, when its words say (a record's type: "valuation scope") */
  tag?: string;
  /** what a note rests on, and what it doesn't claim, when its words say so */
  basis?: string;
  limits?: string;
  /** a record's other parts, each with its name in words */
  more: [string, string][];
  evidence: EvidenceLine[];
}

/** One account's claims, under its name on the flower. */
export interface MapClaimGroup {
  account: string;
  /** its petal's name, or its short address */
  name: string;
  /** it's one of this flower's petals, so the map can light it */
  petal: boolean;
  lines: MapClaimLine[];
}

/** A run of a claim's words: as written, or a long address or hash shortened to its ends, whole on hover. */
export interface Words {
  text: string;
  whole?: string;
}

/** An address or a hash: base58 (Solana), 0x hex (EVM), a bare 64-hex hash. Words never run this long. */
const LONG = /\b(?:0x[0-9a-fA-F]{40,64}|[0-9a-f]{64}|[1-9A-HJ-NP-Za-km-z]{32,44})\b/g;

/** A claim's words with each long address or hash read as its ends (8HVYKg…uSX9). */
export function wordsOf(text: string): Words[] {
  const out: Words[] = [];
  let at = 0;
  for (const m of text.matchAll(LONG)) {
    const i = m.index ?? 0;
    if (i > at) out.push({ text: text.slice(at, i) });
    out.push({ text: short(m[0]), whole: m[0] });
    at = i + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

const EVIDENCE: Record<string, string> = {
  snapshot: 'a reading',
  tx: 'a transaction',
  proposal: 'a proposal',
  page: 'a page',
  post: 'a post',
  claim: 'a claim',
  note: 'a note',
};

/** Drafts (Elco changes them later). */
export const mapClaimWords = {
  title: "What's said",
  folded: (n: number) => `What's said · ${n}`,
  mapping: "Petals' mapping",
  method: 'method',
  basis: 'rests on',
  limits: "doesn't claim",
  found: (who: string, when: string) => `found by ${who}, ${when}`,
  rests: 'What it rests on',
  made: (tool: string | undefined, when: string) => (tool ? `by ${tool}, ${when}` : when),
  none: 'Nothing said about this map yet.',
} as const;

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** "11 Nov 2026", or the text as it is when it isn't a date. */
export function dayOf(iso: string | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : DAY.format(t);
}

/** tool:codex-solana-wave@1 and model:glm@unreported: the tool's or model's name; null when it's neither. */
export function toolOf(ref: string | undefined): string | null {
  const m = /^(?:tool|model):([^@]+)/.exec(ref ?? '');
  return m?.[1] ?? null;
}

/** Who found a piece: the tool or model by its name, else the account as it's written. */
const finder = (ref: string | undefined) => toolOf(ref) ?? ref ?? '';

const short = (s: string) => (s.length > 16 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s);

/** A note as it reads: its words, and, when they're a small record (JSON), its parts. */
export interface Note {
  says: string;
  tag?: string;
  basis?: string;
  limits?: string;
  more: [string, string][];
}

/** "pricing_time" is "pricing time", "multi-asset" is "multi asset". */
const spoken = (key: string) => key.replace(/[_-]+/g, ' ').trim();

/**
 * A note's words, or, when they're a small record ({"type", "value" or "meaning", "basis", "limits", …}), its
 * words, what kind of note it is, what it rests on and doesn't claim, and the rest of its parts.
 */
export function noteOf(value: string): Note {
  const text = value.trim();
  if (!text.startsWith('{')) return { says: text, more: [] };
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { says: text, more: [] };
  }
  const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : undefined);
  const said = ['value', 'meaning', 'summary', 'note'].find((k) => str(k));
  const told = new Set(['type', 'basis', 'limits', ...(said ? [said] : [])]);
  const more = Object.entries(o)
    .filter(([k, v]) => !told.has(k) && (typeof v === 'string' || typeof v === 'number'))
    .map(([k, v]) => [spoken(k), String(v)] as [string, string]);
  const tag = str('type');
  const basis = str('basis');
  const limits = str('limits');
  return {
    says: said ? (str(said) as string) : tag ? spoken(tag) : text,
    ...(tag ? { tag: spoken(tag) } : {}),
    ...(basis ? { basis } : {}),
    ...(limits ? { limits } : {}),
    more,
  };
}

function evidenceLine(e: Claim['evidence'][number]): EvidenceLine {
  const what = EVIDENCE[e.type ?? ''] ?? e.type ?? 'a source';
  const proposal = e.proposal?.split(':').at(-1);
  const says =
    e.note ??
    (e.quote ? `“${e.quote}”` : undefined) ??
    (proposal ? `#${proposal}` : undefined) ??
    (e.tx ? short(e.tx.split(':').at(-1) ?? e.tx) : undefined) ??
    (e.snapshot_sha256 ? short(e.snapshot_sha256) : undefined) ??
    (e.claim_id ? short(e.claim_id) : undefined);
  const found = e.found_by ? mapClaimWords.found(finder(e.found_by), dayOf(e.found_at)) : undefined;
  return {
    what,
    ...(says ? { says } : {}),
    ...(e.url ? { link: e.url } : {}),
    ...(found ? { found } : {}),
  };
}

/** A claim's words: a name, what kind of thing it is, or a note's own words. */
function saysOf(c: Claim): Note {
  const value = typeof c.object === 'string' ? c.object : c.object.value;
  if (c.verb === 'named') return { says: claimWords.named(value), more: [] };
  if (c.verb === 'is_a') return { says: value, more: [] };
  return noteOf(value);
}

/**
 * The map's claims, one group per account in the order they're first said, oldest first in each; the picked
 * account's group first. `names` gives each account its petal's name.
 */
export function mapClaimGroups(
  claims: readonly Claim[],
  names: ReadonlyMap<string, string>,
  picked: string | null = null,
): MapClaimGroup[] {
  const groups = new Map<string, MapClaimGroup>();
  for (const c of claims) {
    const account = c.subject;
    let g = groups.get(account);
    if (!g) {
      g = {
        account,
        name: names.get(account) ?? short(account.split(':').at(-1) ?? account),
        petal: names.has(account),
        lines: [],
      };
      groups.set(account, g);
    }
    const said = saysOf(c);
    const tool = toolOf(c.by) ?? toolOf(c.via);
    g.lines.push({
      key: c.id,
      says: said.says,
      kind: c.kind,
      who: mapClaimWords.mapping,
      ...(tool ? { tool } : {}),
      when: dayOf(c.issued_at),
      ...(c.method ? { method: c.method } : {}),
      ...(said.tag ? { tag: said.tag } : {}),
      ...(said.basis ? { basis: said.basis } : {}),
      ...(said.limits ? { limits: said.limits } : {}),
      more: said.more,
      evidence: c.evidence.map(evidenceLine),
    });
  }
  const all = [...groups.values()];
  return picked
    ? [...all.filter((g) => g.account === picked), ...all.filter((g) => g.account !== picked)]
    : all;
}
