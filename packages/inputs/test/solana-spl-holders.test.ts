// T158: the stored TRUMP and MELANIA snapshots and their check, and the whole pull on a small real
// mint, offline from recordings. The check: wallets sum to getTokenSupply, any difference stated.
import { computeFigures, validateSnapshot } from '@petal/core';
import type { Snapshot } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { InputError } from '../src/errors.ts';
import { fromBaseUnits } from '../src/import/spike.ts';
import { modules } from '../src/index.ts';
import {
  holderScanRequest,
  pullSplHolders,
  SOLANA_CHAIN,
  SOLANA_OFFICIAL,
  SOLANA_VIBE_STATION,
  SPL_DESCRIPTOR,
  splMint,
  TOKEN_PROGRAM,
} from '../src/modules/solana-spl-holders.ts';
import { replayFetch } from '../src/rpc/recording.ts';
import { encodeSnapshot } from '../src/store/file-store.ts';
import { loadRecording, noSleep, rowFor, storedSnapshot } from './helpers/recordings.ts';
import { MELANIA, SMALL_MINT, TRUMP } from './helpers/targets.ts';

const small = loadRecording('solana-spl-test');

type SupplyFile = { result: { context: { slot: number }; value: { amount: string } } };

/** The supply reads kept with a token's recording: before (from the dump) and after the scan. */
function supplyReads(network: string) {
  const rec = loadRecording(network);
  const after = rec.calls.find((c) => c.request.method === 'getTokenSupply')
    ?.response as SupplyFile;
  return {
    before: BigInt((rec.supply_before as SupplyFile).result.value.amount),
    after: BigInt(after.result.value.amount),
  };
}

const sumRaw = (s: Snapshot) => s.holdings.reduce((a, h) => a + BigInt(h.amount_raw ?? '0'), 0n);

