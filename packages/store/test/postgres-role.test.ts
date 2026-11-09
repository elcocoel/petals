// The runtime role on a real Postgres server is what the server needs and nothing more: not a superuser,
// no BYPASSRLS, owns no table, can't change the schema. Only with PETAL_TEST_DATABASE_URL, which names the
// runtime role (petals_app), with PETAL_DATABASE_PASSWORD_FILE.
import { afterAll, describe, expect, test } from 'vitest';
import { openStore } from '../src/index.ts';

const server = process.env.PETAL_TEST_DATABASE_URL?.trim();

describe.skipIf(!server)('the runtime role on a real server', () => {
  const store = server ? openStore(server) : null;
  afterAll(async () => {
    await store?.close();
  });
  // biome-ignore lint/suspicious/noExplicitAny: a raw query's row
  const sql = async (q: string): Promise<any> => {
    const pg = (await import('pg')).default;
    const { readFileSync } = await import('node:fs');
    const { pgConfigOf } = await import('../src/postgres.ts');
    const c = new pg.Client(
      pgConfigOf(
        server as string,
        readFileSync(process.env.PETAL_DATABASE_PASSWORD_FILE as string, 'utf8').trim(),
      ),
    );
    await c.connect();
    try {
      return (await c.query(q)).rows[0];
    } finally {
      await c.end();
    }
  };

  test('it connects, and the schema is current: it checked, and didn’t migrate', async () => {
    await store?.ready;
    expect(await store?.person.list()).toBeInstanceOf(Array);
  });

  test('not a superuser, no BYPASSRLS, and it owns no table', async () => {
    const me = await sql(
      'SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = current_user',
    );
    expect(me).toEqual({
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
      rolcreatedb: false,
    });
    const owned = await sql(
      "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user",
    );
    expect(owned.n).toBe(0);
  });

  test.each([
    'CREATE TABLE intruder (a text)',
    'DROP TABLE person',
    'ALTER TABLE person ADD COLUMN x text',
    'TRUNCATE person',
    'CREATE EXTENSION pg_trgm',
  ])('refused: %s', async (q) => {
    await expect(sql(q)).rejects.toThrow(/permission|must be owner|denied/i);
  });

  test("it can't hand its rows to anyone: a grant from it gives nothing", async () => {
    // Postgres only warns here, and grants nothing: the role holds no grant option
    await sql('GRANT SELECT ON person TO PUBLIC');
    const given = await sql(
      "SELECT count(*)::int AS n FROM information_schema.role_table_grants WHERE table_name = 'person' AND grantee = 'PUBLIC'",
    );
    expect(given.n).toBe(0);
  });
});
