// Offline import of the step 1 and step 2 spike data (spike v0 format) into
// snapshot/v1 (T017). W0 seeded it; W2 owns it after T023. Run by scripts/import-spike-data.ts.
//
// - Tables named by a string in the spike JSON are CSV sidecars next to it; they are streamed.
// - Rows keep their source ids; fields outside the schema are dropped, CSV-only columns
//   (account_type) move into `detail`.
// - Grouping is declared, never silent: with `rules`, every `rules.relationship` row below
//   `rules.min_amount` is folded into one `group` row per target and backer class, and each
//   class is declared in coverage.grouped[] with its rule, rows folded and amount.
//
// Backer classes (NEAR), first match wins, from the whole crawl before any folding:
//   lockup  the delegator is a lockup contract (account_type lockup)
//   liquid  the delegator is a liquid-staking contract (kind staking_entity)
//   large   the delegator stakes 1,000,000 NEAR or more across all pools
//   other   everyone else
// Kept delegators carry detail.backer_class; group rows carry detail.backer_class and
// detail.pool, so backerSegments reads classes from the snapshot alone.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  Coverage,
  GroupingRules,
  Holding,
  Participant,
  Relationship,
  Snapshot,
  SnapshotEvent,
  SnapshotMoment,
  SnapshotNetwork,
  Source,
  SourceKind,
} from '@petal/core/types';
import { readCsv } from './csv.ts';

export const NEAR_VALIDATORS_RULES: GroupingRules = {
  relationship: 'delegates_to',
  min_amount: '1000',
  unit: 'NEAR',
  group_by: ['to', 'backer_class'],
};

/** Keep every row (for spike files small enough as they are). */
export const NO_GROUPING: GroupingRules = {
  relationship: 'delegates_to',
  min_amount: '0',
  unit: '',
  group_by: [],
};

export type BackerClass = 'lockup' | 'liquid' | 'large' | 'other';
export const BACKER_CLASSES: Record<BackerClass, string> = {
  lockup: 'lockups',
  liquid: 'liquid-staking contracts',
  large: 'accounts with 1M+ NEAR',
  other: 'other delegators',
};
const LARGE_YOCTO = 1_000_000n * 10n ** 24n;
const NEAR_DECIMALS = 24;

/** Spike populations Petal imports, keyed `<spike network id>/<spike population>`. */
const TARGETS: Record<
  string,
  { network: SnapshotNetwork; measure: string; module: { id: string; version: string } }
> = {
  'near/producers': {
    network: {
      id: 'near-validators',
      chain: 'near:mainnet',
      population: 'validators',
      title: 'NEAR validators',
      description: 'Validators and staking pools, and the delegators behind them',
    },
    measure: 'delegated_stake',
    module: { id: 'near-validators', version: 'spike-import/1' },
  },
  'near/house-of-stake': {
    network: {
      id: 'near-house-of-stake',
      chain: 'near:mainnet',
      population: 'house-of-stake',
      title: 'NEAR House of Stake',
      description:
        'veNEAR holders, their voting power and delegations; vote.dao proposals and votes',
    },
    measure: 'voting_power',
    module: { id: 'near-house-of-stake', version: 'spike-import/1' },
  },
};

const ALLOWED = {
  participant: ['id', 'label', 'kind', 'identity', 'roles', 'count', 'source', 'detail'],
  holding: ['participant', 'asset', 'measure', 'amount', 'amount_raw', 'unit', 'as_of', 'source'],
  relationship: [
    'from',
    'to',
    'type',
    'amount',
    'amount_raw',
    'unit',
    'role',
    'bps',
    'as_of',
    'date_is',
    'source',
    'detail',
  ],
  event: ['participant', 'type', 'at', 'detail', 'source'],
  source: ['id', 'kind', 'url', 'method', 'fetched_at', 'block_height'],
  window: ['from', 'to', 'from_block', 'to_block', 'note'],
} as const;

type Row = Record<string, unknown>;

/** Copy the allowed keys that hold a value (drops undefined, null and empty strings). A `detail`
 * that is not an object (e.g. the RPC kick-out reason "Unstaked") becomes `{ value }`. */
