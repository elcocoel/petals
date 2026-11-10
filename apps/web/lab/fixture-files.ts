// The lab's fixture files, read on the server and handed to the page (lab/fixtures.ts, FIXTURE_FILES).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/config.ts';
import { FIXTURE_FILES, type FixtureFiles } from './fixtures.ts';

export function readFixtures(root: string = repoRoot()): FixtureFiles {
  return Object.fromEntries(
    FIXTURE_FILES.map((path) => [path, readFileSync(join(root, 'fixtures', path), 'utf8')]),
  ) as FixtureFiles;
}
