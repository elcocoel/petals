// Correcting a charge: one entry with its reason, which changes what was spent and isn't
// funding; positive goes back, negative is charged; run again, it changes nothing. On a real private.db in a
// temp folder.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fundPerson, openPrivateStore, personCredit } from '@petal/agent';
import { describe, expect, test } from 'vitest';
import { run } from '../credit-back.ts';

const REASON = 'repriced at the cached rate';

describe('credit-back', () => {
  test('one entry back or charged, what was spent changes, and running it again changes nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'petal-back-'));
    let store = openPrivateStore(dir);
    await store.person.create({ id: 'prs_me', created_at: '2026-11-10T00:00:00.000Z' });
    await fundPerson(store, 'prs_me', 1);
    await store.credit.apply({
      id: 'call_1',
      account_key: 'person:prs_me',
      delta_usd: -0.548017,
      reason: 'model call',
      at: '2026-11-10T18:00:00.000Z',
    });
    await store.close();
    const back = () =>
      run(['--state', dir, '--person', 'prs_me', '--usd', '0.312538', '--reason', REASON]);
    expect(await back()).toContain('back   $0.312538 (repriced at the cached rate)');
    await back();
    store = openPrivateStore(dir);
    const entries = await store.credit.entries('person:prs_me');
    expect(entries.filter((e) => e.reason === REASON)).toHaveLength(1);
    const credit = await personCredit(store, 'prs_me');
    expect(credit?.funded_usd).toBe(1);
    expect(credit?.spent_usd).toBeCloseTo(0.235479, 6);
    expect(credit?.left_usd).toBeCloseTo(0.764521, 6);
    await store.close();
    // a correction the other way is charged, as its own entry
    expect(
      await run([
        '--state',
        dir,
        '--person',
        'prs_me',
        '--usd=-0.003298',
        '--reason',
        'repriced again',
      ]),
    ).toContain('charge $0.003298 (repriced again)');
    store = openPrivateStore(dir);
    expect((await personCredit(store, 'prs_me'))?.left_usd).toBeCloseTo(0.761223, 6);
    await store.close();
    await expect(
      run(['--state', dir, '--person', 'prs_me', '--usd', '0', '--reason', REASON]),
    ).rejects.toThrow(/not \$0/);
  });
});
