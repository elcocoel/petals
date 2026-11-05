// observedClaims: what a snapshot already says, read as claims. Never stored one by one, because the
// snapshot's hash proves them (SYS-064). The same snapshot gives the same claims and the same ids:
// nothing here reads a clock, and `issued_at` is the snapshot's own date.
//
// Names and other identity data are left out on purpose (people.ts). Participants aren't claims.
// Events stay rows for now: they aren't relations between accounts.
import { snapshotSha256 } from '../tables.ts';
import type { Snapshot } from '../types/index.ts';
import { FORBIDDEN_WORDS } from './people.ts';
import { accountRef, assetRef, groupRef, proposalRef } from './refs.ts';
import type { Claim, ClaimDraft, EntityRef } from './types.ts';
import { makeClaim, validateClaim } from './validate.ts';
import { VERB_RULES, type Verb } from './verbs.ts';

/** The writer of every claim read from a snapshot. Anyone can re-derive them and compare ids. */
export const SNAPSHOT_READER: EntityRef = 'tool:petal/observed-claims@1';

export interface SkippedRow {
  table: 'network' | 'holdings' | 'relationships';
  index: number;
  why: string;
}
export interface SnapshotRead {
  claims: Claim[];
  skipped: SkippedRow[];
}

/** Counts of things done, and what a token issued, aren't positions anyone holds. */
const COUNT_UNITS: ReadonlySet<string> = new Set([
  'blocks',
  'chunks',
  'endorsements',
  'proposals',
  'votes',
]);
const isPosition = (measure: string, unit: string) =>
  !COUNT_UNITS.has(unit) && !measure.endsWith('_supply');

/** erc20-holders' leftover row: "It describes no real holder". Nobody to make a claim about. */
const NO_REAL_HOLDER = 'group:not-read';

const SYMBOL = /^[A-Za-z0-9$._-]{1,32}$/;
/** A token's symbol is whatever its deployer typed. If it can't be said here, say the amount alone. */
const sayable = (unit: string | undefined): unit is string =>
  unit !== undefined && SYMBOL.test(unit) && !FORBIDDEN_WORDS.test(unit);
const SLUG = /^[a-z0-9][a-z0-9_.:-]{0,63}$/;
const EVM_ASSET = /^0x[0-9a-fA-F]{40}(:|$)/;
const SOLANA_ASSET = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * An address names one asset on its chain, and so does NEAR's own token. Any other key, like
 * `moloch-v1-share`, means something only inside its population, so two DAOs' shares stay apart.
 */
function snapshotAssetRef(s: Snapshot, asset: string): EntityRef | null {
  const chain = s.network.chain;
  if (chain.startsWith('eip155:') && EVM_ASSET.test(asset))
    return assetRef(chain, asset.toLowerCase());
  if (chain.startsWith('solana:') && SOLANA_ASSET.test(asset)) return assetRef(chain, asset);
  if (chain.startsWith('near:') && asset === 'NEAR') return assetRef(chain, asset);
  return assetRef(chain, `${s.network.population}:${asset}`);
}

/** The verb and qualifiers a relationship row's type stands for, or null if v1 has no verb for it. */
function relationVerb(type: string, role?: string): [Verb, Record<string, string>] | null {
  switch (type) {
    case 'delegates_to':
    case 'owned_by':
    case 'proposed':
    case 'reviewed':
      return [type, {}];
    case 'member_of_role':
      return ['member_of', role && SLUG.test(role) ? { role } : {}];
  }
  const [head = '', tail] = type.split(/:(.*)/);
  if (tail && SLUG.test(tail)) {
    if (head === 'holds_role') return ['holds_role', { role: tail }];
    if (head === 'voted') return ['voted', { choice: tail }];
  }
  return null;
}

