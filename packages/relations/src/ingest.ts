// Writing the index: one path for a full rebuild and for one new snapshot, so the two can't give
// different answers. loadSnapshot adds rows; settle derives adjacency, which observation is latest,
// and group_overlap for what changed.
import { hash } from 'node:crypto';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { Snapshot } from '@petal/core/types';
import { isEvm, type ProjectedGroup, scopeOf } from './project.ts';

/** A positive id from a key, small enough for SQLite's 6-byte integer. */
function hashId(key: string): number {
  return (hash('sha256', key, 'buffer').readUIntBE(0, 6) % 2 ** 47) + 1;
}

export interface LoadReport {
  groups: number;
  memberships: number;
}

/** Sets of ids, as temp tables so the derived rows can be made in one sorted statement each. */
const WORK_TABLES = `
CREATE TEMP TABLE IF NOT EXISTS new_obs (id INTEGER PRIMARY KEY);
CREATE TEMP TABLE IF NOT EXISTS new_account (id INTEGER PRIMARY KEY);
CREATE TEMP TABLE IF NOT EXISTS dirty_obs (id INTEGER PRIMARY KEY);
`;

export class Ingest {
  readonly #db: DatabaseSync;
  /** A full load starts from nothing, so the maps below know every id without asking the file. */
  readonly #fresh: boolean;
  readonly #nodes = new Map<string, number>();
  readonly #accounts = new Map<string, number>();
  readonly #statements = new Map<string, StatementSync>();

  constructor(db: DatabaseSync, fresh: boolean) {
    this.#db = db;
    this.#fresh = fresh;
    db.exec(WORK_TABLES);
  }

