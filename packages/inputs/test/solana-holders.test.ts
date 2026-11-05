// The holder scan: a real recorded answer cut every way a network can cut it, and the fold.
import { describe, expect, test } from 'vitest';
import { base58, foldHolders, scanHolders } from '../src/solana/holders.ts';
import { loadRecording } from './helpers/recordings.ts';

const recording = loadRecording('solana-spl-test');
const answer = recording.calls.find((c) => c.request.method === 'getProgramAccounts')?.response;
if (!answer) throw new Error('no holder scan in the recording');
const text = JSON.stringify(answer);
const bytes = Buffer.from(text);

async function* chunks(buf: Buffer, sizes: (i: number) => number): AsyncGenerator<Uint8Array> {
  let at = 0;
  for (let i = 0; at < buf.length; i++) {
    const n = sizes(i);
    yield buf.subarray(at, at + n);
    at += n;
  }
}

const accountJson = (owner: Buffer, amount: bigint) => {
  const a = Buffer.alloc(40);
  owner.copy(a);
  a.writeBigUInt64LE(amount, 32);
  return `{"pubkey":"x","account":{"lamports":1,"data":["${a.toString('base64')}","base64"],"owner":"T","space":165}}`;
};
const wrap = (accounts: string[], slot = 7) =>
  `{"jsonrpc":"2.0","result":{"context":{"slot":${slot},"apiVersion":"x"},"value":[${accounts.join(',')}]},"id":1}`;
const owner = (n: number) => Buffer.alloc(32, n);

describe('scanHolders', () => {
  const whole = () => scanHolders(chunks(bytes, () => bytes.length));

  test('reads a real answer: 404 accounts, 401 wallets, the slot', async () => {
    const r = await whole();
    expect(r).toMatchObject({ token_accounts: 404, wallets: expect.any(Map), bytes: bytes.length });
    expect(r.wallets.size).toBe(401);
    expect(r.slot).toBeGreaterThan(465_000_000);
  });

  test('gives the same totals however the bytes are cut', async () => {
    const want = await whole();
    const same = async (sizes: (i: number) => number) => {
      const r = await scanHolders(chunks(bytes, sizes));
      expect(r.token_accounts).toBe(want.token_accounts);
      expect(r.nonzero_accounts).toBe(want.nonzero_accounts);
      expect(r.wallets).toEqual(want.wallets);
    };
    await same(() => 1);
    await same(() => 7);
    await same((i) => (i % 2 ? 3 : 64));
    await same(() => 511);
    await same(() => 512);
    await same(() => 513);
    await same(() => 4096);
    // every cut point in the first records and a window further in
    for (let cut = 1; cut < 700; cut++) await same((i) => (i === 0 ? cut : bytes.length));
    for (let cut = 60_000; cut < 60_200; cut++) await same((i) => (i === 0 ? cut : bytes.length));
  });

  test('adds a wallet up across its token accounts and skips empty ones', async () => {
    const r = await scanHolders(
      chunks(
        Buffer.from(
          wrap([
            accountJson(owner(1), 5n),
            accountJson(owner(2), 0n),
            accountJson(owner(1), 7n),
            accountJson(owner(3), 2n ** 63n),
          ]),
        ),
        () => 50,
      ),
    );
    expect(r).toMatchObject({ slot: 7, token_accounts: 4, nonzero_accounts: 3 });
    expect([...r.wallets.values()]).toEqual([12n, 2n ** 63n]);
  });

  test('accepts an empty list', async () => {
    const r = await scanHolders(chunks(Buffer.from(wrap([])), () => 9));
    expect(r).toMatchObject({ slot: 7, token_accounts: 0 });
  });

  test('refuses an answer that stops early, wherever it stops', async () => {
    for (const end of [bytes.length - 12, bytes.length - 70, bytes.length - 300, 5000, 300]) {
      await expect(scanHolders(chunks(bytes.subarray(0, end), () => 256))).rejects.toThrow(
        /before its end/,
      );
    }
  });

  test('passes on a refusal in the endpoint words, and on other broken answers', async () => {
    const refusal = JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32010, message: 'excluded from account secondary indexes' },
      id: 1,
    });
    await expect(scanHolders(chunks(Buffer.from(refusal), () => 20))).rejects.toMatchObject({
      code: 'source_failed',
      message: expect.stringContaining('excluded from account secondary indexes'),
    });
    await expect(
      scanHolders(chunks(Buffer.from(`{"result":{"value":[]}}`), () => 99)),
    ).rejects.toThrow(/no slot/);
    await expect(
      scanHolders(chunks(Buffer.from(wrap(['{"account":{"data":["AAAA","base64"]}}'])), () => 99)),
    ).rejects.toThrow(/3 bytes/);
    await expect(
      scanHolders(chunks(Buffer.from(wrap(['{"account":{"data":["*AAA","base64"]}}'])), () => 99)),
    ).rejects.toThrow(/not base64/);
    await expect(scanHolders(chunks(Buffer.alloc(70_000, 0x20), () => 70_000))).rejects.toThrow(
      /no account list/,
    );
  });
});

describe('base58', () => {
  test('encodes public keys', () => {
    expect(base58(Buffer.alloc(32))).toBe('11111111111111111111111111111111');
    expect(
      base58(
        Buffer.from('06ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a9', 'hex'),
      ),
    ).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  });
});

describe('foldHolders', () => {
  const wallets = new Map<string, bigint>(
    [100n, 50n, 40n, 30n, 30n, 9n, 8n, 7n, 6n, 5n, 4n, 3n, 2n, 1n, 1n, 1n].map(
      (v, i) => [owner(i + 1).toString('latin1'), v] as const,
    ),
  );

  test('keeps the largest, folds the rest, loses nothing', () => {
    const f = foldHolders(wallets, 3);
    expect(f.top.map((w) => w.amount)).toEqual([100n, 50n, 40n]);
    expect(f.total).toBe(297n);
    const banded = f.bands.reduce((a, b) => a + b.amount, 0n);
    expect(banded).toBe(f.folded_amount);
    expect(f.top.reduce((a, w) => a + w.amount, 0n) + banded).toBe(f.total);
    expect(f.folded_wallets).toBe(13);
    expect(f.bands.reduce((a, b) => a + (b.to - b.from + 1), 0)).toBe(13);
  });

  test('bands are contiguous ranks, and no band outranks a wallet', () => {
    const f = foldHolders(wallets, 3);
    let next = 4;
    for (const b of f.bands) {
      expect(b.from).toBe(next);
      next = b.to + 1;
      expect(b.amount).toBeLessThanOrEqual(40n);
    }
    expect(next).toBe(17);
  });

  test('keeping everyone folds nothing; ties at the edge still add up', () => {
    const all = foldHolders(wallets, 100);
    expect(all.bands).toEqual([]);
    expect(all.top).toHaveLength(16);
    const tied = foldHolders(wallets, 4); // the fourth and fifth wallets both hold 30
    expect(tied.top.map((w) => w.amount)).toEqual([100n, 50n, 40n, 30n]);
    expect(tied.bands[0]?.from).toBe(5);
    expect(tied.top.reduce((a, w) => a + w.amount, 0n) + tied.folded_amount).toBe(tied.total);
  });
});
