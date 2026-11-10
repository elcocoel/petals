// T196: the script that makes and revokes invites, on a real private.db in a temp folder.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashToken } from '@petal/agent';
import { openStore } from '@petal/store';
import { describe, expect, test } from 'vitest';
import { run } from '../mint-invite.ts';

const stateDir = () => mkdtempSync(join(tmpdir(), 'petal-mint-'));

describe('mint-invite', () => {
  test('prints the token once, and keeps only its hash', async () => {
    const dir = stateDir();
    const out = await run(['2.5', '14'], { PETAL_STATE_DIR: dir });
    const token = /token\s+(\S+)/.exec(out)?.[1] ?? '';
    const id = /invite\s+(\S+)/.exec(out)?.[1] ?? '';
    expect(token).toMatch(/^petal_invite_/);
    expect(out).toMatch(/budget\s+\$2\.5/);
    const store = openStore(join(dir, 'private.db'));
    const row = await store.invite.get(id);
    expect(row).toMatchObject({ token_hash: hashToken(token), budget_usd: 2.5, spent_usd: 0 });
    expect(row?.expires_at).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain(token);
    expect(await store.credit.get(`invite:${id}`)).toMatchObject({
      balance_usd: 2.5,
      reserved_usd: 0,
    });
    await store.close();
  });

  test('--budget sets its budget in total, keeps the token, and what it spent still counts', async () => {
    const dir = stateDir();
    const env = { PETAL_STATE_DIR: dir };
    const out = await run(['20', '14'], env);
    const id = /invite\s+(\S+)/.exec(out)?.[1] ?? '';
    const token = /token\s+(\S+)/.exec(out)?.[1] ?? '';
    let store = openStore(join(dir, 'private.db'));
    await store.credit.apply({
      id: 'spent-a-bit',
      account_key: `invite:${id}`,
      delta_usd: -0.25,
      reason: 'test',
      at: new Date().toISOString(),
    });
    await store.close();
    expect(await run(['--budget', id, '1'], env)).toMatch(/budget\s+\$1\b/);
    store = openStore(join(dir, 'private.db'));
    expect(await store.invite.get(id)).toMatchObject({
      token_hash: hashToken(token),
      budget_usd: 1,
    });
    expect((await store.credit.get(`invite:${id}`))?.balance_usd).toBeCloseTo(0.75);
    await store.close();
    await expect(run(['--budget', 'inv_nope', '1'], env)).rejects.toThrow(/no invite/);
    await expect(run(['--budget', id, '0'], env)).rejects.toThrow(/more than \$0/);
    await expect(run(['--budget', id], env)).rejects.toThrow(/usage/);
  });

  test('--revoke marks it, and a wrong id or a bad amount says so', async () => {
    const dir = stateDir();
    const env = { PETAL_STATE_DIR: dir };
    const id = /invite\s+(\S+)/.exec(await run(['1'], env))?.[1] ?? '';
    expect(await run(['--revoke', id], env)).toBe(`revoked ${id}`);
    const store = openStore(join(dir, 'private.db'));
    expect((await store.invite.get(id))?.revoked_at).toBeTruthy();
    await store.close();
    await expect(run(['--revoke', 'inv_nope'], env)).rejects.toThrow(/no invite/);
    await expect(run(['0'], env)).rejects.toThrow(/more than \$0/);
    await expect(run(['ten'], env)).rejects.toThrow(/more than \$0/);
    await expect(run(['1', '-3'], env)).rejects.toThrow(/days/);
    await expect(run([], env)).rejects.toThrow(/usage/);
    await expect(run(['1'], { PETAL_STATE_DIR: join(dir, 'nowhere') })).rejects.toThrow(
      /no state folder/,
    );
  });
});