  #st(sql: string): StatementSync {
    let s = this.#statements.get(sql);
    if (!s) {
      s = this.#db.prepare(sql);
      this.#statements.set(sql, s);
    }
    return s;
  }

  /** Mint an id for `key`; on the rare collision the next free id, known by a refused insert. */
  #mint(key: string, insert: (id: number) => boolean): number {
    let id = hashId(key);
    while (!insert(id)) id++;
    return id;
  }

  #nodeId(scope: string, address: string): number {
    const key = `${scope}|${address}`;
    let id = this.#nodes.get(key);
    if (id !== undefined) return id;
    const found = this.#fresh
      ? undefined
      : (this.#st('SELECT id FROM node WHERE address = ? AND scope = ?').get(address, scope) as
          | { id: number }
          | undefined);
    id =
      found?.id ??
      this.#mint(
        key,
        (candidate) =>
          this.#st('INSERT OR IGNORE INTO node (id, scope, address) VALUES (?, ?, ?)').run(
            candidate,
            scope,
            address,
          ).changes === 1,
      );
    this.#nodes.set(key, id);
    return id;
  }

  #accountId(chain: string, nodeId: number, address: string): number {
    const key = `${chain}|${address}`;
    let id = this.#accounts.get(key);
    if (id !== undefined) return id;
    const found = this.#fresh
      ? undefined
      : (this.#st('SELECT id FROM account WHERE node_id = ? AND chain = ?').get(nodeId, chain) as
          | { id: number }
          | undefined);
    id = found?.id;
    if (id === undefined) {
      id = this.#mint(
        key,
        (candidate) =>
          this.#st('INSERT OR IGNORE INTO account (id, node_id, chain) VALUES (?, ?, ?)').run(
            candidate,
            nodeId,
            chain,
          ).changes === 1,
      );
      // A full load finds every EVM account at once in settle(); here it costs one insert each.
      if (!this.#fresh && isEvm(chain)) {
        this.#st('INSERT OR IGNORE INTO new_account (id) VALUES (?)').run(id);
      }
    }
    this.#accounts.set(key, id);
    return id;
  }

  /** Rows for one snapshot. Nothing derived yet: settle() does that. */
  loadSnapshot(sha256: string, s: Snapshot, groups: ProjectedGroup[]): LoadReport {
    const asOfS = Math.floor(Date.parse(s.snapshot.as_of) / 1000);
    this.#st('INSERT INTO snapshot (sha256, network, title, as_of) VALUES (?, ?, ?, ?)').run(
      sha256,
      s.network.id,
      s.network.title,
      s.snapshot.as_of,
    );
    let memberships = 0;
    for (const g of groups) {
      const groupId = this.#groupId(g.key, g);
      const observationId = this.#observationId(`${g.key}@${sha256}`, groupId, sha256, s, asOfS, g);
      this.#st('INSERT OR IGNORE INTO new_obs (id) VALUES (?)').run(observationId);

      const scope = scopeOf(g.chain);
      const rows = g.members.map((m) => {
        const node = this.#nodeId(scope, m.address);
        return { m, node, account: this.#accountId(g.chain, node, m.address) };
      });
      // Primary-key order, so the B-tree grows at its end and not in the middle.
      rows.sort((x, y) => x.node - y.node);
      const insert = this.#st(
        'INSERT INTO membership (observation_id, node_id, account_id, amount, share, rnk, kind, identity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const { m, node, account } of rows) {
        insert.run(
          observationId,
          node,
          account,
          m.amount,
          m.share,
          m.rank,
          m.kind,
          m.identity ? JSON.stringify(m.identity) : null,
        );
      }
      memberships += rows.length;
    }
    return { groups: groups.length, memberships };
  }

  #groupId(key: string, g: ProjectedGroup): number {
    const found = this.#st('SELECT id FROM grp WHERE key = ?').get(key) as
      | { id: number }
      | undefined;
    if (found) return found.id;
    return this.#mint(
      key,
      (candidate) =>
        this.#st(
          'INSERT OR IGNORE INTO grp (id, key, module, chain, kind, measure, unit, title) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ).run(candidate, key, g.module, g.chain, g.kind, g.measure, g.unit, g.title).changes === 1,
    );
  }

  #observationId(
    key: string,
    groupId: number,
    sha256: string,
    s: Snapshot,
    asOfS: number,
    g: ProjectedGroup,
  ): number {
    const c = g.coverage;
    const anchor = g.anchor
      ? this.#accountId(g.chain, this.#nodeId(scopeOf(g.chain), g.anchor), g.anchor)
      : null;
    return this.#mint(
      key,
      (candidate) =>
        this.#st(
          `INSERT OR IGNORE INTO observation (id, group_id, snapshot_sha256, as_of, as_of_s, block_height, final,
            anchor_account, members_named, members_total, tail_accounts, amount_total, amount_named, named_share,
            read_window, complete, why_partial)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          candidate,
          groupId,
          sha256,
          s.snapshot.as_of,
          asOfS,
          s.snapshot.block_height ?? null,
          s.snapshot.final ? 1 : 0,
          anchor,
          c.members_named,
          c.members_total,
          c.tail_accounts,
          c.amount_total,
          c.amount_named,
          c.named_share,
          c.window,
          c.complete ? 1 : 0,
          JSON.stringify(c.why_partial),
        ).changes === 1,
    );
  }

  /** Everything derived from the rows loaded since the last settle. */
  settle(): void {
    const db = this.#db;
    if (this.#fresh) {
      db.exec(
        `INSERT OR IGNORE INTO new_account (id) SELECT id FROM account WHERE chain LIKE 'eip155:%'`,
      );
    }
    db.exec(`
      INSERT OR IGNORE INTO adj (src, dst, inferred)
        SELECT account_id, -observation_id, 0 FROM membership
          WHERE observation_id IN (SELECT id FROM new_obs)
        UNION ALL SELECT -observation_id, account_id, 0 FROM membership
          WHERE observation_id IN (SELECT id FROM new_obs)
        UNION ALL SELECT anchor_account, -id, 0 FROM observation
          WHERE anchor_account IS NOT NULL AND id IN (SELECT id FROM new_obs)
        UNION ALL SELECT -id, anchor_account, 0 FROM observation
          WHERE anchor_account IS NOT NULL AND id IN (SELECT id FROM new_obs)
        ORDER BY 1, 2;
      INSERT OR IGNORE INTO adj (src, dst, inferred)
        SELECT a.id, b.id, 1 FROM new_account n
          JOIN account a ON a.id = n.id
          JOIN account b ON b.node_id = a.node_id AND b.id <> a.id
        UNION ALL SELECT b.id, a.id, 1 FROM new_account n
          JOIN account a ON a.id = n.id
          JOIN account b ON b.node_id = a.node_id AND b.id <> a.id
        ORDER BY 1, 2;
      UPDATE observation SET latest = (id = (
          SELECT o.id FROM observation o WHERE o.group_id = observation.group_id
          ORDER BY o.as_of_s DESC, o.snapshot_sha256 DESC LIMIT 1))
        WHERE group_id IN (SELECT group_id FROM observation WHERE id IN (SELECT id FROM new_obs));
      INSERT OR IGNORE INTO dirty_obs (id)
        SELECT id FROM observation WHERE latest = 1 AND id IN (SELECT id FROM new_obs);
      DELETE FROM group_overlap WHERE (a, b) IN (
        SELECT b, a FROM group_overlap WHERE a IN (
          SELECT group_id FROM observation WHERE id IN (SELECT id FROM dirty_obs)));
      DELETE FROM group_overlap WHERE a IN (
        SELECT group_id FROM observation WHERE id IN (SELECT id FROM dirty_obs));
    `);

    // One changed observation against every other latest one. Filtered after grouping, because
    // the join only rarely lands on an old observation and checking each row would cost more.
    const overlapOf = db.prepare(`
      INSERT INTO group_overlap (a, b, a_obs, b_obs, shared, weight, share_a, share_b, inferred)
      SELECT ox.group_id, oy.group_id, ox.id, oy.id, t.shared, t.weight, t.share_a, t.share_b,
             gx.chain <> gy.chain
      FROM (
        SELECT y.observation_id AS obs, count(*) AS shared,
               sum(min(x.share, y.share)) AS weight, sum(x.share) AS share_a, sum(y.share) AS share_b
        FROM membership x
        JOIN membership y ON y.node_id = x.node_id
        WHERE x.observation_id = ?1
        GROUP BY y.observation_id
      ) t
      JOIN observation oy ON oy.id = t.obs AND oy.latest = 1
      JOIN observation ox ON ox.id = ?1
      JOIN grp gx ON gx.id = ox.group_id
      JOIN grp gy ON gy.id = oy.group_id
      LEFT JOIN dirty_obs d ON d.id = oy.id
      WHERE oy.group_id <> ox.group_id AND (d.id IS NULL OR oy.id > ?1)
    `);
    const dirty = db.prepare('SELECT id FROM dirty_obs').all() as { id: number }[];
    for (const { id } of dirty) overlapOf.run(id);
    db.exec(`
      INSERT INTO group_overlap (a, b, a_obs, b_obs, shared, weight, share_a, share_b, inferred)
        SELECT b, a, b_obs, a_obs, shared, weight, share_b, share_a, inferred FROM group_overlap
        WHERE a_obs IN (SELECT id FROM dirty_obs);
      DELETE FROM new_obs;
      DELETE FROM new_account;
      DELETE FROM dirty_obs;
    `);
  }
}
