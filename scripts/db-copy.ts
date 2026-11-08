// Copies a SQLite private.db into an empty, migrated Postgres database, as the owner role, and checks it:
// every table row for row, and, with the server's wallet key, every sealed wallet opening and still
// finding its account. Reads the SQLite file read-only and leaves it as it was. By hand.
//   PETAL_DATABASE_URL=postgres://petals_owner@<host>:5432/<db> PETAL_DATABASE_PASSWORD_FILE=<file> \
//   PETAL_WALLET_KEY=<the server's key> node scripts/db-copy.ts --from <folder>/private.db [--check-only]
// --check-only compares without copying: after a restore, say. Exits 1 when anything differs. Prints no
// key, no password and no wallet.
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parseWalletKey, walletCipher } from '@petal/agent';
import { compareWithSqlite, copyFromSqlite, ownerConnection, redacted } from '@petal/store';

export async function run(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const { values } = parseArgs({
    args,
    options: { from: { type: 'string' }, 'check-only': { type: 'boolean', default: false } },
  });
  const url = env.PETAL_DATABASE_URL?.trim();
  const from = values.from;
  if (!url || !from) {
    throw new Error(
      'usage: PETAL_DATABASE_URL=<owner address> node scripts/db-copy.ts --from <private.db> [--check-only]',
    );
  }
  if (!existsSync(from)) throw new Error(`no SQLite file at ${from}`);
  const c = await ownerConnection(url);
  try {
    const checks = values['check-only']
      ? (await compareWithSqlite(c.raw, from)).filter((t) => t.table !== 'schema_migration')
      : await copyFromSqlite(c.raw, from);
    const lines = checks.map(
      (t) =>
        `${t.same ? 'same' : 'DIFFERS'}  ${t.table}: ${t.sqlite} in SQLite, ${t.postgres} in Postgres`,
    );
    let bad = checks.filter((t) => !t.same).length;
    const key = env.PETAL_WALLET_KEY?.trim();
    if (key) {
      const cipher = walletCipher(parseWalletKey(key));
      const { rows } = await c.raw.query(
        'SELECT caip10_encrypted, caip10_hash FROM wallet_binding',
      );
      let opened = 0;
      for (const r of rows as { caip10_encrypted: string; caip10_hash: string }[]) {
        try {
          if (cipher.index(cipher.open(r.caip10_encrypted)) === r.caip10_hash) opened++;
        } catch {
          // counted below as one that doesn't open
        }
      }
      if (opened !== rows.length) bad++;
      lines.push(
        `${opened === rows.length ? 'same' : 'DIFFERS'}  wallet seals: ${opened} of ${rows.length} open with the key and find their account`,
      );
    } else {
      lines.push('note  wallet seals not checked: PETAL_WALLET_KEY is not set');
    }
    lines.push(
      `${bad ? 'FAILED' : 'ok'}: ${redacted(url)} ${values['check-only'] ? 'compared with' : 'copied from'} ${from}`,
    );
    if (bad) throw new Error(lines.join('\n'));
    return lines.join('\n');
  } finally {
    await c.close();
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
