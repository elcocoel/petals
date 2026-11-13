// Points for mapping (wave 8; Elco, 8 Nov, specs/004-workspace: "I had a vision of incentivizing mapping via
// 'points' that could one day move us towards a TGE -> users pay for extra features, part of revenue goes to
// a DAO, part of revenue rewards work, part of revenue goes to Devs"; data.md: "credit or points for layers
// others build on"). The page shows the person's credit record as SYSTEMS keeps it (credit/v1): the points,
// the layers behind them and who built on or reused each, counted once per other account. No token and no
// money now: the record is shaped so a later split can read it. Pure: words and arithmetic; the widget lays
// them out. LOBBY's drafts.
import { dateLabel } from './flower-view.ts';
import { subjectOf } from './profile-view.ts';

/**
 * One layer in the record (GET /api/v1/me/credit, SYSTEMS's credit/v1, composition.md section 7): its hash,
 * format and map, when its author first published it, and the other authors who built on it (whose
 * published layers name it in `from`, the whole chain back) or reused it (whose published versions include
 * it); each other account counts once per layer.
 */
export interface CreditLayer {
  sha256: string;
  petal?: string;
  /** The map it's about, `chain:address`. */
  map: string;
  title?: string | null;
  published_at?: string | null;
  built_on_by: readonly string[];
  reused_by: readonly string[];
  /** The layer's points under points/v1, when the record carries them per layer. */
  points?: number;
}

/** The person's credit record, as SYSTEMS keeps it (credit/v1). */
export interface CreditRecord {
  petal: string;
  author: string;
  layers: CreditLayer[];
  totals: { points: number; layers?: number; accounts?: number };
  composed_from?: { publications?: readonly string[]; rule?: string };
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
  /** "4 points"; null when the record doesn't give the layer's own. */
  points: string | null;
}

export interface PointsView {
  total: number;
  rows: PointsRow[];
}

/** A layer's points as the record gives them (points/v1 is the server's: only it applies the published-before rule). */
const layerPoints = (l: CreditLayer) => l.points ?? 0;

export function pointsView(record: CreditRecord): PointsView {
  return {
    total: record.totals.points,
    rows: [...record.layers]
      .sort((a, b) => layerPoints(b) - layerPoints(a))
      .map((l) => ({
        key: l.sha256,
        about: subjectOf(l.map),
        title: l.title ?? null,
        when: l.published_at ? dateLabel(l.published_at) : null,
        how: [
          pointsWords.builtOn(new Set(l.built_on_by).size),
          pointsWords.reused(new Set(l.reused_by).size),
        ].join('  ·  '),
        points: l.points === undefined ? null : pointsWords.points(l.points),
      })),
  };
}

/** The NEAR Social key the record goes under, in the person's own account. */
export const CREDIT_KEY = 'petals/credit';

/**
 * What goes on NEAR Social under the person's account (composition.md section 9): the record's hash, its
 * points and the site that keeps it, so anyone can recompute the record there and compare; written by the
 * person's own wallet.
 */
export const creditSummary = (record: CreditRecord, site: string) => ({
  hash: record.hash,
  points: record.totals.points,
  site,
});

/** Where publishing the record is. */
export type PointsPublish =
  | { kind: 'ready' }
  | { kind: 'signing' }
  | { kind: 'checking' }
  | { kind: 'published' }
  | { kind: 'failed'; why: string };
