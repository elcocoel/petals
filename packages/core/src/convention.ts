// biome-ignore-all lint/correctness/noUnusedFunctionParameters: stub signatures (T016); delete this line once built
// Conventions (data-model.md, Convention). default/v1 is the sketch's defaults. W1 owns this.
import { notImplemented } from './not-implemented.ts';
import type { Convention, NetworkDescriptor, ProposeInput, Snapshot, Spec } from './types/index.ts';

/** default/v1: width = share in a 2x band, height = sqrt share, colour = kind, outline = identity
 * status, segments none unless the population declares a default, order = largest first,
 * clockwise from the top, 60 petals plus a grouped tail. Meanings here are the fallback; a
 * module descriptor's `capabilities.meanings` take precedence. */
export const DEFAULT_CONVENTION: Convention = {
  id: 'default/v1',
  petals: 60,
  tail: { group: true, label: 'everyone else' },
  encodings: {
    width: {
      by: 'share',
      scale: 'log',
      max_ratio: 2,
      meaning: 'share of the measure, in a 2x band',
    },
    height: { by: 'share', scale: 'sqrt', meaning: 'square root of share of the measure' },
    colour: { by: 'kind', meaning: 'kind of account' },
    outline: {
      by: 'identity_status',
      meaning: 'identity: solid when self-declared or verified, dashed when inferred',
    },
    segments: null,
    lines: null,
    markings: null,
    order: { by: 'measure_desc', meaning: 'largest first, clockwise from the top' },
  },
};

/** propose_spec's core: fill every default and standard meaning, so the same choices give the
 * same spec bytes. */
export function buildSpec(
  input: ProposeInput,
  descriptor: NetworkDescriptor,
  snapshot: Snapshot,
): { spec: Spec; changed: string[]; defaults: string[] } {
  return notImplemented('buildSpec');
}
