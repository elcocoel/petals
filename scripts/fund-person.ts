// A person's own credit (Test 1, line 3): they spend it with no invite, from any of their wallets and any
// browser. The number is what they've been given in all, whatever they've spent, so running it again changes
// nothing, and a bigger or smaller number is how the amount changes. It's a record of what Petals will let
// them spend, and moves no money.
//   node scripts/fund-person.ts --state <folder> --person <prs_id> --total <usd>
// PETAL_STATE_DIR is the default folder. It writes to the server's own private.db, so for a container run it
// from inside (mint-invite.ts says why), or run it with no server up on that folder.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fundPerson, openPrivateStore } from '@petal/agent';

const USAGE = 'usage: node scripts/fund-person.ts --state <folder> --person <prs_id> --total <usd>';

export async function run(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const { values } = parseArgs({
    args,
    options: {
      state: { type: 'string' },
      person: { type: 'string' },
      total: { type: 'string' },
    },
  });
  const folder = values.state ?? env.PETAL_STATE_DIR?.trim();
  if (!folder || !values.person || values.total === undefined) throw new Error(USAGE);
  const stateDir = resolve(folder);
  const databaseUrl = env.PETAL_DATABASE_URL?.trim() || undefined;
  // Not made here: a mistyped folder would hold money no server ever sees.
  if (!databaseUrl && !existsSync(join(stateDir, 'private.db'))) {
    throw new Error(`no private.db in ${stateDir}: name the server's own state folder`);
  }
  const store = openPrivateStore(stateDir, databaseUrl);
  try {
    const credit = await fundPerson(store, values.person, Number(values.total));
    return [
      `person ${values.person}`,
      `funded $${credit.funded_usd}`,
      `spent  $${credit.spent_usd}`,
      `left   $${credit.left_usd}`,
    ].join('\n');
  } finally {
    await store.close();
  }
}

if (import.meta.main) {
  try {
    console.log(await run(process.argv.slice(2)));
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  }
}
