// Test 1, line 3: the one-off that sets a person's own credit, on a real private.db in a temp folder.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openPrivateStore, personCredit } from '@petal/agent';
import { describe, expect, test } from 'vitest';
import { run } from '../fund-person.ts';

async function stateWithPerson() {
  const stateDir = mkdtempSync(join(tmpdir(), 'petal-fund-'));
  const store = openPrivateStore(stateDir);
  await store.person.create({ id: 'prs_me', created_at: '2026-11-06T00:00:00.000Z' });
  await store.close();
  return stateDir;
}

describe('fund-person', () => {
  test('sets the total: run again it changes nothing, and it goes up and down around what’s spent', async () => {
    const dir = await stateWithPerson();
    const fund = (total: string) => run(['--state', dir, '--person', 'prs_me', '--total', total]);
    expect(await fund('5')).toContain('funded $5');
    fund('5');
    let store = openPrivateStore(dir);
    expect(await store.credit.entries('person:prs_me')).toHaveLength(1);
    await store.credit.apply({
      id: 'spent',
      account_key: 'person:prs_me',
      delta_usd: -1,
      reason: 'model call',
      at: '2026-11-06T00:00:01.000Z',
    });
    await store.close();
    expect(await fund('7')).toContain('left   $6');
    expect(await fund('0')).toContain('left   $0');
    store = openPrivateStore(dir);
    // what's spent stays spent, and there's nothing left to draw on
    expect(await personCredit(store, 'prs_me')).toEqual({
      funded_usd: 0,
      spent_usd: 1,
      left_usd: 0,
    });
    await store.close();
  });

  test('refuses what isn’t there or isn’t a number', async () => {
    const dir = await stateWithPerson();
    const fund = (person: string, total: string) =>
      run(['--state', dir, '--person', person, '--total', total]);
    await expect(fund('prs_nope', '5')).rejects.toThrow(/no person/);
    await expect(fund('prs_me', 'five')).rejects.toThrow(/number of dollars/);
    await expect(fund('prs_me', '--total=-1')).rejects.toThrow();
    await expect(run(['--state', dir, '--person', 'prs_me', '--total=-1'])).rejects.toThrow(
      /number of dollars/,
    );
    await expect(
      run(['--state', join(dir, 'nope'), '--person', 'prs_me', '--total', '5']),
    ).rejects.toThrow(/no private.db/);
    await expect(run([])).rejects.toThrow(/usage/);
  });
});
