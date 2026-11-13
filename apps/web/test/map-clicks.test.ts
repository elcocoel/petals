// Two clicks: a click on a line highlights the petals that hold that token; a click on a proposal highlights
// the wallets that voted and shows dots for positive and negative votes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const text = (f: string) => readFileSync(join(import.meta.dirname, '..', f), 'utf8');

test('a line lights its shared wallets in both flowers, by address, everyone else where they fold in', () => {
  const land = text('landscape/useLandscape.ts');
  expect(land).toMatch(
    /const lined = line && \(i === line\.a \|\| i === line\.b\) \? litIn\(f, line\.ids\) : \[\];/,
  );
  expect(land).toMatch(
    /const bare = \(id: string\) => id\.slice\(id\.lastIndexOf\(':'\) \+ 1\)\.toLowerCase\(\);/,
  );
  expect(land).toMatch(/return tail && own\.length < want\.size \? \[\.\.\.own, tail\] : own;/);
  // its two flowers alive at any zoom, the camera taking them in together
  expect(land).toMatch(/if \(line\) \{\s+want\.add\(line\.a\);\s+want\.add\(line\.b\);/);
});

test('a proposal pressed stays pinned, its voters lit; pressed again, let go', () => {
  const land = text('landscape/useLandscape.ts');
  expect(land).toMatch(/const id = d\.scene\.pointedProposal\(\);/);
  expect(land).toMatch(
    /voted = was && was\.flower === pressed\.flower && was\.id === pressed\.id \? null : pressed;/,
  );
  expect(land).toMatch(/\.\.\.\(voted\?\.flower === i \? \{ pinned: voted\.id \} : \{\}\),/);
  const scene = text('flower/scene.ts');
  expect(scene).toMatch(
    /s\.hit\.addEventListener\('pointerleave', \(\) => \{\s+overArc = false;\s+point\(pinnedAt\);/,
  );
  expect(scene).toMatch(/if \(pinnedAt >= 0\) point\(pinnedAt\);/);
});

test('a click on empty space clears the choice: the wallet, the pinned proposal, the line, the DAO in the middle', () => {
  const land = text('landscape/useLandscape.ts');
  expect(land).toMatch(
    /if \(r < 0\) \{\s+chooseWallet\(null\);\s+foldStacks\(\);\s+letGoProposal\(\);\s+if \(entered < 0 && \(data\.centre \?\? -1\) >= 0\) at\?\.current\?\.onCentre\?\.\(null\);/,
  );
  expect(land).toMatch(/if \(!pressed\) \{\s+foldStacks\(\);\s+letGoProposal\(\);/);
});

test('a stack of more than STACK_FOLD proposals folds into one mark with its count; a click opens it', () => {
  const scene = text('flower/scene.ts');
  expect(scene).toMatch(/export const STACK_FOLD = 3;/);
  expect(scene).toMatch(
    /const folded = \(petal: number\) => \(perPetal\.get\(petal\) \?\? 0\) > STACK_FOLD && !opened\.has\(petal\);/,
  );
  expect(scene).toMatch(/\.filter\(\(pl\) => !folded\(pl\.petal\)\)/);
  expect(scene).toMatch(/label\.text\(String\(n\)\);/);
  const land = text('landscape/useLandscape.ts');
  expect(land).toMatch(/const petal = d\.scene\.pointedStack\(\);/);
  expect(land).toMatch(/set\.add\(petal\);\s+opened\.set\(flower, set\);\s+remount\(flower\);/);
  expect(land).toMatch(/\.\.\.\(open\.length \? \{ opened: open \} : \{\}\),/);
});

test('the page hears which proposal is pinned, and when it is let go', () => {
  const land = text('landscape/useLandscape.ts');
  expect(land).toMatch(
    /onProposal\?: \(p: \{ flower: string; id: string; proposal: Proposal \| null \} \| null\) => void;/,
  );
  expect(land).toMatch(/remount\(j\);\s+tellProposal\(\);\s+\};/);
  expect(land).toMatch(/if \(j >= 0\) remount\(j\);\s+tellProposal\(\);/);
  expect(land).toMatch(/if \(voted\) at\?\.current\?\.onProposal\?\.\(null\);/);
});
