// The lab's fixture files, read on the server and handed to the page (lab/fixtures.ts, FIXTURE_FILES).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/config.ts';
import { FIXTURE_FILES, type FixtureFiles } from './fixtures.ts';

export function readFixtures(root: string = repoRoot()): FixtureFiles {
  return Object.fromEntries(
    FIXTURE_FILES.map((path) => {
      const file = join(root, 'fixtures', path);
      // a picture goes to the browser as a data URL; everything else as its text
      return [
        path,
        path.endsWith('.png')
          ? `data:image/png;base64,${readFileSync(file).toString('base64')}`
          : readFileSync(file, 'utf8'),
      ];
    }),
  ) as FixtureFiles;
}
