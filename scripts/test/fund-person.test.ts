// Test 1, line 3: the one-off that sets a person's own credit, on a real private.db in a temp folder.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openPrivateStore, personCredit } from '@petal/agent';
import { describe, expect, test } from 'vitest';
import { run } from '../fund-person.ts';

function stateWithPerson() {
  const stateDir = mkdtempSync(join(tmpdir(), 'petal-fund-'));
  const store = openPrivateStore(stateDir);
  store.person.create({ id: 'prs_me', created_at: '2026-11-06T00:00:00.000Z' });
  store.close();
  return stateDir;
}

describe('fund-person', () => {
  test('sets the total: run again it changes nothing, and it goes up and down around what’s spent', () => {
    const dir = stateWithPerson();
    const fund = (total: string) => run(['--state', dir, '--person', 'prs_me', '--total', total]);
    expect(fund('5')).toContain('funded $5');
    fund('5');
    let store = openPrivateStore(dir);
    expect(store.credit.entries('person:prs_me')).toHaveLength(1);
    store.credit.apply({
      id: 'spent',
      account_key: 'person:prs_me',
      delta_usd: -1,
      reason: 'model call',
      at: '2026-11-06T00:00:01.000Z',
    });
    store.close();
    expect(fund('7')).toContain('left   $6');
    expect(fund('0')).toContain('left   $0');
    store = openPrivateStore(dir);
    // what's spent stays spent, and there's nothing left to draw on
    expect(personCredit(store, 'prs_me')).toEqual({ funded_usd: 0, spent_usd: 1, left_usd: 0 });
    store.close();
  });

  test('refuses what isn’t there or isn’t a number', () => {
    const dir = stateWithPerson();
    const fund = (person: string, total: string) =>
      run(['--state', dir, '--person', person, '--total', total]);
    expect(() => fund('prs_nope', '5')).toThrow(/no person/);
    expect(() => fund('prs_me', 'five')).toThrow(/number of dollars/);
    expect(() => fund('prs_me', '--total=-1')).toThrow();
    expect(() => run(['--state', dir, '--person', 'prs_me', '--total=-1'])).toThrow(
      /number of dollars/,
    );
    expect(() => run(['--state', join(dir, 'nope'), '--person', 'prs_me', '--total', '5'])).toThrow(
      /no private.db/,
    );
    expect(() => run([])).toThrow(/usage/);
  });
});
