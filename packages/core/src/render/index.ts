// The renderer (contracts/renderer.md, render/v1). A pure function: no fetch, clock, randomness,
// DOM or locale. Same spec and snapshot give the same SVG bytes (FR-010, SC-005). Three steps:
// validate, read (reading/), and draw with a named skin.

import { BadInputError, InvalidSpecError } from '../errors.ts';
import { sha256Hex } from '../hash.ts';
import { PRIMITIVES } from '../primitives.ts';
import { readFlower } from '../reading/index.ts';
import { hasBackers } from '../segments/backers.ts';
import { holdingMeasures } from '../tables.ts';
import type {
  Capabilities,
  RenderOptions,
  RenderResult,
  Snapshot,
  Spec,
  SpecPrimitive,
} from '../types/index.ts';
import { validateSpec } from '../validate/spec.ts';
import { skinV1 } from './skin-v1.ts';
import type { Skin } from './types.ts';

/** The looks this build can draw, by name. A look that changes the bytes gets a new name. */
export const SKINS = { 'render/v1': skinV1 } satisfies Record<string, Skin>;

/**
 * What a snapshot alone can show: the capabilities renderFlower validates against when no module
 * descriptor is at hand. Permissive: every `by` this build draws, backers when delegations exist.
 * The tools validate against the descriptor's (stricter) capabilities before they render.
 */
export function snapshotCapabilities(s: Snapshot): Capabilities {
  const by: Capabilities['by'] = {};
  for (const p of PRIMITIVES) if (p.status === 'available') by[p.id as SpecPrimitive] = [...p.by];
  return {
    measures: holdingMeasures(s).map((m) => ({ id: m.id, unit: m.unit, label: m.id })),
    by,
    segments: hasBackers(s) ? ['backers'] : [],
    relationships: [...new Set(s.relationships.map((r) => r.type))].sort(),
    defaults: {},
    meanings: {},
  };
}

export function renderFlower(spec: Spec, s: Snapshot, o?: RenderOptions): RenderResult {
  const size = o?.size ?? 800;
  const thumb = o?.thumb ?? false;
  if (!Number.isInteger(size) || size < 32 || size > 8192)
    throw new BadInputError('size is a whole number of pixels from 32 to 8192', {
      hint: `got ${String(size)}`,
    });
  const check = validateSpec(spec, { snapshot: s, capabilities: snapshotCapabilities(s) });
  if (!check.valid) throw new InvalidSpecError(check.errors);

  const drawn = SKINS['render/v1'](readFlower(spec, s, o?.view), { size, thumb });
  return { ...drawn, render_sha256: sha256Hex(drawn.svg) };
}
