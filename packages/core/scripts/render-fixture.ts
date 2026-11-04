// T032: the early exit check before the CLI exists. Renders the NEAR validators fixture with
// `segments: backers` and writes out/near-validators.svg (plus the default flower and House of
// Stake next to it), printing each file's hashes.
//   node packages/core/scripts/render-fixture.ts            write the SVGs under out/
//   node packages/core/scripts/render-fixture.ts --hashes   print the golden hashes as JSON only
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { specHash } from '../src/hash.ts';
import { GOLDEN_CASES, renderGolden } from '../test/golden-cases.ts';
import { REPO } from '../test/load.ts';

const OUT: Record<string, string> = {
  'near-validators-backers': 'near-validators.svg',
  'near-validators-default': 'near-validators-default.svg',
  'house-of-stake-default': 'house-of-stake.svg',
};

if (process.argv.includes('--hashes')) {
  const hashes = Object.fromEntries(
    GOLDEN_CASES.map((c) => {
      const { spec, result } = renderGolden(c);
      return [c.name, { spec_sha256: specHash(spec), render_sha256: result.render_sha256 }];
    }),
  );
  process.stdout.write(`${JSON.stringify(hashes)}\n`);
} else {
  const dir = join(REPO, 'out');
  mkdirSync(dir, { recursive: true });
  for (const c of GOLDEN_CASES) {
    const { spec, result } = renderGolden(c);
    const file = join(dir, OUT[c.name] ?? `${c.name}.svg`);
    writeFileSync(file, result.svg);
    process.stdout.write(
      `${file}\n  spec_sha256   ${specHash(spec)}\n  render_sha256 ${result.render_sha256}\n  ${result.petals.length} petals, ${result.svg.length} bytes\n`,
    );
  }
}
