// biome-ignore-all lint/correctness/noUnusedFunctionParameters: stub signatures (T016); delete this line once built
// Validation (data-model.md, Petal spec rules 1-8; FR-026). W1 owns this.
// The Ajv setup to build on is ./schema/ajv.ts (createAjv, schemaId).
import { notImplemented } from './not-implemented.ts';
import type { Capabilities, Interpretation, Result, Snapshot, Validation } from './types/index.ts';

export function validateSnapshot(x: unknown): Result<Snapshot> {
  return notImplemented('validateSnapshot');
}

export function validateSpec(
  spec: unknown,
  ctx: { snapshot: Snapshot; capabilities: Capabilities; interpretation?: Interpretation },
): Validation {
  return notImplemented('validateSpec');
}
