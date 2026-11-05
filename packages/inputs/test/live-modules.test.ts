// The Ethereum and Solana modules against their real public sources. Off unless PETAL_LIVE=1;
// everything else in this package runs offline from recordings.
import { validateSnapshot } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { evmReader } from '../src/evm/reader.ts';
import { BEANSTALK_ATTACK, pullBeanstalk, readBeanstalkList } from '../src/modules/beanstalk.ts';
import { BANK_ETHEREUM, pullErc20Holders, SEAM_BASE } from '../src/modules/erc20-holders.ts';
import { checkGetVotes, ENS_TOKEN, VOTES_CHECKED } from '../src/modules/erc20-votes.ts';
import { MOLOCH_V1_BLOCK, pullMolochV1 } from '../src/modules/moloch-v1.ts';
import { pullSplHolders } from '../src/modules/solana-spl-holders.ts';
import { indexRows, storedSnapshot } from './helpers/recordings.ts';

describe.skipIf(process.env.PETAL_LIVE !== '1')('live modules (PETAL_LIVE=1)', () => {
  test('moloch-v1: about 12 calls, the same members as the fixture', {
    timeout: 120_000,
  }, async () => {
    const reader = evmReader();
    const { snapshot, checks } = await pullMolochV1({ reader });
    expect(checks.mismatches).toEqual([]);
    expect(checks.head_mismatches).toEqual([]);
    expect(validateSnapshot(snapshot).ok).toBe(true);
    expect(snapshot.snapshot.block_height).toBe(MOLOCH_V1_BLOCK);
    const stored = indexRows('moloch-v1')[0];
    if (!stored) throw new Error('no stored moloch-v1 snapshot');
    expect(snapshot.holdings).toEqual(storedSnapshot(stored).holdings);
  });

  test('beanstalk: about 22 calls, 79.63% again', { timeout: 180_000 }, async () => {
    const reader = evmReader();
    const list = await readBeanstalkList(reader);
    const { checks } = await pullBeanstalk({ reader, block: BEANSTALK_ATTACK, list });
    expect(checks.largest_share).toBe('79.63');
  });

  test('ens-delegates: getVotes at the stored block, 1 call', { timeout: 60_000 }, async () => {
    const row = indexRows('ens-delegates')[0];
    if (!row) throw new Error('no stored ens-delegates snapshot');
    const s = storedSnapshot(row);
    const check = await checkGetVotes(
      evmReader(),
      ENS_TOKEN,
      row.block_height as number,
      s.holdings.slice(0, VOTES_CHECKED).map((h) => ({
        address: h.participant,
        votes: BigInt(h.amount_raw ?? '0'),
      })),
    );
    expect(check.mismatches).toEqual([]);
  });

  test('erc20-holders: a week of logs on Ethereum, a few calls', { timeout: 120_000 }, async () => {
    const { snapshot, checks } = await pullErc20Holders(BANK_ETHEREUM, {});
    expect(checks.window?.days).toBe(7);
    expect(checks.drawn_vs_supply_raw).toBe('0');
    expect(validateSnapshot(snapshot).ok).toBe(true);
  });

  test('erc20-holders: a whole history on Base without a token is refused', {
    timeout: 60_000,
  }, async () => {
    const token = process.env.ENVIO_API_TOKEN;
    delete process.env.ENVIO_API_TOKEN;
    try {
      await expect(pullErc20Holders(SEAM_BASE, { full: true })).rejects.toMatchObject({
        code: 'cannot_read',
      });
    } finally {
      if (token) process.env.ENVIO_API_TOKEN = token;
    }
  });

  test('solana-spl-holders: a small mint, under 1 MB, through the official RPC', {
    timeout: 120_000,
  }, async () => {
    const { snapshot, checks } = await pullSplHolders({
      id: 'solana-spl-test',
      symbol: 'TEST',
      mint: 'DfXhF62rZowkpcrw4j4RN1Y41XwgYoAXHvxNiAJWwUBL',
      title: 'Test token holders',
      population: 'test-holders',
    });
    expect(checks.wallets).toBeGreaterThan(0);
    expect(validateSnapshot(snapshot).ok).toBe(true);
  });
});
