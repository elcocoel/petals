// Sponsored invites (T196): the pool's size is the operator's to decide, so the amount is an argument.
//   node scripts/mint-invite.ts <usd> [days]      makes one, and prints its token once; days default to 14
//   node scripts/mint-invite.ts --revoke <id>     the next model call on it is refused
//   node scripts/mint-invite.ts --budget <id> <usd>  its budget in total becomes <usd>, the same token kept
// It writes to the server's own private.db, so run it where the server runs: PETAL_STATE_DIR says
// where, default .petal. For the container, from inside it, because SQLite's write-ahead log doesn't
// work across the VM's mount: container exec petals node /app/scripts/mint-invite.ts 5 14
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { mintInvite, openPrivateStore, revokeInvite, setInviteBudget } from '@petal/agent';

const USAGE =
  'usage: node scripts/mint-invite.ts <usd> [days] | --revoke <id> | --budget <id> <usd>';
const REPO = resolve(import.meta.dirname, '..');

export async function run(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const [first, second, third] = args;
  if (!first) throw new Error(USAGE);
  const stateDir = resolve(REPO, env.PETAL_STATE_DIR?.trim() || '.petal');
  // Not made here: a mistyped folder would hold an invite no server ever sees.
  if (!existsSync(stateDir)) {
    throw new Error(`no state folder at ${stateDir}: set PETAL_STATE_DIR to the server's own`);
  }
  const store = openPrivateStore(stateDir, env.PETAL_DATABASE_URL?.trim() || undefined);
  try {
    if (first === '--revoke') {
      if (!second) throw new Error(USAGE);
      if (!(await revokeInvite(store, second))) throw new Error(`no invite ${second}`);
      return `revoked ${second}`;
    }
    if (first === '--budget') {
      if (!second || third === undefined) throw new Error(USAGE);
      if (!(await setInviteBudget(store, second, Number(third))))
        throw new Error(`no invite ${second}`);
      const invite = await store.invite.get(second);
      return `invite  ${second}\nbudget  $${invite?.budget_usd}\nspent   $${invite?.spent_usd}`;
    }
    const minted = await mintInvite(store, {
      usd: Number(first),
      ...(second === undefined ? {} : { days: Number(second) }),
    });
    return [
      `invite  ${minted.id}`,
      `budget  $${minted.budget_usd}`,
      `expires ${minted.expires_at}`,
      `token   ${minted.token}`,
      "The token isn't stored and can't be shown again.",
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
