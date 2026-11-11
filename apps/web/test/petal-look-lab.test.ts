// The petal look is in /lab first (#76; design/flower-art-direction/default-system-vnext.md): nothing on the live
// flowers draws its colours or its highlight until Elco has seen them. Only the petal look's bench hands the canvas
// one; the canvas draws as it always has unless handed one.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { LAB_DIR, RAIDGUILD } from '../lab/petal/raidguild.ts';

const WEB = join(import.meta.dirname, '..');
const sourcesIn = (dir: string): string[] =>
  readdirSync(join(WEB, dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory()
      ? sourcesIn(join(dir, d.name))
      : /\.tsx?$/.test(d.name)
        ? [join(dir, d.name).split(sep).join('/')]
        : [],
  );
const text = (f: string) => readFileSync(join(WEB, f), 'utf8');

describe('the petal look, in the lab only', () => {
  test('only the petal look bench hands the canvas a look', () => {
    const handing = ['app', 'components', 'flower', 'landscape', 'lib', 'viewmodels', 'lab']
      .flatMap(sourcesIn)
      .filter((f) => /\blook=\{/.test(text(f)));
    expect(handing).toEqual(['app/lab/petal/page.tsx']);
  });

  test("a page that hands no look gets the reading's own colours in the keys (core lookFills)", () => {
    expect(text('flower/FlowerCanvas.tsx')).toMatch(/look = null,/);
    expect(text('flower/drive.ts')).toMatch(/o\.look \?\? null/);
    expect(text('flower/scene.ts')).toMatch(/given: PetalLook \| null = null/);
    expect(text('flower/scene.ts')).toMatch(
      /given \?\? \{ \.\.\.lookFills\(m\.petals\), highlight: \[\] \}/,
    );
  });

  test('only the lab reads a flower with no minimum height', () => {
    const reading = ['app', 'components', 'flower', 'landscape', 'lib', 'viewmodels', 'lab']
      .flatMap(sourcesIn)
      .filter((f) => /floor: 0/.test(text(f)));
    expect(reading).toEqual(['lab/petal/bench.ts', 'lab/petal/votes.ts']);
  });

  test("the bench's own snapshot is the one its name says, and its spec names it", () => {
    const at = join(WEB, '../..', LAB_DIR, RAIDGUILD.sha256);
    const bytes = gunzipSync(readFileSync(`${at}.json.gz`));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(RAIDGUILD.sha256);
    expect(JSON.parse(readFileSync(`${at}.spec.json`, 'utf8')).snapshot.sha256).toBe(
      RAIDGUILD.sha256,
    );
  });
});