/** Every claim a snapshot supports, and every row it doesn't, with why. */
export function readSnapshot(s: Snapshot): SnapshotRead {
  const chain = s.network.chain;
  if (chain === 'none')
    return {
      claims: [],
      skipped: [{ table: 'network', index: 0, why: 'no chain, so nothing here is observed' }],
    };

  const sha = snapshotSha256(s);
  const sources = new Map(s.sources.map((src) => [src.id, src]));
  const folded = new Map<string, number>();
  for (const p of s.participants) if (p.kind === 'group') folded.set(p.id, p.count ?? 1);
  const via = `tool:${s.module.id}@${s.module.version}`;
  const asOf =
    s.snapshot.block_height === undefined
      ? {}
      : { as_of: { chain, block: s.snapshot.block_height } };

  const refOf = (id: string): EntityRef | null => {
    if (id.startsWith('group:')) return groupRef(sha, id.slice('group:'.length));
    if (id.startsWith('proposal:')) return proposalRef(chain, id.slice('proposal:'.length));
    return accountRef(chain, id);
  };

  // A row is observed when a chain was read for it. An API's report of a chain is a source.
  const common = (
    source: string,
    date: string,
  ): Omit<ClaimDraft, 'subject' | 'verb' | 'object'> => {
    const src = sources.get(source);
    const fromChain = src?.kind === 'chain';
    return {
      kind: fromChain ? 'observed' : 'sourced',
      issued_at: s.snapshot.as_of,
      // a snapshot says what held at this moment, and nothing about before or after
      valid_from: date,
      valid_to: date,
      ...asOf,
      evidence: [
        fromChain || !src
          ? { snapshot_sha256: sha }
          : { snapshot_sha256: sha, url: src.url, retrieved_at: src.fetched_at },
      ],
      by: SNAPSHOT_READER,
      via,
    };
  };

  const amount = (row: { amount?: string; unit?: string }): Record<string, string> => ({
    ...(row.amount === undefined ? {} : { amount: row.amount }),
    ...(sayable(row.unit) ? { unit: row.unit } : {}),
  });
  const foldedCount = (id: string): Record<string, string> => {
    const count = folded.get(id);
    return count === undefined ? {} : { folded_count: String(count) };
  };

  const claims = new Map<string, Claim>();
  const skipped: SkippedRow[] = [];
  // Everything returned is valid. A row that can't be said in v1 is listed, not bent to fit.
  const keep = (draft: ClaimDraft, skip: (why: string) => void) => {
    const checked = validateClaim(makeClaim(draft));
    if (!checked.ok) skip(checked.errors.map((e) => `${e.path}: ${e.message}`).join('; '));
    else if (!claims.has(checked.value.id)) claims.set(checked.value.id, checked.value);
  };

  for (const [index, h] of s.holdings.entries()) {
    const skip = (why: string) => skipped.push({ table: 'holdings', index, why });
    if (h.participant === NO_REAL_HOLDER) {
      skip('it describes no real holder');
      continue;
    }
    const subject = refOf(h.participant);
    if (subject === null) {
      skip(`"${h.participant}" is not an account on ${chain}`);
      continue;
    }
    if (!SLUG.test(h.measure)) {
      skip(`"${h.measure}" is not a measure v1 can name`);
      continue;
    }
    const base = { subject, ...common(h.source, h.as_of) };

    if (!isPosition(h.measure, h.unit)) {
      const unit = sayable(h.unit) ? { unit: h.unit } : {};
      keep(
        {
          ...base,
          verb: 'measured',
          object: { value: h.amount, ...unit },
          qualifiers: { measure: h.measure },
        },
        skip,
      );
      continue;
    }
    const object = snapshotAssetRef(s, h.asset);
    if (object === null) {
      skip(`"${h.asset}" is not an asset v1 can name`);
      continue;
    }
    keep(
      {
        ...base,
        verb: 'holds',
        object,
        qualifiers: { ...amount(h), measure: h.measure, ...foldedCount(h.participant) },
      },
      skip,
    );
  }

  for (const [index, r] of s.relationships.entries()) {
    const skip = (why: string) => skipped.push({ table: 'relationships', index, why });
    const mapped = relationVerb(r.type, r.role);
    if (mapped === null) {
      skip(`v1 has no verb for "${r.type}"`);
      continue;
    }
    const [verb, own] = mapped;
    const subject = refOf(r.from);
    const object = refOf(r.to);
    if (subject === null || object === null) {
      skip('an end of it is not a nameable account');
      continue;
    }
    const allowed = VERB_RULES[verb].qualifiers ?? {};
    const qualifiers: Record<string, string> = {
      ...own,
      ...('amount' in allowed ? amount(r) : {}),
      ...('bps' in allowed && r.bps !== undefined ? { bps: String(r.bps) } : {}),
      ...('folded_count' in allowed ? foldedCount(r.from) : {}),
    };
    keep(
      {
        subject,
        verb,
        object,
        ...(Object.keys(qualifiers).length > 0 ? { qualifiers } : {}),
        ...common(r.source, r.as_of),
      },
      skip,
    );
  }

  return { claims: [...claims.values()], skipped };
}

/** The claims a snapshot supports. `readSnapshot` also says which rows it left out, and why. */
export function observedClaims(s: Snapshot): Claim[] {
  return readSnapshot(s).claims;
}
