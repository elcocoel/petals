// Sponsored invites (T196): the judge pool's size is Elco's to decide, so the amount is an argument.
//   node scripts/mint-invite.ts <usd> [days]      makes one, and prints its token once
//   node scripts/mint-invite.ts --revoke <id>     the next model call on it is refused
// It writes to the server's own private.db, so run it where the server runs: PETAL_STATE_DIR says
// where, default .petal. For the container, from inside it, because SQLite's write-ahead log doesn't
// work across the VM's mount: container exec petals node /app/scripts/mint-invite.ts 5 14
import { resolve } from 'node:path';
import { mintInvite, openPrivateStore, revokeInvite } from '@petal/agent';

const USAGE = 'usage: node scripts/mint-invite.ts <usd> [days] | --revoke <id>';
const REPO = resolve(import.meta.dirname, '..');

export function run(args: string[], env: NodeJS.ProcessEnv = process.env): string {
  const [first, second] = args;
  if (!first) throw new Error(USAGE);
  const store = openPrivateStore(resolve(REPO, env.PETAL_STATE_DIR?.trim() || '.petal'));
  try {
    if (first === '--revoke') {
      if (!second) throw new Error(USAGE);
      if (!revokeInvite(store, second)) throw new Error(`no invite ${second}`);
      return `revoked ${second}`;
    }
    const minted = mintInvite(store, {
      usd: Number(first),
      ...(second === undefined ? {} : { days: Number(second) }),
    });
    return [
      `invite  ${minted.id}`,
      `budget  $${minted.budget_usd}`,
      `expires ${minted.expires_at ?? 'never'}`,
      `token   ${minted.token}`,
      "The token isn't stored and can't be shown again.",
    ].join('\n');
  } finally {
    store.close();
  }
}

if (import.meta.main) {
  try {
    console.log(run(process.argv.slice(2)));
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  }
}
