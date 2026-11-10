// NEAR Social's writes (Elco, 10 Nov): the picture's borsh payload, byte for byte as the standard's own
// Python writes it (research/spikes/near-social-2026-11-09/skill.md, section 4).
import { describe, expect, test } from 'vitest';
import { base64Of, FASTFS_SIMPLE_MAX, fastfsSimple } from '../lib/near-social.ts';

describe('fastfsSimple', () => {
  test('a Simple payload: 0, the path, Some, the mime type, the content, each sized as a u32', () => {
    const p = fastfsSimple('media/ab.png', 'image/png', Uint8Array.of(9, 8, 7));
    expect(Array.from(p)).toEqual([
      0,
      12,
      0,
      0,
      0,
      ...new TextEncoder().encode('media/ab.png'),
      1,
      9,
      0,
      0,
      0,
      ...new TextEncoder().encode('image/png'),
      3,
      0,
      0,
      0,
      9,
      8,
      7,
    ]);
  });

  test('a file over 1 MiB is refused, since it takes several calls', () => {
    expect(() =>
      fastfsSimple('media/x.png', 'image/png', new Uint8Array(FASTFS_SIMPLE_MAX + 1)),
    ).toThrow();
  });

  test('base64 as the RPC shows a call’s args', () => {
    expect(base64Of(Uint8Array.of(0, 1, 2, 250))).toBe('AAEC+g==');
  });
});
