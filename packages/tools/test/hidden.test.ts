// Maps hidden from the Power Map by the curation review: never deleted, each with its reason, and the four the
// review protects stay shown.
import { describe, expect, test } from 'vitest';
import { hiddenCount, hiddenMap, retiredClaim, retiredReading } from '../src/hidden.ts';
import hidden from '../src/hidden-maps.json' with { type: 'json' };
import retired from '../src/retired-readings.json' with { type: 'json' };

describe('maps hidden from the Power Map', () => {
  test('the 64 the review hid and the six retired off-chain cards, each by its address in one form, with its reason and decision', () => {
    expect(hiddenCount()).toBe(70);
    for (const h of hidden.hidden) {
      expect(h.about).toMatch(
        /^(eip155:\d+:0x[0-9a-f]{40}|solana:[A-Za-z0-9]+:[1-9A-HJ-NP-Za-km-z]{32,44}|none:[a-z0-9.-]+)$/,
      );
      expect(h.why.length).toBeGreaterThan(20);
      expect(hiddenMap(h.about)?.decided).toMatch(/, 11 Nov 2026/);
    }
    expect(hiddenMap('eip155:1:0x9c8ff314c9bc7f6e59a9d9225fb22946427edc03')).toMatchObject({
      name: 'Nouns',
      why: expect.stringMatching(/^Hidden until an NFT reader can read it properly/),
      decided: 'Curation review of unverified and partial maps, 11 Nov 2026',
    });
    // a retired card says its own decision
    expect(hiddenMap('none:cow.eth-cip-91-voters')).toMatchObject({
      why: expect.stringMatching(/^Retired: Snapshot ballots/),
      decided: expect.stringMatching(/^Shared map curation, 11 Nov 2026: the 'none' card retired/),
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

  test('the readings mapping runs replaced are retired, never deleted: each names its replacement and what changed', () => {
    expect(retired.retired.length).toBe(149);
    for (const r of retired.retired) {
      expect(r.snapshot).toMatch(/^[0-9a-f]{64}$/);
      expect(r.replaced_by).toMatch(/^[0-9a-f]{64}$/);
      // a replacement is never itself retired: it points to the newest
      expect(retiredReading(r.replaced_by)).toBeNull();
    }
    const first = retired.retired[0] as { snapshot: string; from: string };
    expect(retiredReading(first.snapshot)).toMatchObject({
      from: first.from,
      decided: expect.stringMatching(/^Shared map curation, 11 Nov 2026/),
    });
    expect(retiredReading('0'.repeat(64))).toBeNull();
  });

  test('the House of Stake is one map: every reading on the old key, which names no account, is retired for the reissue on venear.dao', () => {
    const onVenear = '5ab4cb544e395dc7201d281685750d22f5d84087e1e2f50abdcb027048c19258';
    for (const old of [
      'b5750f7be3579f6cd7a361fd8bd71d6cee8a810802f0b15e285617d992e9cfbe',
      '17be4480a8f1584a37f61074b9d0fef62941be8e134904802e1bf51964906fc2',
      'adedba8113fcaf0d476460393da0b3495ea68abc6fd5771a260b11ff14b6bece',
    ])
      expect(retiredReading(old)?.replaced_by).toBe(onVenear);
  });

  test('the claims a mapping run reissued are retired, never deleted: each names its replacement and what changed', () => {
    const all = (retired as { claims: { id: string; replaced_by: string; from: string }[] }).claims;
    const claims = all.filter((c) => c.replaced_by !== '');
    expect(claims.length).toBe(3);
    for (const c of claims) {
      expect(c.id).toMatch(/^[0-9a-f]{64}$/);
      expect(c.replaced_by).toMatch(/^[0-9a-f]{64}$/);
      expect(retiredClaim(c.replaced_by)).toBeNull();
      expect(retiredClaim(c.id)).toMatchObject({
        replaced_by: c.replaced_by,
        decided: expect.stringContaining('12 Nov'),
      });
    }
    expect(retiredClaim('0'.repeat(64))).toBeNull();
  });

  test('claims withheld from publishing are retired with no replacement, and say why', () => {
    const withheld = (
      retired as { claims: { id: string; replaced_by: string; from: string }[] }
    ).claims.filter((c) => c.replaced_by === '');
    expect(withheld.length).toBe(43);
    for (const c of withheld) {
      expect(c.id).toMatch(/^[0-9a-f]{64}$/);
      expect(c.from).toMatch(/^withheld from publishing/);
      expect(retiredClaim(c.id)).not.toBeNull();
    }
  });
});
