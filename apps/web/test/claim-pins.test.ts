// Claims as pins on the map (landscape/pins.ts): a drop on what each claim is about, grouped when near each other on
// the screen, opening what's said there with who said it first.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Claim } from '@petal/core/types';
import { expect, test } from 'vitest';
import {
  bare,
  dropPath,
  groupPins,
  PIN,
  PIN_GROUP,
  PINS_FROM,
  type PinAnchor,
  pinKey,
} from '../landscape/pins.ts';
import { WORTH_AT } from '../landscape/scene.ts';
import { claimerOf, PETALS_ACCOUNT } from '../viewmodels/useClaimers.ts';

const text = (f: string) => readFileSync(join(import.meta.dirname, '..', f), 'utf8');

const claim = (id: string) => ({ id }) as Claim;
const anchor = (key: string, x: number, y: number, n = 1): PinAnchor => ({
  key,
  map: 'm',
  subject: key,
  x,
  y,
  claims: Array.from({ length: n }, (_, i) => claim(`${key}${i}`)),
});

test('pins near each other on the screen group into one, with every claim counted; far ones stand alone', () => {
  const groups = groupPins([
    anchor('a', 100, 100, 2),
    anchor('b', 100 + PIN_GROUP - 1, 100),
    anchor('c', 100 + PIN_GROUP * 3, 100),
  ]);
  expect(groups).toHaveLength(2);
  expect(groups[0]?.anchors.map((a) => a.key)).toEqual(['a', 'b']);
  expect(groups[0]?.count).toBe(3);
  expect(groups[0]).toMatchObject({ x: 100, y: 100 });
  expect(groups[1]?.count).toBe(1);
});

test("a pin is a drop whose point is on what it's about; pins show from the size names gain their treasury", () => {
  expect(dropPath(10, 50)).toMatch(/^M10 50V41A9 9 0 0 1 19 32/);
  expect(dropPath(10, 50).endsWith('Z')).toBe(true);
  expect(PIN).toBeGreaterThan(0);
  expect(PINS_FROM).toBe(WORTH_AT.fadeIn[0]);
  expect(pinKey('m', 's')).not.toBe(pinKey('ms', ''));
});

test('a claim finds its petal by the address without its namespace', () => {
  expect(bare('eip155:100:0xAbC')).toBe('0xabc');
  expect(bare('0xabc')).toBe('0xabc');
  expect(bare('near:mainnet:alice.near')).toBe('alice.near');
});

test("who said a claim: a person's NEAR account, or Petals' own for its mapping", () => {
  expect(claimerOf({ by: 'near:mainnet:alice.near' })).toBe('alice.near');
  expect(claimerOf({ by: 'tool:gnosis-wave-direct@1' })).toBe(PETALS_ACCOUNT);
  expect(claimerOf({ by: 'model:glm@unreported' })).toBe(PETALS_ACCOUNT);
});

test('a press on a pin comes first, any other press closes an open one; Escape closes it first', () => {
  const land = text('landscape/useLandscape.ts');
  expect(land).toMatch(
    /const click = \(x: number, y: number, add = false\) => \{\n\s+if \(pressPin\(x, y\)\) return;/,
  );
  expect(land).toMatch(
    /if \(e\.key === 'Escape'\) \{\n\s+\/\/ an open pin closes first\n\s+if \(at\?\.current\?\.pinOpen\) \{/,
  );
  expect(land).toMatch(/pins\.dispose\(\);/);
  // the open pin's claims, each under who said it, in a box the map's names keep clear of
  const card = text('components/ClaimPinCard.tsx');
  expect(card).toMatch(/<Avatar src=\{who\?\.avatar \?\? null\} size="icon" \/>/);
  expect(card).toMatch(/data-float=""/);
  expect(text('landscape/LandscapeCanvas.tsx')).toMatch(/<ClaimPinCard/);
});
