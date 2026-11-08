// What a Postgres database of Petals' holds, as the owner sees it: rows per table, and, with the server's
// wallet key, how many sealed wallets open and still find their account. A backup records it, and a
// restore test compares against it. By hand; prints JSON, and no key, password or wallet.
//   PETAL_DATABASE_URL=postgres://petals_owner@<host>:5432/<db> PETAL_DATABASE_PASSWORD_FILE=<file> \
//   [PETAL_WALLET_KEY=<key>] node scripts/db-check.ts
import { parseWalletKey, walletCipher } from '@petal/agent';
import { ownerConnection } from '@petal/store';

export interface DbCheck {
  tables: Record<string, number>;
  seals: { opened: number; total: number } | null;
}

export async function run(env: NodeJS.ProcessEnv = process.env): Promise<DbCheck> {
  const url = env.PETAL_DATABASE_URL?.trim();
  if (!url) throw new Error('usage: PETAL_DATABASE_URL=<owner address> node scripts/db-check.ts');
  const c = await ownerConnection(url);
  try {
    const names = (
      await c.raw.query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
      )
    ).rows.map((r) => String(r.tablename));
    const tables: Record<string, number> = {};
    for (const t of names) {
      tables[t] = Number((await c.raw.query(`SELECT COUNT(*) AS n FROM "${t}"`)).rows[0]?.n ?? 0);
    }
    const key = env.PETAL_WALLET_KEY?.trim();
    let seals: DbCheck['seals'] = null;
    if (key && names.includes('wallet_binding')) {
      const cipher = walletCipher(parseWalletKey(key));
      const rows = (await c.raw.query('SELECT caip10_encrypted, caip10_hash FROM wallet_binding'))
        .rows as { caip10_encrypted: string; caip10_hash: string }[];
      let opened = 0;
      for (const r of rows) {
        try {
          if (cipher.index(cipher.open(r.caip10_encrypted)) === r.caip10_hash) opened++;
        } catch {
          // doesn't open under this key
        }
      }
      seals = { opened, total: rows.length };
    }
    return { tables, seals };
  } finally {
    await c.close();
  }
}

if (import.meta.main) {
  try {
    console.log(JSON.stringify(await run()));
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  }
}
