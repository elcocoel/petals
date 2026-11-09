// Test 1, line 2: the one-off that adds wallets to a named person, on a real private.db in a temp folder.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openPrivateStore, walletCipher } from '@petal/agent';
import { describe, expect, test } from 'vitest';
import { run } from '../bind-wallet.ts';

const KEY = 'ab'.repeat(32);
const env = { PETAL_WALLET_KEY: KEY };
const cipher = walletCipher(Buffer.from(KEY, 'hex'));

async function stateWith(wallet: string) {
  const stateDir = mkdtempSync(join(tmpdir(), 'petal-bind-'));
  const store = openPrivateStore(stateDir);
  const at = '2026-11-06T00:00:00.000Z';
  await store.person.create({ id: 'prs_me', created_at: at });
  await store.walletBinding.bind({
    person: 'prs_me',
    network: wallet.split(':')[1] as string,
    caip10_encrypted: cipher.seal(wallet),
    caip10_hash: cipher.index(wallet),
    proved_at: at,
  });
  await store.close();
  return stateDir;
}

describe('bind-wallet', () => {
  test('adds wallets a sign-in finds, once, and prints no key', async () => {
    const dir = await stateWith('near:mainnet:first.near');
    const args = ['--state', dir, '--person', 'prs_me', '--wallet', 'near:testnet:me.testnet'];
    const out = await run(args, env);
    expect(out).toContain('near:testnet:me.testnet: bound');
    expect(out).toContain('near:mainnet:first.near');
    expect(out).not.toContain(KEY);
    expect(await run(args, env)).toContain("near:testnet:me.testnet: already this person's");
    const store = openPrivateStore(dir);
    expect(await store.walletBinding.byHash(cipher.index('near:testnet:me.testnet'))).toMatchObject(
      {
        person: 'prs_me',
        network: 'testnet',
      },
    );
    expect(await store.walletBinding.ofPerson('prs_me')).toHaveLength(2);
    await store.close();
  });

  test('a key that opens none of the person’s wallets writes nothing, unless a copy says so', async () => {
    const dir = await stateWith('near:mainnet:first.near');
    const args = ['--state', dir, '--person', 'prs_me', '--wallet', 'near:mainnet:me.near'];
    const other = { PETAL_WALLET_KEY: 'cd'.repeat(32) };
    await expect(run(args, other)).rejects.toThrow(/isn't the server's key/);
    await expect(run(args, {})).rejects.toThrow(/PETAL_WALLET_KEY must be set/);
    let store = openPrivateStore(dir);
    expect(await store.walletBinding.ofPerson('prs_me')).toHaveLength(1);
    await store.close();
    expect(await run([...args, '--key-unchecked'], other)).toContain('a copy');
    store = openPrivateStore(dir);
    expect(await store.walletBinding.ofPerson('prs_me')).toHaveLength(2);
    await store.close();
  });

  test('all or nothing: one wallet that’s someone else’s stops the rest', async () => {
    const dir = await stateWith('near:mainnet:first.near');
    const store = openPrivateStore(dir);
    await store.person.create({ id: 'prs_other', created_at: '2026-11-06T00:00:00.000Z' });
    await store.close();
    await expect(
      run(
        [
          '--state',
          dir,
          '--person',
          'prs_other',
          '--wallet',
          'near:mainnet:new.near',
          '--wallet',
          'near:mainnet:first.near',
        ],
        { ...env, PETAL_WALLET_KEY: KEY },
      ),
    ).rejects.toThrow(/already belongs to prs_me/);
    const after = openPrivateStore(dir);
    expect(await after.walletBinding.byHash(cipher.index('near:mainnet:new.near'))).toBeNull();
    await after.close();
  });
});