function pick(row: Row, keys: readonly string[]): Row {
  const out: Row = {};
  for (const k of keys) {
    const v = row[k];
    if (v === undefined || v === null || v === '') continue;
    out[k] = k === 'detail' && (typeof v !== 'object' || Array.isArray(v)) ? { value: v } : v;
  }
  return out;
}

/** Decimal string in a unit with `decimals` places → base units. */
export function toBaseUnits(decimal: string, decimals: number): bigint {
  const m = /^([0-9]+)(?:\.([0-9]+))?$/.exec(decimal);
  if (!m) throw new Error(`not a decimal: ${decimal}`);
  const frac = (m[2] ?? '').padEnd(decimals, '0');
  if (frac.length > decimals) throw new Error(`too many decimals: ${decimal}`);
  return BigInt((m[1] ?? '0') + frac);
}

/** Base units → shortest decimal string (no trailing zeros). */
export function fromBaseUnits(raw: bigint, decimals: number): string {
  const s = raw.toString().padStart(decimals + 1, '0');
  const int = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}

const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Kind of a spike source, from its id and url. */
export function sourceKind(s: { id: string; url: string }): SourceKind {
  const { id, url } = s;
  if (/constitution/i.test(id)) return 'constitution';
  if (/rpc\./.test(url) || /-rpc/.test(id)) return 'chain';
  if (/api\.|\/api\//.test(url)) return 'api';
  if (/gov\.near\.org|forum/.test(url)) return 'forum';
  if (/docs\.|github\.com/.test(url)) return 'docs';
  return 'dataset';
}

function identityOf(row: Record<string, string>): Participant['identity'] {
  if (!row.identity_name) return null;
  return {
    name: row.identity_name,
    source: row.identity_source || row.source || '',
    status: row.identity_status as NonNullable<Participant['identity']>['status'],
  };
}

function participantFromCsv(row: Record<string, string>, extra: Row = {}): Participant {
  const detail: Row = row.detail ? (JSON.parse(row.detail) as Row) : {};
  if (row.account_type) detail.account_type = row.account_type;
  Object.assign(detail, extra);
  const p: Row = {
    id: row.id,
    label: row.label || row.id,
    kind: row.kind || 'unknown',
    identity: identityOf(row),
    source: row.source,
  };
  if (Object.keys(detail).length) p.detail = detail;
  return p as Participant;
}

function relationshipFromCsv(row: Record<string, string>): Relationship {
  const r = pick(row, ['from', 'to', 'type', 'amount', 'amount_raw', 'unit', 'as_of', 'source']);
  if (row.unstaked_raw && row.unstaked_raw !== '0') {
    r.detail = { unstaked: row.unstaked, unstaked_raw: row.unstaked_raw };
  }
  return r as unknown as Relationship;
}

interface Delegation {
  row: Record<string, string>;
  staked: bigint;
  unstaked: bigint;
}

/**
 * Read a spike v0 file (and its CSV sidecars) and return a snapshot/v1 document.
 * `path` is the spike JSON, e.g. data/near/producers.json.
 */
export async function importSpike(path: string, rules: GroupingRules): Promise<Snapshot> {
  const spike = JSON.parse(await readFile(path, 'utf8')) as Row & {
    network: { id: string; population: string; description?: string };
    snapshot: Row;
    coverage: Row;
    sources: Row[];
  };
  const key = `${spike.network.id}/${spike.network.population}`;
  const target = TARGETS[key];
  if (!target) throw new Error(`importSpike: no target for spike population ${key}`);
  const dir = dirname(path);

  const minRaw = rules.min_amount === '0' ? 0n : toBaseUnits(rules.min_amount, NEAR_DECIMALS);
  const grouping = rules.group_by.length > 0 && minRaw > 0n;

  let participants: Participant[];
  let relationships: Relationship[];
  const grouped: NonNullable<Coverage['grouped']> = [];
  let foldNote = '';

  if (typeof spike.participants === 'string' || typeof spike.relationships === 'string') {
    if (typeof spike.participants !== 'string' || typeof spike.relationships !== 'string') {
      throw new Error('importSpike: expected both participants and relationships as CSV sidecars');
    }
    const participantsCsv = join(dir, spike.participants);
    const relationshipsCsv = join(dir, spike.relationships);

    // Pass 1: what each account is (for backer classes).
    const accountOf = new Map<string, string>();
    for await (const p of readCsv(participantsCsv))
      accountOf.set(p.id ?? '', `${p.kind}|${p.account_type}`);

    // Pass 2: relationships; totals per delegator across all pools.
    const delegations: Delegation[] = [];
    const others: Relationship[] = [];
    const totalOf = new Map<string, bigint>();
    for await (const r of readCsv(relationshipsCsv)) {
      if (r.type !== rules.relationship) {
        others.push(relationshipFromCsv(r));
        continue;
      }
      const staked = BigInt(r.amount_raw || '0');
      const unstaked = BigInt(r.unstaked_raw || '0');
      delegations.push({ row: r, staked, unstaked });
      const from = r.from ?? '';
      totalOf.set(from, (totalOf.get(from) ?? 0n) + staked);
    }

    const classOf = (account: string): BackerClass => {
      const [kind, type] = (accountOf.get(account) ?? '|').split('|');
      if (type === 'lockup' || account.endsWith('.lockup.near')) return 'lockup';
      if (kind === 'staking_entity') return 'liquid';
      if ((totalOf.get(account) ?? 0n) >= LARGE_YOCTO) return 'large';
      return 'other';
    };

    // Keep or fold each delegation.
    const kept: Relationship[] = [];
    const keptAccounts = new Map<string, BackerClass>();
    const groups = new Map<
      string,
      {
        pool: string;
        cls: BackerClass;
        rows: number;
        staked: bigint;
        unstaked: bigint;
        as_of: string;
        source: string;
      }
    >();
    for (const d of delegations) {
      const from = d.row.from ?? '';
      const cls = classOf(from);
      if (!grouping || d.staked >= minRaw) {
        kept.push(relationshipFromCsv(d.row));
        keptAccounts.set(from, cls);
        continue;
      }
      const pool = d.row.to ?? '';
      const gid = `group:${pool}:${cls}`;
      const g = groups.get(gid) ?? {
        pool,
        cls,
        rows: 0,
        staked: 0n,
        unstaked: 0n,
        as_of: d.row.as_of ?? '',
        source: d.row.source ?? '',
      };
      g.rows++;
      g.staked += d.staked;
      g.unstaked += d.unstaked;
      groups.set(gid, g);
    }

    // Pass 3: participants: everyone who is not a delegator, plus delegators with a kept row.
    participants = [];
    for await (const p of readCsv(participantsCsv)) {
      const id = p.id ?? '';
      if (p.kind === 'delegator' && !keptAccounts.has(id)) continue;
      const extra = keptAccounts.has(id) ? { backer_class: keptAccounts.get(id) } : {};
      participants.push(participantFromCsv(p, extra));
    }

    const groupRows: Participant[] = [];
    const groupRels: Relationship[] = [];
    const minLabel = `${thousands(Number(rules.min_amount))} ${rules.unit}`;
    for (const gid of [...groups.keys()].sort()) {
      const g = groups.get(gid);
      if (!g) continue;
      const rule = `${rules.relationship} under ${minLabel} staked, folded per pool and backer class`;
      groupRows.push({
        id: gid,
        label: `${thousands(g.rows)} ${BACKER_CLASSES[g.cls]} under ${minLabel} each`,
        kind: 'group',
        identity: null,
        count: g.rows,
        source: g.source,
        detail: { pool: g.pool, backer_class: g.cls, rule },
      });
      const rel: Row = {
        from: gid,
        to: g.pool,
        type: rules.relationship,
        amount: fromBaseUnits(g.staked, NEAR_DECIMALS),
        amount_raw: g.staked.toString(),
        unit: rules.unit,
        as_of: g.as_of,
        source: g.source,
        detail: { rows_folded: g.rows },
      };
      if (g.unstaked > 0n) {
        rel.detail = {
          rows_folded: g.rows,
          unstaked: fromBaseUnits(g.unstaked, NEAR_DECIMALS),
          unstaked_raw: g.unstaked.toString(),
        };
      }
      groupRels.push(rel as unknown as Relationship);
    }

    if (grouping) {
      for (const cls of Object.keys(BACKER_CLASSES) as BackerClass[]) {
        const gs = [...groups.values()].filter((g) => g.cls === cls);
        if (gs.length === 0) continue;
        const staked = gs.reduce((a, g) => a + g.staked, 0n);
        grouped.push({
          rule: `${rules.relationship} rows under ${minLabel} staked by ${BACKER_CLASSES[cls]} (backer class ${cls}): one group row per pool`,
          rows_folded: gs.reduce((a, g) => a + g.rows, 0),
          amount: fromBaseUnits(staked, NEAR_DECIMALS),
        });
      }
      const all = delegations.reduce((a, d) => a + d.staked, 0n);
      const keptStake = all - [...groups.values()].reduce((a, g) => a + g.staked, 0n);
      const pct = Number((keptStake * 1_000_000n) / (all === 0n ? 1n : all)) / 10_000;
      foldNote =
        ` Petal import: ${thousands(kept.length)} of ${thousands(delegations.length)} ${rules.relationship} rows` +
        ` (${pct.toFixed(2)}% of the stake they carry) have at least ${minLabel} staked and stay individual;` +
        ` the rest are folded into ${thousands(groups.size)} group rows, one per pool and backer class` +
        ' (coverage.grouped). Small delegators appear only inside those groups.' +
        ' Backer classes: lockup (lockup contracts), liquid (liquid-staking contracts),' +
        ' large (1,000,000+ NEAR staked across all pools), other.';
    }
    relationships = [...others, ...kept, ...groupRels];
    participants = [...participants, ...groupRows];
  } else {
    participants = (spike.participants as Row[]).map(
      (p) => ({ identity: null, ...pick(p, ALLOWED.participant) }) as Participant,
    );
    relationships = (spike.relationships as Row[]).map(
      (r) => pick(r, ALLOWED.relationship) as unknown as Relationship,
    );
  }

  const holdings = ((spike.holdings as Row[]) ?? []).map((h) => {
    const out = pick(h, ALLOWED.holding);
    if (!out.measure) out.measure = out.asset; // e.g. proposals_made, votes_cast
    return out as unknown as Holding;
  });
  const events = ((spike.events as Row[]) ?? []).map(
    (e) => pick(e, ALLOWED.event) as unknown as SnapshotEvent,
  );
  const sources = spike.sources.map((s) => {
    const out = pick(s, ALLOWED.source);
    out.kind = sourceKind(s as { id: string; url: string });
    return out as unknown as Source;
  });
  if (sources.length === 0) throw new Error('importSpike: the spike file lists no sources');

  const sm = spike.snapshot;
  const moment: Row = { as_of: sm.as_of };
  if (typeof sm.block_height === 'number') moment.block_height = sm.block_height;
  if (typeof sm.block_hash === 'string') moment.block_hash = sm.block_hash;
  if (sm.epoch_height !== undefined || sm.epoch_id !== undefined) {
    moment.epoch = pick({ height: sm.epoch_height, id: sm.epoch_id }, ['height', 'id']);
  }
  if (sm.window && typeof sm.window === 'object')
    moment.window = pick(sm.window as Row, ALLOWED.window);
  // Every chain read in the spikes was at a final block, and the stored file never changes.
  moment.final = true;

  const sc = spike.coverage;
  const breakdown = sc.breakdown ? ` Spike breakdown: ${JSON.stringify(sc.breakdown)}` : '';
  const coverage: Row = {
    participants_total: sc.participants_total,
    participants_included: sc.participants_included,
    amount_total: sc.amount_total,
    amount_included: sc.amount_included,
    unit: sc.unit,
    measure: target.measure,
  };
  if (grouped.length) coverage.grouped = grouped;
  coverage.note = `${sc.note ?? ''}${foldNote}${breakdown}`.trim();

  const relPath = path.split('/research/')[1];
  return {
    petal: 'snapshot/v1',
    network: target.network,
    snapshot: moment as unknown as SnapshotMoment,
    coverage: coverage as unknown as Coverage,
    sources: sources as Snapshot['sources'],
    participants,
    holdings,
    relationships,
    events,
    module: {
      ...target.module,
      imported_from: relPath ? `research/${relPath}` : path,
    },
  };
}