describe.each([
  {
    name: 'solana-spl-trump',
    symbol: 'TRUMP',
    params: TRUMP,
    wallets: 691983,
    accounts: 1949263,
    top1: 0.718133,
    difference: 9463189n,
  },
  {
    name: 'solana-spl-melania',
    symbol: 'MELANIA',
    params: MELANIA,
    wallets: 222279,
    accounts: 639927,
    top1: 0.300001,
    difference: 0n,
  },
])(
  '$symbol as the test parameter, stored',
  ({ name, symbol, params, wallets, accounts, top1, difference }) => {
    const row = rowFor('solana-spl-holders', params);
    const s = storedSnapshot(row);

    test('is registered, takes its target as a parameter, and is valid', async () => {
      const mod = modules['solana-spl-holders'];
      if (!mod) throw new Error('not registered');
      expect(mod.descriptor).toBe(SPL_DESCRIPTOR);
      expect(mod.descriptor).toMatchObject({ chain: SOLANA_CHAIN, live: true });
      expect(mod.descriptor.params.mint?.required).toBe(true);
      expect(mod.keyFor?.(params).population).toBe(row.population);
      expect(validateSnapshot(s).ok).toBe(true);
      const at = await mod.resolveAt('latest', params);
      expect(at.block_height).toBe(s.snapshot.block_height);
      expect(encodeSnapshot(await mod.fetch(at, params)).sha256).toBe(row.sha256);
    });

    test('check: the folded total against getTokenSupply, the difference stated', () => {
      const { before, after } = supplyReads(name);
      const total = sumRaw(s);
      expect(fromBaseUnits(total, 6)).toBe(s.coverage.amount_total);
      expect(total - before).toBe(difference);
      const note = s.coverage.note ?? '';
      if (difference === 0n) {
        expect(total).toBe(before);
        expect(note).toMatch(/equal to the supply/);
      } else {
        const abs = fromBaseUnits(difference, 6);
        expect(note).toContain(`${abs} above the supply`);
        expect(note).toMatch(/cause is not established/);
      }
      expect(note).toContain(fromBaseUnits(before, 6));
      if (before !== after) expect(note).toContain(fromBaseUnits(after, 6));
    });

    test('participants are wallets; the tail is declared and adds up', () => {
      const { coverage } = s;
      expect(coverage).toMatchObject({
        participants_total: wallets,
        participants_included: wallets,
        unit: symbol,
        measure: 'token_balance',
      });
      expect(coverage.note).toContain(`${accounts.toLocaleString('en-US')} token accounts`);
      const kept = s.participants.filter((p) => p.kind !== 'group');
      const bands = s.participants.filter((p) => p.kind === 'group');
      expect(kept).toHaveLength(1000);
      const folded = bands.reduce((a, b) => a + (b.count ?? 0), 0);
      expect(kept.length + folded).toBe(wallets);
      expect(coverage.grouped).toHaveLength(1);
      expect(coverage.grouped?.[0]?.rows_folded).toBe(folded);
      const bandIds = new Set(bands.map((b) => b.id));
      const bandSum = s.holdings
        .filter((h) => bandIds.has(h.participant))
        .reduce((a, h) => a + BigInt(h.amount_raw ?? '0'), 0n);
      expect(fromBaseUnits(bandSum, 6)).toBe(coverage.grouped?.[0]?.amount);
    });

    test('no band outranks a wallet, so the top petals and top-k are exact', () => {
      const f = computeFigures(s, { measure: 'token_balance', petals: 60, topK: [1, 20, 1000] });
      expect(f.participants_total).toBe(wallets);
      expect(f.shares[0]?.share).toBeCloseTo(top1, 4);
      for (const row of f.shares) expect(row.id.startsWith('group:')).toBe(false);
      const byId = new Map(s.participants.map((p) => [p.id, p]));
      const raw = s.holdings
        .map((h) => ({ id: h.participant, v: BigInt(h.amount_raw ?? '0') }))
        .sort((a, b) => (a.v > b.v ? -1 : a.v < b.v ? 1 : 0));
      const firstBand = raw.findIndex((r) => byId.get(r.id)?.kind === 'group');
      expect(firstBand).toBeGreaterThanOrEqual(1000);
    });

    test('carries no name, and says what is not known', () => {
      for (const p of s.participants) expect(p.identity).toBeNull();
      expect(new Set(s.participants.map((p) => p.kind))).toEqual(
        new Set(['contract', 'unknown', 'group']),
      );
      const note = s.coverage.note ?? '';
      expect(note).toMatch(/no launch history/);
      expect(note).toMatch(/launch-day holdings and early buyers are not shown/);
      expect(note).toMatch(/Not known: who controls a wallet/);
      expect(note).not.toMatch(/insider|team wallet|dump|rug|locked/i);
    });

    test('names the provider that answered', () => {
      const scan = s.sources.find((x) => x.id === 'spl-token-accounts');
      expect(scan).toMatchObject({
        url: SOLANA_VIBE_STATION,
        block_height: s.snapshot.block_height,
      });
      expect(s.module.imported_from).toMatch(/hero-spike/);
      expect(s.sources.find((x) => x.id === 'spl-token-supply')?.url).toBe(SOLANA_OFFICIAL);
    });
  },
);

