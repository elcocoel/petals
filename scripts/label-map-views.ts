// Names the night's views on the map and says who made them (Elco, 10 Nov: the project's own mapping is
// "by Petals' own mapping (mapping.petals.near)"). The names and hashes are the run's own, from the bench's
// copy of its index (fixtures/landscape/night-2026-11-09.json.gz: the 203 views INDEX.md links). Only
// views this server holds change; running it again changes nothing.
//   node scripts/label-map-views.ts --by mapping.petals.near [--from <copy.json.gz>]
// It writes to the server's own private store, so for a container run it from inside (mint-invite.ts says
// why): container exec petals node /app/scripts/label-map-views.ts --by mapping.petals.near
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { openPrivateStore } from '@petal/agent';

const USAGE = 'usage: node scripts/label-map-views.ts --by <near account> [--from <copy.json.gz>]';
const REPO = resolve(import.meta.dirname, '..');
const COPY = 'fixtures/landscape/night-2026-11-09.json.gz';
const ACCOUNT = /^(?=.{2,64}$)[a-z0-9]+([-_][a-z0-9]+)*(\.[a-z0-9]+([-_][a-z0-9]+)*)*$/;

export async function run(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const { values } = parseArgs({
    args,
    options: { by: { type: 'string' }, from: { type: 'string' } },
  });
  const by = values.by?.trim();
  if (!by || !ACCOUNT.test(by)) throw new Error(USAGE);
  const from = resolve(REPO, values.from ?? COPY);
  const views = (
    JSON.parse(gunzipSync(readFileSync(from)).toString('utf8')) as {
      views: { sha: string; name: string }[];
    }
  ).views;
  const stateDir = resolve(REPO, env.PETAL_STATE_DIR?.trim() || '.petal');
  const databaseUrl = env.PETAL_DATABASE_URL?.trim() || undefined;
  if (!databaseUrl && !existsSync(stateDir)) {
    throw new Error(`no state folder at ${stateDir}: set PETAL_STATE_DIR to the server's own`);
  }
  const store = openPrivateStore(stateDir, databaseUrl);
  let named = 0;
  const missing: string[] = [];
  try {
    for (const v of views) {
      if (await store.draft.label(v.sha, { name: v.name, made_by: by })) named++;
      else missing.push(v.sha);
    }
  } finally {
    await store.close();
  }
  return [
    `named ${named} of ${views.length} views, made by ${by}`,
    ...(missing.length
      ? [`not on this server: ${missing.length} (${missing.slice(0, 3).join(', ')}…)`]
      : []),
  ].join('\n');
}

if (import.meta.main) {
  try {
    console.log(await run(process.argv.slice(2)));
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  }
}
