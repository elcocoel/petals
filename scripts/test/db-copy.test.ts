// The owner's two tools on Postgres in process: migrate and grant, then copy a SQLite store across and
// check it row for row, wallet seals included. The same code runs against the real server by hand.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walletCipher } from '@petal/agent';
import {
  compareWithSqlite,
  copyFromSqlite,
  migrateAndGrant,
  openStore,
  ownerConnection,
} from '@petal/store';
import { expect, test } from 'vitest';

const KEY = 'ef'.repeat(32);
const AT = '2026-11-08T12:00:00.000Z';

test('a SQLite store copies into Postgres exactly, once, and its seals still open', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'petal-copy-')), 'private.db');
  const lite = openStore(file);
  const cipher = walletCipher(Buffer.from(KEY, 'hex'));
  const wallet = 'near:testnet:copy.testnet';
  await lite.person.create({ id: 'prs_a', created_at: AT });
  await lite.walletBinding.bind({
    person: 'prs_a',
    network: 'testnet',
    caip10_encrypted: cipher.seal(wallet),
    caip10_hash: cipher.index(wallet),
    proved_at: AT,
  });
  await lite.exploration.create({
    id: 'exp_a',
    owner: 'prs_a',
    question: "Who's café is it?",
    target: null,
    head: null,
    visibility: 'private',
    share_token_hash: null,
    forked_from: null,
    created_at: AT,
    updated_at: AT,
  });
  await lite.note.append({ exploration: 'exp_a', author: 'owner', text: 'it’s theirs', at: AT });
  await lite.search.put(
    { owner: 'prs_a', kind: 'note', ref: 'n', title: 't', about: null, at: AT },
    'café',
  );
  await lite.close();

  const pg = await ownerConnection('pglite:');
  await pg.raw.exec('CREATE ROLE petals_app');
  expect(await migrateAndGrant(pg.raw, 'petals_app')).toBe(6);
  const checks = await copyFromSqlite(pg.raw, file);
  expect(checks.every((c) => c.same)).toBe(true);
  expect(checks.find((c) => c.table === 'person')).toMatchObject({ sqlite: 1, postgres: 1 });
  expect(checks.find((c) => c.table === 'search')).toMatchObject({ sqlite: 1, postgres: 1 });
  const { rows } = await pg.raw.query('SELECT caip10_encrypted, caip10_hash FROM wallet_binding');
  const row = rows[0] as { caip10_encrypted: string; caip10_hash: string };
  expect(cipher.index(cipher.open(row.caip10_encrypted))).toBe(row.caip10_hash);
  // search works on the copy, and the numbering carries on past what was copied
  const hits = await pg.raw.query(
    "SELECT count(*) AS n FROM search WHERE tsv @@ to_tsquery('petal_search'::regconfig, 'cafe')",
  );
  expect(hits.rows[0]?.n).toBe(1);
  // nothing is copied twice
  await expect(copyFromSqlite(pg.raw, file)).rejects.toThrow(/already holds rows/);
  expect(
    (await compareWithSqlite(pg.raw, file))
      .filter((c) => c.table !== 'schema_migration')
      .every((c) => c.same),
  ).toBe(true);
  await pg.close();
});