describe('pullSplHolders, offline on a small real mint', () => {
  const scanKey = JSON.stringify(JSON.parse(holderScanRequest(SMALL_MINT)).params);
  const recordedScan = small.calls.find((c) => c.request.method === 'getProgramAccounts');
  if (!recordedScan) throw new Error('no scan in the recording');
  const pull = (rec = small, extra = {}) =>
    pullSplHolders(SMALL_MINT, { fetch: replayFetch(rec).fetch, sleep: noSleep, ...extra });

  test('the scan asks only for owner and amount of this mint', () => {
    expect(JSON.parse(scanKey)[0]).toBe(TOKEN_PROGRAM);
    expect(JSON.parse(scanKey)[1]).toMatchObject({
      commitment: 'finalized',
      dataSlice: { offset: 32, length: 40 },
      withContext: true,
    });
    expect(recordedScan.request.params).toEqual(JSON.parse(scanKey));
  });

  test('reads every wallet and passes the check, from the official RPC', async () => {
    const { snapshot, checks } = await pull();
    expect(checks).toMatchObject({ token_accounts: 404, wallets: 401, difference_raw: '0' });
    expect(checks.sum_raw).toBe(checks.supply_before_raw);
    expect(validateSnapshot(snapshot).ok).toBe(true);
    expect(snapshot.participants).toHaveLength(snapshot.holdings.length);
    expect(snapshot.sources.find((x) => x.id === 'spl-token-accounts')?.url).toBe(SOLANA_OFFICIAL);
    expect(snapshot.module.imported_from).toBeUndefined();
    expect(snapshot.coverage.note).toMatch(/equal to the supply/);
  });

  test('folds below the kept rank and declares it', async () => {
    const { snapshot } = await pull(small, { keep: 150 });
    expect(snapshot.participants.filter((p) => p.kind !== 'group')).toHaveLength(150);
    expect(snapshot.coverage.grouped?.[0]?.rows_folded).toBe(251);
    expect(snapshot.coverage.participants_included).toBe(401);
    expect(fromBaseUnits(sumRaw(snapshot), 6)).toBe(snapshot.coverage.amount_total);
    expect(validateSnapshot(snapshot).ok).toBe(true);
  });

  test('moves to the next endpoint when the first refuses or stops early', async () => {
    const replay = replayFetch(small);
    const body = JSON.stringify(recordedScan.response);
    for (const first of [
      () => new Response('rate limited', { status: 429 }),
      () => new Response(body.slice(0, 2000), { status: 200 }),
      () => new Response(JSON.stringify({ error: { code: -32010, message: 'no' } })),
    ]) {
      const fetch: typeof globalThis.fetch = async (url, init) => {
        const isScan = String(init?.body).includes('getProgramAccounts');
        if (isScan && String(url) === SOLANA_OFFICIAL) return first();
        return replay.fetch(url, init);
      };
      const { snapshot } = await pullSplHolders(SMALL_MINT, { fetch, sleep: noSleep });
      expect(snapshot.sources.find((x) => x.id === 'spl-token-accounts')?.url).toBe(
        SOLANA_VIBE_STATION,
      );
    }
  });

  test('stops a scan over the size budget, and does not try the next endpoint', async () => {
    const urls: string[] = [];
    const replay = replayFetch(small);
    const fetch: typeof globalThis.fetch = async (url, init) => {
      if (String(init?.body).includes('getProgramAccounts')) urls.push(String(url));
      return replay.fetch(url, init);
    };
    await expect(
      pullSplHolders(SMALL_MINT, { fetch, sleep: noSleep, maxBytes: 1000 }),
    ).rejects.toMatchObject({
      code: 'cannot_read',
      hint: expect.stringContaining('pull-module.ts --full'),
    });
    expect(urls).toEqual([SOLANA_OFFICIAL]);
  });

  test('takes any mint as a parameter', () => {
    expect(splMint({ mint: SMALL_MINT })).toBe(SMALL_MINT);
    for (const params of [undefined, { mint: 'not a key' }])
      expect(() => splMint(params)).toThrow(/needs a mint/);
  });

  test('names every endpoint when none answers', async () => {
    const replay = replayFetch(small);
    const fetch: typeof globalThis.fetch = async (url, init) =>
      String(init?.body).includes('getProgramAccounts')
        ? new Response('no', { status: 403 })
        : replay.fetch(url, init);
    const err = (await pullSplHolders(SMALL_MINT, { fetch, sleep: noSleep }).catch(
      (e) => e,
    )) as InputError;
    expect(err).toBeInstanceOf(InputError);
    expect(err.code).toBe('source_failed');
    expect(err.hint).toContain(SOLANA_OFFICIAL);
    expect(err.hint).toContain(SOLANA_VIBE_STATION);
  });

  test('a sum far from the supply is a broken read and throws', async () => {
    const rec = structuredClone(small);
    for (const c of rec.calls)
      if (c.request.method === 'getTokenSupply')
        (c.response as { result: { value: { amount: string } } }).result.value.amount =
          '900000000000000';
    await expect(pull(rec)).rejects.toThrow(/too far apart/);
  });

  test('refuses a mint outside the classic Token Program', async () => {
    const rec = structuredClone(small);
    for (const c of rec.calls)
      if (c.request.method === 'getAccountInfo')
        (c.response as { result: { value: { owner: string } } }).result.value.owner =
          'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
    await expect(pull(rec)).rejects.toMatchObject({
      code: 'cannot_read',
      hint: expect.stringContaining('Token-2022'),
    });
  });
});
