// Points for mapping (wave 8; Elco, 8 Nov, specs/004-workspace: "I had a vision of incentivizing mapping via
// 'points' that could one day move us towards a TGE -> users pay for extra features, part of revenue goes to
// a DAO, part of revenue rewards work, part of revenue goes to Devs"; data.md: "credit or points for layers
// others build on"). The page shows the person's credit record as SYSTEMS keeps it (credit/v1): the points,
// the layers behind them and who built on or reused each, counted once per other account. No token and no
// money now: the record is shaped so a later split can read it. Pure: words and arithmetic; the widget lays
// them out. LOBBY's drafts.
import { dateLabel } from './flower-view.ts';
import { subjectOf } from './profile-view.ts';

/** One layer in the record (GET /api/v1/me/credit, SYSTEMS's credit/v1). */
export interface CreditLayer {
  layer: string;
  about: string;
  title?: string | null;
  published_at?: string | null;
  built_on_by: number;
  reused_by: number;
  points: number;
}

/** The person's credit record, as SYSTEMS keeps it. */
export interface CreditRecord {
  petal: string;
  rule: string;
  as_of: string;
  points: number;
  layers: CreditLayer[];
  hash: string;
}

export const pointsWords = {
  title: 'Points',
  /** Under the number: what a point is. */
  rule: 'A point for each other account that built on or reused one of your layers, each counted once.',
  none: 'No points yet. When other people build on or reuse a layer you mapped, it counts here.',
  builtOn: (n: number) => (n === 1 ? 'built on by 1' : `built on by ${n}`),
  reused: (n: number) => (n === 1 ? 'reused by 1' : `reused by ${n}`),
  points: (n: number) => (n === 1 ? '1 point' : `${n} points`),
  /** What the record is for, said once. */
  future: 'Kept for a future share of what Petals earns; no token and no money now.',
  publish: 'Publish to NEAR Social',
  publishing: 'Waiting for your wallet…',
  checking: 'Checking NEAR Social has it…',
  publishNote: 'Puts this record on NEAR Social under your account, where anyone can read it.',
  published: 'Published',
  publishedLine: 'On NEAR Social now, under your account.',
  reading: 'Reading…',
  unread: 'Your points can’t be read right now.',
} as const;

/** A layer as the widget lists it. */
export interface PointsRow {
  key: string;
  about: { shown: string; full: string; chain: string };
  title: string | null;
  when: string | null;
  /** "built on by 3 · reused by 2" */
  how: string;
  points: string;
}

export interface PointsView {
  total: number;
  rows: PointsRow[];
}

export function pointsView(record: CreditRecord): PointsView {
  return {
    total: record.points,
    rows: [...record.layers]
      .sort((a, b) => b.points - a.points)
      .map((l) => ({
        key: l.layer,
        about: subjectOf(l.about),
        title: l.title ?? null,
        when: l.published_at ? dateLabel(l.published_at) : null,
        how: [pointsWords.builtOn(l.built_on_by), pointsWords.reused(l.reused_by)].join('  ·  '),
        points: pointsWords.points(l.points),
      })),
  };
}

/** The NEAR Social key the record goes under, in the person's own account. */
export const CREDIT_KEY = 'petals/credit';

/**
 * What goes on NEAR Social: the record's summary, enough to read the points and check them against
 * Petals' record by its hash; written by the person's own wallet.
 */
export function creditSummary(record: CreditRecord, site: string) {
  return {
    petal: record.petal,
    rule: record.rule,
    as_of: record.as_of,
    points: record.points,
    layers: record.layers.map((l) => ({ layer: l.layer, about: l.about, points: l.points })),
    hash: record.hash,
    site,
  };
}

/** Where publishing the record is. */
export type PointsPublish =
  | { kind: 'ready' }
  | { kind: 'signing' }
  | { kind: 'checking' }
  | { kind: 'published' }
  | { kind: 'failed'; why: string };
