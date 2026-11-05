// @petal/core (W1): schemas, types, canonical hash, validation, counting, conventions, renderer.
// No network, no disk (Biome refuses node: imports under src/). Signatures: contracts/packages.md.
export { buildSpec, DEFAULT_CONVENTION } from './convention/index.ts';
export { BadInputError, InvalidSpecError } from './errors.ts';
export { compareFigures, computeFigures } from './figures/index.ts';
export { canonicalJson, entryId, sha256Hex, specHash } from './hash.ts';
export { NotImplementedError, notImplemented } from './not-implemented.ts';
export { PRIMITIVES } from './primitives.ts';
export { readFlower, readingHash } from './reading/index.ts';
export { renderFlower, SKINS } from './render/index.ts';
export { schemas } from './schema/index.ts';
export { backerSegments } from './segments/backers.ts';
export { selectPetals } from './select.ts';
export type * from './types/index.ts';
export { validateSnapshot, validateSpec } from './validate/index.ts';
export * from './versions.ts';
