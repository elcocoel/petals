// pnpm relations:rebuild: delete <stateDir>/index.db and build it again from the stored snapshots,
// saying what it read, how many rows it wrote and how long it took. Nothing is lost by deleting it:
// the last line compares every row with the index that was deleted.
import { existsSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RelationsIndex } from '@petal/relations';
import { configFromEnv, createContext } from '@petal/tools';

const root = fileURLToPath(new URL('..', import.meta.url));
const ctx = createContext(configFromEnv(process.env, root));
const here = (path: string) => {
  const near = relative(process.cwd(), path);
  return near.startsWith('..') ? path : near || '.';
};
const say = (line: string) => process.stdout.write(`${line}\n`);
const n = (x: number) => x.toLocaleString('en-US');
const size = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;
const plural = (x: number, one: string) => `${n(x)} ${one}${x === 1 ? '' : 's'}`;

const stateDir = ctx.config.stateDir as string;
const path = join(stateDir, 'index.db');

let before: string | null = null;
if (existsSync(path)) {
  const bytes = statSync(path).size;
  const old = new RelationsIndex(path);
  try {
    before = await old.fingerprint();
  } catch {
    say('The old index could not be read, so there is nothing to compare with.');
  }
  old.close();
  rmSync(path, { force: true });
  say(`Deleted ${here(path)} (${size(bytes)}).`);
}

say(
  `Reading snapshots from ${here(join(ctx.config.fixturesDir as string, 'snapshots'))} and ${here(join(stateDir, 'cache'))}.`,
);
const index = new RelationsIndex(path);
const report = await index.rebuild(ctx.store, (s) =>
  say(
    `  ${s.as_of.slice(0, 10)}  ${s.title} (${s.network}): ${plural(s.groups, 'group')}, ${plural(s.memberships, 'row')}, ${n(s.ms)} ms`,
  ),
);
for (const s of report.skipped) say(`  not read: ${s.sha256.slice(0, 12)}, ${s.reason}`);

const { rows } = report;
say(
  `Read ${plural(report.snapshots.length, 'snapshot')}: ${plural(rows.groups, 'group')} at ${plural(rows.observations, 'date')}, ${plural(rows.accounts, 'account')}, ${plural(rows.memberships, 'membership')}.`,
);
say(
  `Derived ${plural(rows.adjacency, 'adjacency row')} and ${plural(rows.overlap, 'group overlap')}.`,
);
say(`Wrote ${here(report.path)}: ${size(report.bytes)}, in ${n(report.ms)} ms.`);

const after = await index.fingerprint();
index.close();
if (before === null) say(`Every row hashes to ${after}. No earlier index to compare.`);
else if (before === after) say(`Every row hashes to ${after}: the same as the deleted index.`);
else say(`Every row hashes to ${after}: not the same as the deleted index (${before}).`);
