// The questions the index answers (T198). The honesty rules live here, in the data, not with a
// caller: overlap is a lower bound wherever coverage is partial; every result carries its dates and
// the gap between them; a match across chains is marked inferred; a group is never related to itself;
// and nothing here says accounts act together. Nothing in an answer depends on an integer id.
import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite';
import { walk } from './path.ts';
import { type Coverage, type GroupKind, isEvm, normalise, scopeOf } from './project.ts';

export const NOT_COORDINATION =
  'Shared membership is not coordination, and it does not show that accounts share an owner or a controller.';
export const ABSENCE_IS_NOT_PROOF =
  'Where coverage is partial, an account or an overlap not seen here may still exist.';

export type Match =
  | { status: 'observed' }
  | { status: 'inferred'; method: 'same_evm_address' | 'same_address_string' };

const OBSERVED: Match = { status: 'observed' };
const SAME_EVM: Match = { status: 'inferred', method: 'same_evm_address' };

export class RelationsError extends Error {
  readonly code: 'bad_input' | 'not_found';
  readonly hint: string | undefined;
  constructor(code: 'bad_input' | 'not_found', message: string, hint?: string) {
    super(message);
    this.code = code;
    this.hint = hint;
  }
}

/** A group at one date, with what that read could see. */
export interface GroupObservation {
  group_id: string;
  title: string;
  kind: GroupKind;
  chain: string;
  module: string;
  measure: string;
  unit: string;
  as_of: string;
  block_height: number | null;
  final: boolean;
  snapshot_sha256: string;
  /** false: a later observation of this group is stored */
  latest: boolean;
  /** how many dates of this group are stored */
  observations: number;
  coverage: Coverage;
}

export interface IndexFacts {
  snapshots: number;
  groups: number;
  observations: number;
  observations_partial: number;
}

export interface MembershipRow {
  group: GroupObservation;
  /** chain:address, as it was observed in this group */
  account: string;
  match: Match;
  amount: string;
  share: number;
  rank: number;
  /** a label the snapshot holds, with its status as stored. It is never upgraded here. */
  identity: unknown;
  account_kind: string | null;
}

export interface SharedAccountRow {
  account_a: string;
  account_b: string;
  match: Match;
  amount_a: string;
  amount_b: string;
  share_a: number;
  share_b: number;
  rank_a: number;
  rank_b: number;
  as_of_a: string;
  as_of_b: string;
  identity_a: unknown;
  identity_b: unknown;
  /** how many groups this address appears in: a very high number says little about these two */
  groups_observed: number;
}

export interface PairFacts {
  /** at_least: partial coverage on either side, so more may be shared than was seen */
  at_least: boolean;
  match: Match;
  as_of_a: string;
  as_of_b: string;
  gap_seconds: number;
  gap_days: number;
}

export interface RelatedRow extends PairFacts {
  group: GroupObservation;
  shared: number;
  weight: number;
  share_of_a: number;
  share_of_b: number;
}

export type PathEnd =
  | 'found'
  | 'same_account'
  | 'unknown_account'
  | 'no_path'
  | 'depth_limit'
  | 'budget';

export type PathHop =
  | {
      via: 'group';
      from: string;
      to: string;
      group: GroupObservation;
      from_in_group: { role: 'member'; share: number; rank: number } | { role: 'anchor' };
      to_in_group: { role: 'member'; share: number; rank: number } | { role: 'anchor' };
    }
  | { via: 'same_address'; from: string; to: string; match: Match };

export const DEFAULT_MAX_DEPTH = 3;
export const MAX_DEPTH = 6;
/**
 * Edges one walk may read. It runs synchronously, so this is how long a stranger can hold the one
 * event loop per request: measured on 2026-11-06, 200,000 edges took about 65 ms, and 2M took a second.
 */
export const MAX_BUDGET = 200_000;
export const DEFAULT_BUDGET = MAX_BUDGET;

const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;

