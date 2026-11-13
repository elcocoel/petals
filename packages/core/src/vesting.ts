// vesting/v1 (12 Nov), a vesting reader for any token: the model works out the vesting schedule, and the petal's
// segments show it. A token's vesting schedules, one allocation each, as whoever found them wrote them (Petals'
// agent from the brain's method, a person's agent, a mapping run), kept by the token's map. Each allocation
// names the account its locked tokens
// sit in, who can claim them, its total, how it releases (lumps at a moment and streams from one moment to
// another, in steps or continuously), what was withdrawn when read, and how it's known: verified (read on chain),
// published (the project's own table) or inferred (from the same pattern as one read on chain).
//
// From it, at a reading's date (vestingPieces), each petal that holds allocations gets:
//
//   vesting       parts     what it holds, cut bottom to top into unlocked (what it holds beyond what its schedules
//                           still lock), next unlock (what unlocks at the next moment one does) and later (the rest
//                           still locked), in the reading's own unit, adding up to what it holds; an empty part left
//                           out; none where its schedules lock more than it holds
//   next_unlock   date      the next moment one of its allocations unlocks; none once all are unlocked
//   tranche       category  the allocation it holds, where it holds one
//
// What isn't here: a continuous stream has no next moment of its own (it unlocks all the time), so it adds to
// "next unlock" only what it releases before another release's moment. Pure.
import { formatDecimal, parseDecimal, pow10 } from './decimal.ts';
import { canonicalJson, sha256Hex } from './hash.ts';
import { isoOf } from './instant.ts';
import type { Standing } from './layers.ts';
import { createAjv, schemaId } from './schema/ajv.ts';
import type { SeamPiece } from './seam.ts';
import type { Result, Snapshot, ValidationIssue } from './types/index.ts';

export const VESTING_VERSION = 'vesting/v1';

/** All of `amount` at one moment: a cliff, a lump. */
export interface Lump {
  at: string;
  amount: string;
}
/**
 * `amount` from `from` to `to`: in equal steps every `every` seconds, the first at from + every and the last at
 * `to`; or, with `every` null, continuously.
 */
export interface Stream {
  from: string;
  to: string;
  every: number | null;
  amount: string;
}
export type Release = Lump | Stream;

export type Known = 'verified' | 'published' | 'inferred';

export interface Allocation {
  name: string;
  /** the account its locked tokens sit in, as CAIP-10: the petal they're part of in a reading of holders */
  holder: string;
  /** who can claim them, as CAIP-10, or null where not known */
  beneficiary: string | null;
  /** whole tokens, as decimal text */
  total: string;
  /** how it releases; the amounts add up to its total */
  schedule: Release[];
  /** what was withdrawn from it, as read, or null where not read */
  released: { amount: string; at: string } | null;
  known: Known;
  /** how it's known, in a sentence */
  how: string;
  evidence: { kind: string; ref: string }[];
}

export interface Vesting {
  petal: typeof VESTING_VERSION;
  /** the token's map, by its address */
  about: string;
  token: { id: string; symbol: string | null; decimals: number };
  allocations: Allocation[];
  read_at: string;
}

let compiled: ReturnType<ReturnType<typeof createAjv>['getSchema']> | undefined;

const isLump = (r: Release): r is Lump => 'at' in r;

/** The vesting, typed, or every reason it isn't: its schema's, and each schedule adding up to its total. */
export function validateVesting(x: unknown): Result<Vesting> {
  compiled ??= createAjv().getSchema(schemaId('vesting'));
  if (!compiled) throw new Error('vesting schema not registered');
  if (!compiled(x)) {
    return {
      ok: false,
      errors: (compiled.errors ?? []).map(
        (e): ValidationIssue => ({
          path: e.instancePath,
          rule: 'schema',
          message: e.message ?? 'invalid',
        }),
      ),
    };
  }
  const v = x as Vesting;
  const errors: ValidationIssue[] = [];
  v.allocations.forEach((a, i) => {
    const scale = Math.max(
      v.token.decimals,
      ...[a.total, ...a.schedule.map((r) => r.amount)].map((t) => parseDecimal(t).s),
    );
    const sum = a.schedule.reduce((n, r) => n + units(r.amount, scale), 0n);
    if (sum !== units(a.total, scale))
      errors.push({
        path: `/allocations/${i}/schedule`,
        rule: 'sum',
        message: `its releases add up to ${formatDecimal(sum, scale)}, not its total ${a.total}`,
      });
    a.schedule.forEach((r, j) => {
      if (!isLump(r) && !(Date.parse(r.to) > Date.parse(r.from)))
        errors.push({
          path: `/allocations/${i}/schedule/${j}`,
          rule: 'order',
          message: 'a stream ends after it starts',
        });
    });
  });
  return errors.length ? { ok: false, errors } : { ok: true, value: v };
}

