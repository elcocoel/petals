// Writes brain/index.json from the brain's files (specs/005-mapping-brain/brain.md). Never edit the
// index by hand. `--check` only compares, and fails when the index is stale.
//   node scripts/brain-index.ts [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBrainIndex } from '@petal/tools';

const dir = fileURLToPath(new URL('../brain/', import.meta.url));
const file = join(dir, 'index.json');
const text = `${JSON.stringify(buildBrainIndex(dir), null, 2)}\n`;
if (process.argv.includes('--check')) {
  const now = readFileSync(file, 'utf8');
  if (now !== text) {
    console.error('brain/index.json is stale: run node scripts/brain-index.ts');
    process.exit(1);
  }
  console.log('brain/index.json matches the brain');
} else {
  writeFileSync(file, text);
  console.log(`wrote ${file}`);
}
