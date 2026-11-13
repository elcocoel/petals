// The wallet level (where it sits everywhere, and its votes): a wallet pressed inside the flower you're
// in is chosen; it's lit in every flower that holds it, the flowers that don't recede, and its votes colour the ring.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const WEB = join(import.meta.dirname, '..');
const text = (f: string) => readFileSync(join(WEB, f), 'utf8');

test('a pressed petal chooses its wallet, a group of accounts or everyone else never does', () => {
  const land = text('landscape/useLandscape.ts');
  expect(land).toMatch(
    /chooseWallet\(\s*pressed && !pressed\.tail && !pressed\.id\.startsWith\('group:'\)/,
  );
  // the page is told, so what's known about it can follow
  expect(land).toMatch(/at\?\.current\?\.onWallet\?\.\(wallet\)/);
  // Escape lets it go before the map goes home
  expect(land).toMatch(/if \(wallet\) \{\s+chooseWallet\(null\);\s+return;/);
});

test('it is lit in the flowers that hold it; the rest recede, marks and names too', () => {
  const land = text('landscape/useLandscape.ts');
  expect(land).toMatch(/const own = wallet && holds\?\.has\(i\) \? \[wallet\] : \[\];/);
  const scene = text('landscape/scene.ts');
  expect(scene).toMatch(/s\.g\.set\('opacity', holds && !holds\.has\(i\) \? WALLET_AWAY : 1\)/);
  expect(scene).toMatch(
    /\(i === entered \? 1 : rest\) \* \(holds && !holds\.has\(i\) \? WALLET_AWAY : 1\)/,
  );
});

test("its votes colour the proposals it voted on, in the vote's own colour", () => {
  const scene = text('flower/scene.ts');
  expect(scene).toMatch(
    /if \(votes && voter && cast\?\.has\(voter\)\) return votes\.colours\[cast\.get\(voter\) \?\? 'abstain'\];/,
  );
  expect(scene).toMatch(/s\.seen\.set\('stroke', k === j \? INK : s\.rest\)/);
});
