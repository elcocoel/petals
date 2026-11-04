// The visual vocabulary and what this build can draw (FR-032; data-model.md, Visual primitive).
// Seeded by W0 from data-model.md; W1 owns it. When a primitive is built, flip its status here
// and describe_snapshot reports it. An unavailable primitive is declared, never imitated:
// validateSpec and renderFlower refuse it.
// `by`: for an available primitive, the values this build draws; for an unavailable one, the
// values planned for it.
import type { PrimitiveId } from './types/index.ts';

export const PRIMITIVES: {
  id: PrimitiveId;
  status: 'available' | 'unavailable';
  by: string[];
  note: string;
}[] = [
  {
    id: 'width',
    status: 'available',
    by: ['share', 'equal'],
    note: 'share of power, compressed into a band (max_ratio 1.5, 2 or 3; default 2), or equal',
  },
  {
    id: 'height',
    status: 'available',
    by: ['share', 'amount', 'm:<metric>', 'equal'],
    note: 'share (sqrt or linear), amount (log), a metric (m:<name>), or equal',
  },
  {
    id: 'segments',
    status: 'available',
    by: ['backers'],
    note: 'backers: who backs a NEAR pool (lockup, liquid staking, 1M+ NEAR, other). time, ops and roles come in Phase B',
  },
  {
    id: 'colour',
    status: 'available',
    by: ['kind', 'identity', 'single'],
    note: 'kind of account, identity (named or anonymous), or a single colour',
  },
  {
    id: 'outline',
    status: 'available',
    by: ['identity_status'],
    note: 'solid for self-declared or verified identity, dashed for inferred, none for unknown',
  },
  {
    id: 'order',
    status: 'available',
    by: ['measure_desc'],
    note: 'measure_desc: largest first, clockwise from the top (default/v1). measure_asc, id, join_date and last_active come in Phase B',
  },
  {
    id: 'lines',
    status: 'unavailable',
    by: ['shared_delegators', 'delegation', 'co_vote'],
    note: 'inner lines; not available yet (Phase B)',
  },
  {
    id: 'markings',
    status: 'unavailable',
    by: ['fusion'],
    note: 'fusion dots for common control with evidence; not available yet (Phase B)',
  },
  {
    id: 'texture',
    status: 'unavailable',
    by: [],
    note: 'declared in the vocabulary, not built. The tail hatch marks grouping; it is not texture',
  },
  { id: 'extrusion', status: 'unavailable', by: [], note: 'declared in the vocabulary, not built' },
  { id: 'opacity', status: 'unavailable', by: [], note: 'declared in the vocabulary, not built' },
];

export function primitive(id: string): (typeof PRIMITIVES)[number] | undefined {
  return PRIMITIVES.find((p) => p.id === id);
}

/** Can this build draw `primitive` driven by `by`? `m:<name>` matches the `m:<metric>` entry. */
export function drawable(id: string, by: string): boolean {
  const p = primitive(id);
  if (p?.status !== 'available') return false;
  return p.by.includes(by) || (by.startsWith('m:') && by.length > 2 && p.by.includes('m:<metric>'));
}
