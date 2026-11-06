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

function stateWith(wallet: string) {
  const stateDir = mkdtempSync(join(tmpdir(), 'petal-bind-'));
  const store = openPrivateStore(stateDir);
  const at = '2026-11-06T00:00:00.000Z';
  store.person.create({ id: 'prs_me', created_at: at });
  store.walletBinding.bind({
    person: 'prs_me',
    network: wallet.split(':')[1] as string,
    caip10_encrypted: cipher.seal(wallet),
    caip10_hash: cipher.index(wallet),
    proved_at: at,
  });
  store.close();
  return stateDir;
}

describe('bind-wallet', () => {
  test('adds wallets a sign-in finds, once, and prints no key', () => {
    const dir = stateWith('near:mainnet:first.near');
    const args = ['--state', dir, '--person', 'prs_me', '--wallet', 'near:testnet:me.testnet'];
    const out = run(args, env);
    expect(out).toContain('near:testnet:me.testnet: bound');
    expect(out).toContain('near:mainnet:first.near');
    expect(out).not.toContain(KEY);
    expect(run(args, env)).toContain("near:testnet:me.testnet: already this person's");
    const store = openPrivateStore(dir);
    expect(store.walletBinding.byHash(cipher.index('near:testnet:me.testnet'))).toMatchObject({
      person: 'prs_me',
      network: 'testnet',
    });
    expect(store.walletBinding.ofPerson('prs_me')).toHaveLength(2);
    store.close();
  });

  test('a key that opens none of the person’s wallets writes nothing, unless a copy says so', () => {
    const dir = stateWith('near:mainnet:first.near');
    const args = ['--state', dir, '--person', 'prs_me', '--wallet', 'near:mainnet:me.near'];
    const other = { PETAL_WALLET_KEY: 'cd'.repeat(32) };
    expect(() => run(args, other)).toThrow(/isn't the server's key/);
    expect(() => run(args, {})).toThrow(/PETAL_WALLET_KEY must be set/);
    let store = openPrivateStore(dir);
    expect(store.walletBinding.ofPerson('prs_me')).toHaveLength(1);
    store.close();
    expect(run([...args, '--key-unchecked'], other)).toContain('a copy');
    store = openPrivateStore(dir);
    expect(store.walletBinding.ofPerson('prs_me')).toHaveLength(2);
    store.close();
  });

  test('all or nothing: one wallet that’s someone else’s stops the rest', () => {
    const dir = stateWith('near:mainnet:first.near');
    const store = openPrivateStore(dir);
    store.person.create({ id: 'prs_other', created_at: '2026-11-06T00:00:00.000Z' });
    store.close();
    expect(() =>
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
    ).toThrow(/already belongs to prs_me/);
    const after = openPrivateStore(dir);
    expect(after.walletBinding.byHash(cipher.index('near:mainnet:new.near'))).toBeNull();
    after.close();
  });
});