/** Decimal text at a scale, as an integer. */
function units(text: string, scale: number): bigint {
  const f = parseDecimal(text);
  return f.v * pow10(scale - f.s);
}

/** How much of one release has unlocked at `t` (ms), in units. */
function releasedBy(r: Release, t: number, scale: number): bigint {
  const amount = units(r.amount, scale);
  if (isLump(r)) return t >= Date.parse(r.at) ? amount : 0n;
  const from = Date.parse(r.from);
  const to = Date.parse(r.to);
  if (t >= to) return amount;
  if (t <= from) return 0n;
  // in steps, what the steps passed hold; continuously, what the time passed holds
  const passed =
    r.every === null ? t - from : Math.floor((t - from) / (r.every * 1000)) * r.every * 1000;
  return (amount * BigInt(passed)) / BigInt(to - from);
}

/** The next moment after `t` (ms) a release unlocks something; null when it never will again, or continuously. */
function nextOf(r: Release, t: number): number | null {
  if (isLump(r)) {
    const at = Date.parse(r.at);
    return at > t ? at : null;
  }
  const from = Date.parse(r.from);
  const to = Date.parse(r.to);
  if (r.every === null || t >= to) return null;
  const step = r.every * 1000;
  const k = t < from ? 1 : Math.floor((t - from) / step) + 1;
  return Math.min(from + k * step, to);
}

/** An allocation's unlocked amount at `t` (ms), in units. */
const unlockedAt = (a: Allocation, t: number, scale: number) =>
  a.schedule.reduce((n, r) => n + releasedBy(r, t, scale), 0n);

/** The next moment after `t` one of these allocations unlocks something, or null. */
function nextMoment(allocations: readonly Allocation[], t: number): number | null {
  let soonest: number | null = null;
  for (const a of allocations)
    for (const r of a.schedule) {
      const m = nextOf(r, t);
      if (m !== null && (soonest === null || m < soonest)) soonest = m;
    }
  return soonest;
}

/** The weakest of what the allocations used are: a table's word is a lead, a pattern's an inference. */
function standingOf(allocations: readonly Allocation[]): Standing {
  if (allocations.some((a) => a.known === 'published')) return 'lead';
  if (allocations.some((a) => a.known === 'inferred')) return 'inferred';
  return 'verified';
}

export const UNLOCKED = 'unlocked';
export const NEXT_UNLOCK = 'next unlock';
export const LATER = 'later';

/** The day of an instant: what the labels name. */
const day = (t: string) => t.slice(0, 10);

/**
 * Each petal's vesting at the reading's date: the petals that hold allocations (by their holder account) cut into
 * unlocked, next unlock and later, with their next unlock and, where a petal holds one allocation, its name.
 * None where the vesting is about another map or names none of the reading's petals.
 */
