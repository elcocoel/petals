// biome-ignore-all lint/correctness/noUnusedFunctionParameters: stub signatures (T016); delete this line once built
// The renderer (contracts/renderer.md, render/v1). A pure function: no fetch, clock, randomness,
// DOM or locale. W1 owns this.
import { notImplemented } from '../not-implemented.ts';
import type { RenderOptions, RenderResult, Snapshot, Spec } from '../types/index.ts';

export function renderFlower(spec: Spec, s: Snapshot, o?: RenderOptions): RenderResult {
  return notImplemented('renderFlower');
}
