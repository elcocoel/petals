// The two clicks Elco named (12 Nov): "a click on the line can do is highlight the petals that hold that token";
// "clicking a proposal should highlight the wallets that voted and show dots for positive and negative votes".
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
  expect(land).toMatch(
    /return voted\?\.flower === i \? \{ \.\.\.look, pinned: voted\.id \} : look;/,
  );
  const scene = text('flower/scene.ts');
  expect(scene).toMatch(/s\.hit\.addEventListener\('pointerleave', \(\) => point\(pinnedAt\)\);/);
  expect(scene).toMatch(/if \(pinnedAt >= 0\) point\(pinnedAt\);/);
});
