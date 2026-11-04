// @petal/core (W1): schemas, types, canonical hash, validation, counting, conventions, renderer.
// No network, no disk (Biome refuses node: imports under src/). Signatures: contracts/packages.md.
export { buildSpec, DEFAULT_CONVENTION } from './convention.ts';
export { backerSegments, compareFigures, computeFigures, selectPetals } from './figures.ts';
export { canonicalJson, entryId, sha256Hex, specHash } from './hash.ts';
export { NotImplementedError, notImplemented } from './not-implemented.ts';
export { PRIMITIVES } from './primitives.ts';
export { renderFlower } from './render/index.ts';
export { schemas } from './schema/index.ts';
export type * from './types/index.ts';
export { validateSnapshot, validateSpec } from './validate.ts';
export * from './versions.ts';