export function vestingPieces(s: Snapshot, v: Vesting | null): SeamPiece[] {
  if (!v || v.allocations.length === 0) return [];
  // a petal's id is its account in CAIP-10, or in older readings its bare address on the reading's chain
  const chain = s.network.chain;
  const key = (a: string) => {
    const full = a.includes(':') ? a : `${chain}:${a}`;
    return full.startsWith('eip155:') ? full.toLowerCase() : full;
  };
  const petal = new Map(s.participants.map((x) => [key(x.id), x.id]));
  const held = new Map<string, Allocation[]>();
  for (const a of v.allocations) {
    const id = petal.get(key(a.holder));
    if (id === undefined) continue;
    held.set(id, [...(held.get(id) ?? []), a]);
  }
  if (!held.size) return [];
  const t = Date.parse(s.snapshot.as_of);
  const measure = s.coverage.measure;
  const holds = new Map(
    s.holdings.filter((h) => h.measure === measure).map((h) => [h.participant, h.amount]),
  );
  const parts: { participant: string; part: string; value: string }[] = [];
  const next: { participant: string; value: string }[] = [];
  const tranche: { participant: string; value: string }[] = [];
  const used: Allocation[] = [];
  for (const [id, allocations] of held) {
    used.push(...allocations);
    const m = nextMoment(allocations, t);
    if (m !== null) next.push({ participant: id, value: isoOf(m) });
    if (allocations.length === 1)
      tranche.push({ participant: id, value: (allocations[0] as Allocation).name });
    const amount = holds.get(id);
    if (amount === undefined) continue;
    const texts = [
      amount,
      ...allocations.flatMap((a) => [a.total, ...a.schedule.map((r) => r.amount)]),
    ];
    const scale = Math.max(v.token.decimals, ...texts.map((x) => parseDecimal(x).s));
    const total = units(amount, scale);
    const locked = allocations.reduce(
      (n, a) => n + units(a.total, scale) - unlockedAt(a, t, scale),
      0n,
    );
    // schedules that lock more than the petal holds don't describe it: it isn't cut
    if (locked > total) continue;
    const soon =
      m === null
        ? 0n
        : allocations.reduce((n, a) => n + unlockedAt(a, m, scale) - unlockedAt(a, t, scale), 0n);
    const cut: [string, bigint][] = [
      [UNLOCKED, total - locked],
      [NEXT_UNLOCK, soon],
      [LATER, locked - soon],
    ];
    for (const [part, value] of cut)
      if (value > 0n) parts.push({ participant: id, part, value: formatDecimal(value, scale) });
  }
  const base = {
    layer: sha256Hex(canonicalJson({ vesting: v.petal, about: v.about, read_at: v.read_at })),
    as_of: v.read_at,
    standing: standingOf(used),
  };
  const when = day(s.snapshot.as_of);
  const pieces: SeamPiece[] = [];
  if (parts.length)
    pieces.push({
      ...base,
      name: 'vesting',
      kind: 'parts',
      unit: s.coverage.unit,
      label: `what it holds by its vesting schedules on ${when}: unlocked (beyond what they still lock), next unlock, later`,
      parts,
    });
  if (next.length)
    pieces.push({
      ...base,
      name: 'next_unlock',
      kind: 'date',
      unit: 'date',
      label: `the next moment after ${when} one of its allocations unlocks`,
      values: next,
    });
  if (tranche.length)
    pieces.push({
      ...base,
      name: 'tranche',
      kind: 'category',
      unit: 'allocation',
      label: 'the allocation it holds',
      values: tranche,
    });
  return pieces;
}

/** One allocation's schedule at a moment, in whole tokens: unlocked, the next unlock and when, and what stays locked. */
export interface AllocationAt {
  name: string;
  holder: string;
  beneficiary: string | null;
  total: string;
  unlocked: string;
  next_unlock: { at: string; amount: string } | null;
  later: string;
  known: Known;
}

/** A token's vesting at a moment, each allocation and all of them together, for an agent to say (get_map). */
export interface VestingAt {
  at: string;
  read_at: string;
  token: Vesting['token'];
  totals: Omit<AllocationAt, 'name' | 'holder' | 'beneficiary' | 'known'>;
  allocations: AllocationAt[];
}

/**
 * The vesting at `t` (ms) by its schedules alone: what each allocation has unlocked, what unlocks at its next
 * moment, and what stays locked after it; the totals' next unlock is the soonest of any allocation, and what
 * all of them unlock then. Unlocked by the schedule, not what was withdrawn (an allocation's `released`).
 */
export function vestingAt(v: Vesting, t: number): VestingAt {
  const texts = v.allocations.flatMap((a) => [a.total, ...a.schedule.map((r) => r.amount)]);
  const scale = Math.max(v.token.decimals, ...texts.map((x) => parseDecimal(x).s));
  const fmt = (n: bigint) => formatDecimal(n, scale);
  const allocations = v.allocations.map((a): AllocationAt => {
    const total = units(a.total, scale);
    const unlocked = unlockedAt(a, t, scale);
    const m = nextMoment([a], t);
    const soon = m === null ? 0n : unlockedAt(a, m, scale) - unlocked;
    return {
      name: a.name,
      holder: a.holder,
      beneficiary: a.beneficiary,
      total: fmt(total),
      unlocked: fmt(unlocked),
      next_unlock: m === null ? null : { at: isoOf(m), amount: fmt(soon) },
      later: fmt(total - unlocked - soon),
      known: a.known,
    };
  });
  const total = v.allocations.reduce((n, a) => n + units(a.total, scale), 0n);
  const unlocked = v.allocations.reduce((n, a) => n + unlockedAt(a, t, scale), 0n);
  const m = nextMoment(v.allocations, t);
  const soon =
    m === null
      ? 0n
      : v.allocations.reduce((n, a) => n + unlockedAt(a, m, scale) - unlockedAt(a, t, scale), 0n);
  return {
    at: isoOf(t),
    read_at: v.read_at,
    token: v.token,
    totals: {
      total: fmt(total),
      unlocked: fmt(unlocked),
      next_unlock: m === null ? null : { at: isoOf(m), amount: fmt(soon) },
      later: fmt(total - unlocked - soon),
    },
    allocations,
  };
}
