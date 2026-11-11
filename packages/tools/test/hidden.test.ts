// Maps hidden from the Power Map (board #96; Elco approved DAO SET's review, 11 Nov): never deleted, each with
// its reason, and the four the review protects stay shown.
import { describe, expect, test } from 'vitest';
import { hiddenCount, hiddenMap } from '../src/hidden.ts';
import hidden from '../src/hidden-maps.json' with { type: 'json' };

describe('maps hidden from the Power Map', () => {
  test('the 64 Elco approved, each by its address in one form, with its reason and who decided', () => {
    expect(hiddenCount()).toBe(64);
    for (const h of hidden.hidden) {
      expect(h.about).toMatch(
        /^(eip155:\d+:0x[0-9a-f]{40}|solana:[A-Za-z0-9]+:[1-9A-HJ-NP-Za-km-z]{32,44})$/,
      );
      expect(h.why.length).toBeGreaterThan(20);
    }
    expect(hiddenMap('eip155:1:0x9c8ff314c9bc7f6e59a9d9225fb22946427edc03')).toMatchObject({
      name: 'Nouns',
      why: expect.stringMatching(/^Hidden until an NFT reader can read it properly/),
      decided: expect.stringContaining('#96'),
    });
  });

  test('the review protects Kokonut, Smart Invoice, RG Season VI and Arcadia: they stay shown, as does any other map', () => {
    for (const a of [
      '0xc6b075ac3234a7ac729114b27370b552fa284690',
      '0xbbf3d189075f74d5862eaf6db8820637d62ef564',
      '0xe74c2701c878b34fc4f5d0cfac20eff022f328a7',
      '0x5a2696b7ad5eb8411f539b4e59335725f39ceceb',
    ])
      expect(hiddenMap(`eip155:100:${a}`)).toBeNull();
    expect(hiddenMap('eip155:100:0x372fc5a6b0b12ae174f09f6fc849a83de6b503b6')).toBeNull();
  });
});
