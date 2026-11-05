// Hand-made snapshots with made-up accounts, and a source that serves them.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJson, sha256Hex } from '@petal/core';
import type { Snapshot } from '@petal/core/types';
import type { SnapshotSource } from '../src/index.ts';

export const evm = (n: number | string): string => `0x${String(n).padStart(40, 'a')}`;

export interface SnapOptions {
  id?: string;
  chain?: string;
  population?: string;
  title?: string;
  params?: Record<string, string>;
  as_of?: string;
  block_height?: number;
  measure?: string;
  unit?: string;
  /** [address, amount] */
  holders?: [string, string][];
  /** rows that fold many accounts into one, which is no account */
  folded?: { id: string; count: number; amount?: string }[];
  participantsTotal?: number;
  amountTotal?: string;
  partial?: boolean;
  /** coverage names this measure instead of the holders' measure */
  coverageMeasure?: string;
  identities?: Record<string, { name: string; source: string; status: string }>;
  /** extra holdings under other measures */
  otherHoldings?: { participant: string; measure: string; unit: string; amount: string }[];
  delegations?: { from: string; to: string; amount?: string }[];
}

export function snap(o: SnapOptions = {}): Snapshot {
  const as_of = o.as_of ?? '2026-01-01T00:00:00Z';
  const measure = o.measure ?? 'token_balance';
  const unit = o.unit ?? 'T';
  const holders = o.holders ?? [];
  const folded = o.folded ?? [];
  const sum = [...holders.map(([, a]) => a), ...folded.map((f) => f.amount ?? '0')].reduce(
    (t, a) => t + BigInt(a.split('.')[0] ?? '0'),
    0n,
  );
  const hasRows = holders.length + folded.length > 0;
  const named = new Set([
    ...holders.map(([a]) => a),
    ...(o.delegations ?? []).flatMap((d) => [d.from, d.to]),
    ...(o.otherHoldings ?? []).map((h) => h.participant),
  ]);
  return {
    petal: 'snapshot/v1',
    network: {
      id: o.id ?? 'test-module',
      chain: o.chain ?? 'eip155:1',
      population: o.population ?? 'test-population',
      title: o.title ?? 'A test group',
      ...(o.params ? { params: o.params } : {}),
    },
    snapshot: {
      as_of,
      final: true,
      ...(o.block_height !== undefined ? { block_height: o.block_height } : {}),
    },
    coverage: {
      participants_total:
        o.participantsTotal ?? holders.length + folded.reduce((n, f) => n + f.count, 0),
      participants_included: holders.length,
      amount_total: o.amountTotal ?? String(sum),
      amount_included: String(sum),
      unit,
      measure: o.coverageMeasure ?? measure,
      ...(o.partial ? { partial: true } : {}),
    },
    sources: [{ id: 's', kind: 'chain', url: 'https://example.test', fetched_at: as_of }],
    participants: [
      ...[...named].map((id) => ({
        id,
        label: id,
        kind: 'unknown',
        identity: o.identities?.[id] ?? null,
        source: 's',
      })),
      ...folded.map((f) => ({
        id: f.id,
        label: f.id,
        kind: 'group',
        identity: null,
        count: f.count,
        source: 's',
      })),
    ],
    holdings: hasRows
      ? [
          ...holders.map(([participant, amount]) => ({
            participant,
            asset: 'T',
            measure,
            amount,
            unit,
            as_of,
            source: 's',
          })),
          ...folded
            .filter((f) => f.amount !== undefined)
            .map((f) => ({
              participant: f.id,
              asset: 'T',
              measure,
              amount: f.amount as string,
              unit,
              as_of,
              source: 's',
            })),
          ...(o.otherHoldings ?? []).map((h) => ({ ...h, asset: 'T', as_of, source: 's' })),
        ]
      : (o.otherHoldings ?? []).map((h) => ({ ...h, asset: 'T', as_of, source: 's' })),
    relationships: (o.delegations ?? []).map((d) => ({
      from: d.from,
      to: d.to,
      type: 'delegates_to',
      ...(d.amount !== undefined ? { amount: d.amount } : {}),
      unit,
      as_of,
      source: 's',
    })),
    events: [],
    module: { id: o.id ?? 'test-module', version: 'test/1' },
  } as unknown as Snapshot;
}

export const shaOf = (s: Snapshot): string => sha256Hex(canonicalJson(s));

export interface MemorySource extends SnapshotSource {
  add(s: Snapshot): string;
  remove(s: Snapshot): void;
  list_only(sha256: string): void;
  drop_file(sha256: string): void;
}

/** A store in memory: `add` is what storing a new snapshot does. */
export function source(...snapshots: Snapshot[]): MemorySource {
  const held = new Map(snapshots.map((s) => [shaOf(s), s]));
  const listed = new Set(held.keys());
  return {
    async list() {
      return [...listed].map((sha256) => ({ sha256 }));
    },
    async get(sha256: string) {
      return held.get(sha256) ?? null;
    },
    add(s: Snapshot): string {
      const sha = shaOf(s);
      held.set(sha, s);
      listed.add(sha);
      return sha;
    },
    remove(s: Snapshot) {
      listed.delete(shaOf(s));
    },
    /** listed, with no file behind it */
    list_only(sha256: string) {
      listed.add(sha256);
    },
    drop_file(sha256: string) {
      held.delete(sha256);
    },
  };
}

export const tmpDir = (): string => mkdtempSync(join(tmpdir(), 'petal-relations-'));
export const tmpIndexPath = (): string => join(tmpDir(), 'index.db');
