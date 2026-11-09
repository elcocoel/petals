// Migrates Petals' Postgres database, as its owner role, and grants the runtime role its rows. By hand,
// never by the running server, whose role can't change the schema (specs/003-target/proposal-database.md).
//   PETAL_DATABASE_URL=postgres://petals_owner@<host>:5432/petals \
//   PETAL_DATABASE_PASSWORD_FILE=<the owner's password file> node scripts/db-migrate.ts --runtime-role petals_app
// Run again, it changes nothing. It prints no password.
import { parseArgs } from 'node:util';
import { migrateAndGrant, ownerConnection, redacted } from '@petal/store';

export async function run(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const { values } = parseArgs({ args, options: { 'runtime-role': { type: 'string' } } });
  const url = env.PETAL_DATABASE_URL?.trim();
  const runtime = values['runtime-role'];
  if (!url || !runtime) {
    throw new Error(
      'usage: PETAL_DATABASE_URL=<owner address> PETAL_DATABASE_PASSWORD_FILE=<file> node scripts/db-migrate.ts --runtime-role <role>',
    );
  }
  const c = await ownerConnection(url);
  try {
    const version = await migrateAndGrant(c.raw, runtime);
    return `${redacted(url)}: at migration ${version}; ${runtime} may read and write rows, and nothing else`;
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