const OBSERVATION_COLUMNS = `
  g.key AS group_id, g.title, g.kind, g.chain, g.module, g.measure, g.unit,
  o.id AS obs_id, o.group_id AS grp, o.snapshot_sha256, o.as_of, o.as_of_s, o.block_height, o.final, o.latest,
  o.members_named, o.members_total, o.tail_accounts, o.amount_total, o.amount_named, o.named_share,
  o.read_window, o.complete, o.why_partial,
  (SELECT count(*) FROM observation c WHERE c.group_id = o.group_id) AS observation_count`;

interface ObservationRow {
  group_id: string;
  title: string;
  kind: GroupKind;
  chain: string;
  module: string;
  measure: string;
  unit: string;
  obs_id: number;
  grp: number;
  snapshot_sha256: string;
  as_of: string;
  as_of_s: number;
  block_height: number | null;
  final: number;
  latest: number;
  members_named: number;
  members_total: number | null;
  tail_accounts: number | null;
  amount_total: string;
  amount_named: string;
  named_share: number;
  read_window: string | null;
  complete: number;
  why_partial: string;
  observation_count: number;
}

function facts(r: ObservationRow): GroupObservation {
  return {
    group_id: r.group_id,
    title: r.title,
    kind: r.kind,
    chain: r.chain,
    module: r.module,
    measure: r.measure,
    unit: r.unit,
    as_of: r.as_of,
    block_height: r.block_height,
    final: r.final === 1,
    snapshot_sha256: r.snapshot_sha256,
    latest: r.latest === 1,
    observations: r.observation_count,
    coverage: {
      members_named: r.members_named,
      members_total: r.members_total,
      tail_accounts: r.tail_accounts,
      amount_total: r.amount_total,
      amount_named: r.amount_named,
      named_share: r.named_share,
      window: r.read_window,
      complete: r.complete === 1,
      why_partial: JSON.parse(r.why_partial) as string[],
    },
  };
}

function pair(
  a: { chain: string; as_of: string; as_of_s: number; complete: number },
  b: { chain: string; as_of: string; as_of_s: number; complete: number },
): PairFacts {
  const gap = Math.abs(a.as_of_s - b.as_of_s);
  return {
    at_least: !(a.complete === 1 && b.complete === 1),
    match: a.chain === b.chain ? OBSERVED : SAME_EVM,
    as_of_a: a.as_of,
    as_of_b: b.as_of,
    gap_seconds: gap,
    gap_days: Math.round((gap / 86_400) * 1000) / 1000,
  };
}

const parseIdentity = (text: string | null): unknown => (text ? JSON.parse(text) : null);

const CAIP_ACCOUNT = /^((?:[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32})|none):(.+)$/;
const SHA256 = /^[0-9a-f]{64}$/;

/** An account's name, chain:address; an address a reading already wrote with its chain is named once. */
const accountName = (chain: string, address: string): string =>
  address.startsWith(`${chain}:`) ? address : `${chain}:${address}`;

/** `chain:address`, or a bare address when no chain was said. */
export function parseAccount(text: string): { chain: string | null; address: string } {
  const m = CAIP_ACCOUNT.exec(text.trim());
  if (m) {
    const chain = m[1] as string;
    return { chain, address: normalise(chain, m[2] as string) };
  }
  const bare = text.trim();
  return { chain: null, address: /^0x[0-9a-fA-F]{40}$/.test(bare) ? bare.toLowerCase() : bare };
}

interface ResolvedAccount {
  id: number;
  node_id: number;
  chain: string;
  address: string;
}

