// One person, whichever of their wallets they use (Test 1, line 2). A one-off: the person has told us which
// wallets are theirs, so this adds them to a named person, and signing in still needs that account's real
// signature. Run again, it changes nothing. It prints no key.
//   node scripts/bind-wallet.ts --state <folder>         who's here, and who owns what
//   node scripts/bind-wallet.ts --state <folder> --person <prs_id> --wallet near:mainnet:<account> [--wallet ...]
//        [--adopt-strays]    also gives this person every run with no owner or an anonymous one
//        [--key-unchecked]   for a copy of a store whose key you don't hold; its wallets can't be read
// Bindings are found by a hash under PETAL_WALLET_KEY, so it needs the server's own key in the environment.
// A wrong key would "work" here and never match at sign-in, so it's refused: the person's existing wallets
// must open under it. A wallet that already belongs to someone else is refused too, and nothing is written.
// PETAL_STATE_DIR is the default folder. It writes to the server's own private.db, so for a container run it
// from inside (mint-invite.ts says why), or run it with no server up on that folder.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { openPrivateStore, parseWalletKey, type WalletCipher, walletCipher } from '@petal/agent';
import type { Store } from '@petal/store';

const USAGE =
  'usage: node scripts/bind-wallet.ts --state <folder> [--person <prs_id> --wallet near:<mainnet|testnet>:<account> ...] [--adopt-strays] [--key-unchecked]';
const WALLET = /^near:(mainnet|testnet):([a-z0-9._-]{2,64})$/;

/** Where an account of this name can exist, so a typo can't bind a wallet that could never sign in. */
function wrongNetwork(network: string, account: string): boolean {
  return account.endsWith(network === 'mainnet' ? '.testnet' : '.near');
}

function openWallets(store: Store, person: string, cipher: WalletCipher | null): string[] {
  return store.walletBinding.ofPerson(person).map((w) => {
    if (!cipher) return `(${w.network}, sealed)`;
    try {
      return cipher.open(w.caip10_encrypted);
    } catch {
      return `(${w.network}, sealed under another key)`;
    }
  });
}

/** Who's in this store. Ids and counts, and wallet names only when the key opens them. */
function shape(store: Store, cipher: WalletCipher | null): string[] {
  const lines = store.person.list().map((p) => {
    const wallets = openWallets(store, p.id, cipher);
    return `person ${p.id}: ${wallets.length} wallet(s): ${wallets.join(', ') || 'none'}`;
  });
  if (!lines.length) lines.push('no people here');
  for (const { owner, n } of store.run.ownerCounts()) {
    lines.push(`runs   ${n} owned by ${owner ?? 'nobody'}`);
  }
  return lines;
}

/** As a sign-in moves an anonymous session's work, and the same for what's older than owners. */
function adoptStrays(store: Store, person: string): number {
  return store.tx(() => {
    let moved = 0;
    for (const run of store.run.withoutOwner()) {
      if (store.run.setOwner(run.id, person)) moved++;
      if (run.exploration) store.exploration.setOwner(run.exploration, person);
    }
    for (const { owner } of store.run.ownerCounts()) {
      if (!owner?.startsWith('anon_')) continue;
      moved += store.run.moveOwner(owner, person);
      store.exploration.moveOwner(owner, person);
      store.follow.moveOwner(owner, person);
      store.workspaceNote.moveOwner(owner, person);
      store.search.forgetOwner(owner);
    }
    return moved;
  });
}

export function run(args: string[], env: NodeJS.ProcessEnv = process.env): string {
  const { values } = parseArgs({
    args,
    options: {
      state: { type: 'string' },
      person: { type: 'string' },
      wallet: { type: 'string', multiple: true },
      'adopt-strays': { type: 'boolean', default: false },
      'key-unchecked': { type: 'boolean', default: false },
    },
  });
  const folder = values.state ?? env.PETAL_STATE_DIR?.trim();
  if (!folder) throw new Error(USAGE);
  const stateDir = resolve(folder);
  // Not made here: a mistyped folder would hold a binding no server ever sees.
  if (!existsSync(join(stateDir, 'private.db'))) {
    throw new Error(`no private.db in ${stateDir}: name the server's own state folder`);
  }
  const key = env.PETAL_WALLET_KEY?.trim();
  const cipher = key ? walletCipher(parseWalletKey(key)) : null;
  const store = openPrivateStore(stateDir);
  try {
    const wallets = values.wallet ?? [];
    if (!values.person) {
      if (wallets.length || values['adopt-strays']) throw new Error(USAGE);
      return shape(store, cipher).join('\n');
    }
    const person = values.person;
    if (!store.person.get(person)) throw new Error(`no person ${person} here`);
    for (const w of wallets) {
      const [, network = '', account = ''] = WALLET.exec(w) ?? [];
      if (!network) throw new Error(`${w} isn't near:<mainnet|testnet>:<account>`);
      if (wrongNetwork(network, account)) throw new Error(`${account} can't exist on ${network}`);
    }
    const lines: string[] = [];
    if (wallets.length) {
      if (!cipher) throw new Error('PETAL_WALLET_KEY must be set: bindings are found under it');
      const unopened = store.walletBinding.ofPerson(person).filter((w) => {
        try {
          cipher.open(w.caip10_encrypted);
          return false;
        } catch {
          return true;
        }
      });
      if (unopened.length && !values['key-unchecked']) {
        throw new Error(
          `PETAL_WALLET_KEY doesn't open ${unopened.length} of this person's wallets, so it isn't the server's key: nothing was written`,
        );
      }
      if (unopened.length)
        lines.push(`key    not the store's own: a copy, and only good for a test`);
      const at = new Date().toISOString();
      store.tx(() => {
        for (const w of wallets) {
          const index = cipher.index(w);
          const holder = store.walletBinding.byHash(index)?.person;
          if (holder && holder !== person) {
            throw new Error(`${w} already belongs to ${holder}: nothing was written`);
          }
          if (holder) {
            lines.push(`wallet ${w}: already this person's`);
            continue;
          }
          store.walletBinding.bind({
            person,
            network: w.split(':')[1] as string,
            caip10_encrypted: cipher.seal(w),
            caip10_hash: index,
            // when this was added: it has proved nothing yet, and it will at its first sign-in
            proved_at: at,
          });
          lines.push(`wallet ${w}: bound`);
        }
      });
    }
    if (values['adopt-strays'])
      lines.push(`runs   ${adoptStrays(store, person)} moved to ${person}`);
    return [...lines, ...shape(store, cipher)].join('\n');
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
