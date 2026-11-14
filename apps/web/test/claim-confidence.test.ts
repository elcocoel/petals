// Tools' Confidence slider: a claim scores by the confidence the map's claims give it (0 to 1); an unscored one
// scores 0, and the slider shows the claims at or above its value.
import type { Claim } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { atConfidence, claimScore } from '../lib/map-claims.ts';

const claim = (id: string, confidence?: number | null): Claim => {
  const c = { id, subject: 'near:mainnet:a.near', verb: 'named', object: 'A', by: 'x', confidence };
  return c as unknown as Claim;
};

const high = claim('h', 0.9);
const mid = claim('m', 0.4);
const none = claim('n', null);
const all = [high, mid, none];

describe('a claim scored by its confidence', () => {
  test('its confidence, or 0 when unscored', () => {
    expect(claimScore(high)).toBe(0.9);
    expect(claimScore(none)).toBe(0);
  });
  test('at 0 every claim shows; above it, only those scoring at least that', () => {
    expect(atConfidence(all, 0)).toHaveLength(3);
    expect(atConfidence(all, 0.5).map((c) => c.id)).toEqual(['h']);
    expect(atConfidence(all, 0.4).map((c) => c.id)).toEqual(['h', 'm']);
  });
});
