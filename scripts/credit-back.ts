// Corrects what a person was charged (positive goes back, negative is charged), as one entry with its reason (Elco, 10 Nov: "give the
// overcharge back, one entry 'repriced at the cached rate'"). Running it again with the same reason changes
// nothing. It moves no money: it's a record of what Petals will let them spend.
//   node scripts/credit-back.ts --person <prs_id> --usd <dollars> --reason "repriced at the cached rate"
// It writes to the server's own store, so for a container run it from inside, as fund-person.ts says.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { creditBack, openPrivateStore } from '@petal/agent';

const USAGE =
  'usage: node scripts/credit-back.ts [--state <folder>] --person <prs_id> --usd <dollars> --reason <words>';

export async function run(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const { values } = parseArgs({
    args,
    options: {
      state: { type: 'string' },
      person: { type: 'string' },
      usd: { type: 'string' },
      reason: { type: 'string' },
    },
  });
  const folder = values.state ?? env.PETAL_STATE_DIR?.trim() ?? '.petal';
  if (!values.person || values.usd === undefined || !values.reason) throw new Error(USAGE);
  const stateDir = resolve(folder);
  const databaseUrl = env.PETAL_DATABASE_URL?.trim() || undefined;
  if (!databaseUrl && !existsSync(join(stateDir, 'private.db'))) {
    throw new Error(`no private.db in ${stateDir}: name the server's own state folder`);
  }
  const store = openPrivateStore(stateDir, databaseUrl);
  try {
    const credit = await creditBack(store, values.person, Number(values.usd), values.reason);
    return [
      `person ${values.person}`,
      `${Number(values.usd) > 0 ? 'back  ' : 'charge'} $${Math.abs(Number(values.usd))} (${values.reason})`,
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