export class Queries {
  readonly #db: DatabaseSync;
  readonly #statements = new Map<string, StatementSync>();

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  #all<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.#st(sql).all(...params) as T[];
  }

  #get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.#st(sql).get(...params) as T | undefined;
  }

  #st(sql: string): StatementSync {
    let s = this.#statements.get(sql);
    if (!s) {
      s = this.#db.prepare(sql);
      this.#statements.set(sql, s);
    }
    return s;
  }

  indexFacts(): IndexFacts {
    const row = this.#get<{ total: number; partial: number | null }>(
      'SELECT count(*) AS total, sum(complete = 0) AS partial FROM observation',
    );
    return {
      snapshots: this.#get<{ n: number }>('SELECT count(*) AS n FROM snapshot')?.n ?? 0,
      groups: this.#get<{ n: number }>('SELECT count(*) AS n FROM grp')?.n ?? 0,
      observations: row?.total ?? 0,
      observations_partial: row?.partial ?? 0,
    };
  }

  #resolve(text: string): ResolvedAccount[] {
    const { chain, address } = parseAccount(text);
    const rows = this.#all<ResolvedAccount>(
      `SELECT a.id, a.node_id, a.chain, n.address FROM node n JOIN account a ON a.node_id = n.id
       WHERE n.address = ? ORDER BY a.chain`,
      address,
    );
    return chain === null ? rows : rows.filter((r) => scopeOf(r.chain) === scopeOf(chain));
  }

  /**
   * Is this row the account that was asked about? Yes on the chain asked for. With no chain asked,
   * only when the address appears on one chain: otherwise that's the question being asked.
   */
  #matchOf(asked: string | null, chain: string, onChains: number): Match {
    if (asked === chain || (asked === null && onChains === 1)) return OBSERVED;
    return isEvm(chain) ? SAME_EVM : { status: 'inferred', method: 'same_address_string' };
  }

  accountGroups(account: string, opts: { limit?: number } = {}) {
    const limit = opts.limit ?? 100;
    const { chain: asked } = parseAccount(account);
    const resolved = this.#resolve(account);
    const nodes = [...new Set(resolved.map((r) => r.node_id))];
    const rows = nodes.flatMap((node) =>
      this.#all<
        ObservationRow & {
          amount: string;
          share: number;
          rnk: number;
          account_kind: string | null;
          identity: string | null;
          address: string;
        }
      >(
        `SELECT ${OBSERVATION_COLUMNS}, m.amount, m.share, m.rnk, m.kind AS account_kind, m.identity, n.address
         FROM membership m
         JOIN observation o ON o.id = m.observation_id
         JOIN grp g ON g.id = o.group_id
         JOIN node n ON n.id = m.node_id
         WHERE m.node_id = ?`,
        node,
      ),
    );
    rows.sort(
      (x, y) =>
        y.share - x.share ||
        (x.group_id < y.group_id ? -1 : x.group_id > y.group_id ? 1 : y.as_of_s - x.as_of_s),
    );
    const groups: MembershipRow[] = rows.slice(0, limit).map((r) => ({
      group: facts(r),
      account: accountName(r.chain, r.address),
      match: this.#matchOf(asked, r.chain, resolved.length),
      amount: r.amount,
      share: round6(r.share),
      rank: r.rnk,
      identity: parseIdentity(r.identity),
      account_kind: r.account_kind,
    }));
    const ids = resolved.map((r) => r.id);
    const anchorOf = ids.flatMap((id) =>
      this.#all<ObservationRow>(
        `SELECT ${OBSERVATION_COLUMNS} FROM observation o JOIN grp g ON g.id = o.group_id
         WHERE o.anchor_account = ? AND o.latest = 1`,
        id,
      ),
    );
    const index = this.indexFacts();
    return {
      asked: account,
      accounts: resolved.map((r) => accountName(r.chain, r.address)),
      groups,
      total: rows.length,
      more: Math.max(0, rows.length - groups.length),
      /** the groups this account is what the group is about, such as a pool and its delegators */
      anchor_of: anchorOf
        .map(facts)
        .sort((x, y) => (x.group_id < y.group_id ? -1 : 1))
        .slice(0, limit),
      at_least: index.observations_partial > 0,
      index,
      absence: ABSENCE_IS_NOT_PROOF,
      does_not_show: NOT_COORDINATION,
    };
  }

  /** A group id (its latest date), `<group id>@<sha256>` (that date), or a snapshot's own sha256. */
  #observation(ref: string): ObservationRow & { pinned: boolean } {
    const byObservation = `SELECT ${OBSERVATION_COLUMNS} FROM observation o JOIN grp g ON g.id = o.group_id`;
    if (SHA256.test(ref)) {
      const row = this.#get<ObservationRow>(
        `${byObservation} WHERE o.snapshot_sha256 = ? AND g.kind = 'holdings'`,
        ref,
      );
      if (row) return { ...row, pinned: true };
      throw new RelationsError(
        'not_found',
        `No group in the index comes from the snapshot ${ref}.`,
        'relations_overview lists the groups and the snapshots they come from.',
      );
    }
    const at = ref.lastIndexOf('@');
    const key = at === -1 ? ref : ref.slice(0, at);
    const sha = at === -1 ? null : ref.slice(at + 1);
    const row =
      sha === null
        ? this.#get<ObservationRow>(`${byObservation} WHERE g.key = ? AND o.latest = 1`, key)
        : this.#get<ObservationRow>(
            `${byObservation} WHERE g.key = ? AND o.snapshot_sha256 = ?`,
            key,
            sha,
          );
    if (row) return { ...row, pinned: sha !== null };
    const like = this.#all<{ key: string }>(
      `SELECT key FROM grp WHERE instr(lower(key || ' ' || title), lower(?)) > 0 ORDER BY key LIMIT 5`,
      key,
    ).map((r) => r.key);
    throw new RelationsError(
      'not_found',
      `No group "${ref}" in the index.`,
      like.length
        ? `Group ids that match: ${like.join(', ')}.`
        : 'relations_overview lists every group id.',
    );
  }

  sharedAccounts(groupA: string, groupB: string, opts: { limit?: number } = {}) {
    const limit = opts.limit ?? 50;
    const a = this.#observation(groupA);
    const b = this.#observation(groupB);
    if (a.obs_id === b.obs_id) {
      const dates = this.#all<{ snapshot_sha256: string }>(
        'SELECT snapshot_sha256 FROM observation WHERE group_id = ? ORDER BY as_of_s, snapshot_sha256',
        a.grp,
      ).map((r) => `${a.group_id}@${r.snapshot_sha256}`);
      throw new RelationsError(
        'bad_input',
        'Those name one group at one date, so there is nothing to compare.',
        dates.length > 1
          ? `To compare two dates of it, name them: ${dates.join(', ')}.`
          : 'Name two groups: relations_overview lists them.',
      );
    }
    const totals = this.#get<{
      n: number;
      weight: number | null;
      sa: number | null;
      sb: number | null;
    }>(
      `SELECT count(*) AS n, sum(min(x.share, y.share)) AS weight, sum(x.share) AS sa, sum(y.share) AS sb
       FROM membership x JOIN membership y ON y.observation_id = ?2 AND y.node_id = x.node_id
       WHERE x.observation_id = ?1`,
      a.obs_id,
      b.obs_id,
    );
    const rows = this.#all<{
      node_id: number;
      address: string;
      ax: string;
      ay: string;
      sx: number;
      sy: number;
      rx: number;
      ry: number;
      ix: string | null;
      iy: string | null;
      groups_observed: number;
    }>(
      `SELECT t.*, n.address,
         (SELECT count(DISTINCT o.group_id) FROM membership d JOIN observation o ON o.id = d.observation_id
           WHERE d.node_id = t.node_id) AS groups_observed
       FROM (
         SELECT x.node_id, x.amount AS ax, y.amount AS ay, x.share AS sx, y.share AS sy,
                x.rnk AS rx, y.rnk AS ry, x.identity AS ix, y.identity AS iy
         FROM membership x JOIN membership y ON y.observation_id = ?2 AND y.node_id = x.node_id
         WHERE x.observation_id = ?1
         ORDER BY min(x.share, y.share) DESC, x.node_id
         LIMIT ?3
       ) t JOIN node n ON n.id = t.node_id
       ORDER BY min(t.sx, t.sy) DESC, n.address`,
      a.obs_id,
      b.obs_id,
      limit,
    );
    const shared = totals?.n ?? 0;
    const p = pair(a, b);
    const accounts: SharedAccountRow[] = rows.map((r) => ({
      account_a: accountName(a.chain, r.address),
      account_b: accountName(b.chain, r.address),
      match: p.match,
      amount_a: r.ax,
      amount_b: r.ay,
      share_a: round6(r.sx),
      share_b: round6(r.sy),
      rank_a: r.rx,
      rank_b: r.ry,
      as_of_a: a.as_of,
      as_of_b: b.as_of,
      identity_a: parseIdentity(r.ix),
      identity_b: parseIdentity(r.iy),
      groups_observed: r.groups_observed,
    }));
    return {
      a: facts(a),
      b: facts(b),
      /** two dates of one group: this says who stayed, not how two groups relate */
      same_group: a.grp === b.grp,
      shared,
      ...p,
      weight: round6(totals?.weight ?? 0),
      share_of_a: round6(totals?.sa ?? 0),
      share_of_b: round6(totals?.sb ?? 0),
      accounts,
      more: Math.max(0, shared - accounts.length),
      absence: ABSENCE_IS_NOT_PROOF,
      does_not_show: NOT_COORDINATION,
    };
  }

  relatedGroups(group: string, opts: { by?: 'count' | 'share'; limit?: number } = {}) {
    const by = opts.by ?? 'count';
    const limit = opts.limit ?? 20;
    const { grp } = this.#observation(group);
    const self = this.#get<ObservationRow>(
      `SELECT ${OBSERVATION_COLUMNS} FROM observation o JOIN grp g ON g.id = o.group_id
       WHERE o.group_id = ? AND o.latest = 1`,
      grp,
    ) as ObservationRow;
    const order = by === 'count' ? 'go.shared DESC, go.b DESC' : 'go.weight DESC, go.b DESC';
    const rows = this.#all<
      ObservationRow & { shared: number; weight: number; share_a: number; share_b: number }
    >(
      `SELECT ${OBSERVATION_COLUMNS}, go.shared, go.weight, go.share_a, go.share_b
       FROM group_overlap go
       JOIN observation o ON o.id = go.b_obs
       JOIN grp g ON g.id = go.b
       WHERE go.a = ?
       ORDER BY ${order} LIMIT ?`,
      grp,
      limit,
    );
    const total =
      this.#get<{ n: number }>('SELECT count(*) AS n FROM group_overlap WHERE a = ?', grp)?.n ?? 0;
    const related: RelatedRow[] = rows.map((r) => ({
      group: facts(r),
      shared: r.shared,
      ...pair(self, r),
      weight: round6(r.weight),
      share_of_a: round6(r.share_a),
      share_of_b: round6(r.share_b),
    }));
    return {
      group: facts(self),
      by,
      basis: 'the latest stored observation of each group',
      related,
      total,
      more: Math.max(0, total - related.length),
      absence: ABSENCE_IS_NOT_PROOF,
      does_not_show: NOT_COORDINATION,
    };
  }

  overview(opts: { minShared?: number; kind?: GroupKind; limit?: number } = {}) {
    const minShared = opts.minShared ?? 1;
    const limit = opts.limit ?? 500;
    const kind = opts.kind ?? null;
    const groups = this.#all<ObservationRow>(
      `SELECT ${OBSERVATION_COLUMNS} FROM observation o JOIN grp g ON g.id = o.group_id
       WHERE o.latest = 1 AND (?1 IS NULL OR g.kind = ?1) ORDER BY g.key`,
      kind,
    ).map((r) => ({
      id: r.group_id,
      title: r.title,
      kind: r.kind,
      chain: r.chain,
      module: r.module,
      unit: r.unit,
      as_of: r.as_of,
      snapshot_sha256: r.snapshot_sha256,
      observations: r.observation_count,
      members_named: r.members_named,
      members_total: r.members_total,
      complete: r.complete === 1,
    }));
    const everyGroup = this.#get<{ n: number }>('SELECT count(*) AS n FROM grp')?.n ?? 0;
    const pairFilter = `go.a < go.b AND go.shared >= ?1 AND (?2 IS NULL OR (ga.kind = ?2 AND gb.kind = ?2))`;
    const pairJoins =
      'FROM group_overlap go JOIN grp ga ON ga.id = go.a JOIN grp gb ON gb.id = go.b';
    const rows = this.#all<{
      a: string;
      b: string;
      shared: number;
      weight: number;
      chain_a: string;
      chain_b: string;
      as_of_a: string;
      as_of_b: string;
      as_of_s_a: number;
      as_of_s_b: number;
      complete_a: number;
      complete_b: number;
    }>(
      `SELECT ga.key AS a, gb.key AS b, go.shared, go.weight, ga.chain AS chain_a, gb.chain AS chain_b,
         oa.as_of AS as_of_a, ob.as_of AS as_of_b, oa.as_of_s AS as_of_s_a, ob.as_of_s AS as_of_s_b,
         oa.complete AS complete_a, ob.complete AS complete_b
       ${pairJoins}
       JOIN observation oa ON oa.id = go.a_obs JOIN observation ob ON ob.id = go.b_obs
       WHERE ${pairFilter}
       ORDER BY go.shared DESC, go.a DESC, go.b DESC LIMIT ?3`,
      minShared,
      kind,
      limit,
    );
    const pairsTotal =
      this.#get<{ n: number }>(
        `SELECT count(*) AS n ${pairJoins} WHERE ${pairFilter}`,
        minShared,
        kind,
      )?.n ?? 0;
    const pairs = rows.map((r) => ({
      a: r.a,
      b: r.b,
      shared: r.shared,
      weight: round6(r.weight),
      ...pair(
        { chain: r.chain_a, as_of: r.as_of_a, as_of_s: r.as_of_s_a, complete: r.complete_a },
        { chain: r.chain_b, as_of: r.as_of_b, as_of_s: r.as_of_s_b, complete: r.complete_b },
      ),
    }));
    return {
      min_shared: minShared,
      kind: kind ?? 'all',
      basis: 'the latest stored observation of each group',
      groups,
      /** groups of another kind, left out by the kind asked for */
      groups_left_out: everyGroup - groups.length,
      pairs,
      pairs_total: pairsTotal,
      pairs_more: Math.max(0, pairsTotal - pairs.length),
      accounts: this.#get<{ n: number }>('SELECT count(*) AS n FROM node')?.n ?? 0,
      index: this.indexFacts(),
      absence: ABSENCE_IS_NOT_PROOF,
      does_not_show: NOT_COORDINATION,
    };
  }

  path(
    accountA: string,
    accountB: string,
    opts: { maxDepth?: number; budget?: number; includeInferred?: boolean } = {},
  ) {
    const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
    const budget = opts.budget ?? DEFAULT_BUDGET;
    const inferred = opts.includeInferred ?? false;
    const seeds = (text: string) => {
      const { chain } = parseAccount(text);
      const all = this.#resolve(text);
      // With a chain, the walk starts on that chain: reaching the same address elsewhere is an
      // inferred hop it has to show. Other chains only start it when that chain has no such account.
      const here = chain === null ? all : all.filter((r) => r.chain === chain);
      const accounts = here.length > 0 || !inferred ? here : all;
      return {
        rows: accounts,
        end: {
          asked: text,
          accounts: accounts.map((r) => accountName(r.chain, r.address)),
          /** null: no stored group holds it, so there is nothing to match */
          match: accounts[0] ? this.#matchOf(chain, accounts[0].chain, accounts.length) : null,
        },
      };
    };
    const { rows: from, end: fromEnd } = seeds(accountA);
    const { rows: to, end: toEnd } = seeds(accountB);
    const base = {
      from: fromEnd,
      to: toEnd,
      max_depth: maxDepth,
      budget,
      walked: inferred ? ('observed and inferred links' as const) : ('observed links' as const),
      does_not_show: NOT_COORDINATION,
    };
    const end = (reason: PathEnd, touched: number, hops: PathHop[], note: string) => ({
      ...base,
      found: reason === 'found' || reason === 'same_account',
      reason,
      /** true: it stopped looking, so a path may exist */
      gave_up: reason === 'budget' || reason === 'depth_limit',
      hops,
      touched,
      note,
    });
    if (from.length === 0 || to.length === 0) {
      return end(
        'unknown_account',
        0,
        [],
        `No stored group holds ${[from.length === 0 ? accountA : null, to.length === 0 ? accountB : null].filter(Boolean).join(' or ')}. ${ABSENCE_IS_NOT_PROOF}`,
      );
    }
    const w = walk(
      this.#db,
      from.map((r) => r.id),
      to.map((r) => r.id),
      { steps: maxDepth * 2, budget, inferred },
    );
    if (w.end === 'budget') {
      return end(
        'budget',
        w.touched,
        [],
        `Gave up after reading ${w.touched} edges. A path may exist: this says nothing either way.`,
      );
    }
    if (w.end === 'depth_limit') {
      return end(
        'depth_limit',
        w.touched,
        [],
        `Nothing within ${maxDepth} shared groups. A longer path may exist.`,
      );
    }
    if (w.end === 'no_path') {
      return end(
        'no_path',
        w.touched,
        [],
        `No path through what is stored, at any depth, walking ${base.walked}. ${ABSENCE_IS_NOT_PROOF}`,
      );
    }
    if (w.vertices.length === 1) {
      return end('same_account', w.touched, [], 'Both names resolve to one account.');
    }
    const hops = this.#hops(w.vertices);
    return end(
      'found',
      w.touched,
      hops,
      `One shortest path, of ${hops.length} hops. A huge group connects nearly anything: read the group sizes.`,
    );
  }

  #accountName(id: number): { name: string; node: number } {
    const r = this.#get<{ chain: string; address: string; node_id: number }>(
      'SELECT a.chain, n.address, a.node_id FROM account a JOIN node n ON n.id = a.node_id WHERE a.id = ?',
      id,
    );
    return { name: accountName(String(r?.chain), String(r?.address)), node: r?.node_id ?? 0 };
  }

  #inGroup(
    observation: number,
    node: number,
  ): { role: 'member'; share: number; rank: number } | { role: 'anchor' } {
    const m = this.#get<{ share: number; rnk: number }>(
      'SELECT share, rnk FROM membership WHERE observation_id = ? AND node_id = ?',
      observation,
      node,
    );
    return m ? { role: 'member', share: round6(m.share), rank: m.rnk } : { role: 'anchor' };
  }

  #hops(vertices: number[]): PathHop[] {
    const hops: PathHop[] = [];
    for (let i = 0; i < vertices.length - 1; i++) {
      const v = vertices[i] as number;
      if (v < 0) continue;
      const next = vertices[i + 1] as number;
      const from = this.#accountName(v);
      if (next > 0) {
        hops.push({
          via: 'same_address',
          from: from.name,
          to: this.#accountName(next).name,
          match: SAME_EVM,
        });
        continue;
      }
      const observation = -next;
      const to = this.#accountName(vertices[i + 2] as number);
      const row = this.#get<ObservationRow>(
        `SELECT ${OBSERVATION_COLUMNS} FROM observation o JOIN grp g ON g.id = o.group_id WHERE o.id = ?`,
        observation,
      ) as ObservationRow;
      hops.push({
        via: 'group',
        from: from.name,
        to: to.name,
        group: facts(row),
        from_in_group: this.#inGroup(observation, from.node),
        to_in_group: this.#inGroup(observation, to.node),
      });
    }
    return hops;
  }
}
