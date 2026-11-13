// On /make the Power Map is always there; an answer moves the map, never replaces it. A page
// shows what its conversation is about with the four clicks' own states: a DAO flown to and entered, a wallet lit
// everywhere it sits, the line between two DAOs, a proposal pinned (its stack open) in its DAO.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const text = (f: string) => readFileSync(join(import.meta.dirname, '..', f), 'utf8');

test('LandscapeCanvas takes a show and resolves it to its chain and its places', () => {
  const canvas = text('landscape/LandscapeCanvas.tsx');
  expect(canvas).toMatch(/show\?: MapShow \| null \| undefined;/);
  expect(canvas).toMatch(/\| \{ wallet: string; chain\?: string \| null \}/);
  expect(canvas).toMatch(/show=\{shownOn\?\.chain === chain \? shownOn\.show : undefined\}/);
  expect(canvas).toMatch(/if \(show !== undefined\) at\.current\?\.show\?\.\(show\);/);
});

test('the map shows it with the four clicks: enter, wallet level, line, pinned proposal', () => {
  const land = text('landscape/useLandscape.ts');
  expect(land).toMatch(/at\.current\.show = \(s\) => \{/);
  expect(land).toMatch(/if \(wallet !== id\) chooseWallet\(id\);/);
  expect(land).toMatch(
    /flyTo\(cam, fitView\(cam\.width, cam\.height, around\(held\), cam\.clear\)\);/,
  );
  expect(land).toMatch(/marked = r;\s+lightLine\(\);/);
  expect(land).toMatch(/voted = \{ flower: s\.i, id: s\.id \};/);
  // a pinned proposal's stack stands open; the page hears it again once its ring has come
  expect(land).toMatch(/if \(!open\.includes\(petal\)\) open\.push\(petal\);/);
  expect(land).toMatch(/if \(voted && flowers\[voted\.flower\]\?\.map === map\) tellProposal\(\);/);
});

test('a change in Tools redraws the map in the browser at once (core redress over the pieces given)', () => {
  const canvas = text('landscape/LandscapeCanvas.tsx');
  expect(canvas).toMatch(/petals: redress\(f\.reading\.petals, view, f\.given\)/);
  expect(canvas).toMatch(/if \(!data\.flowers\.some\(\(f\) => f\.given\)\) return data;/);
});
