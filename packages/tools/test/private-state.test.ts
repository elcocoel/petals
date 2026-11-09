// T189: nonces and publish drafts in the private store. Single use holds under concurrent calls and
// across a restart; a read-only tool never opens the store.
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createNonceStore,
  durableNonceStore,
  NONCE_TTL_MS,
  type Rpc,
  verifyNep413,
} from '@petal/near/auth';
import { fakeRpcFor, testSigner } from '@petal/near/auth/testing';
import { openStore, stateStore } from '@petal/store';
import { describe, expect, test } from 'vitest';
import { createContext } from '../src/context.ts';
import { draftStore, privateStore } from '../src/drafts.ts';
import { callTool } from '../src/registry.ts';
import type { ToolContext } from '../src/types.ts';
import { flow, REPO, rig } from './helpers.ts';

type Out = Record<string, unknown> & { error?: { code: string; message: string } };

const runner = (ctx: ToolContext) => async (name: string, input: unknown) =>
  (await callTool(name, input, ctx)) as Out;

async function prepared() {
  const r = await rig();
  const run = runner(r.ctx);
  const f = await flow(run);
  const prep = await run('prepare_publish', { entry: f.draft });
  const proof = r.signer.sign({
    message: prep.message as string,
    nonce: prep.nonce as string,
    recipient: prep.recipient as string,
  });
  return { r, run, f, prep, proof };
}

describe('durable nonces', () => {
  const message = 'hello';
  const recipient = 'petals.testnet';
  const expected = { message, recipient };
  const maker = testSigner('maker.testnet');
  const setup = () => {
    const path = join(mkdtempSync(join(tmpdir(), 'petal-nonce-')), 'private.db');
    return { path, store: openStore(path) };
  };

  test('one proof passes once, however many arrive together', async () => {
    const { store } = setup();
    const nonces = durableNonceStore(store.challenge);
    const { nonce } = await nonces.issue();
    const proof = maker.sign({ message, nonce, recipient });
    const rpc = fakeRpcFor([maker]);
    const out = await Promise.all(
      Array.from({ length: 10 }, () => verifyNep413(proof, expected, rpc, { nonces })),
    );
    expect(out.filter((c) => c.ok)).toHaveLength(1);
    expect(out.filter((c) => c.reason === 'the nonce was already used')).toHaveLength(9);
  });

  test('…and from two connections to one file, like two processes', async () => {
    const { path, store } = setup();
    const other = openStore(path);
    const a = durableNonceStore(store.challenge);
    const b = durableNonceStore(other.challenge);
    const { nonce } = await a.issue();
    const proof = maker.sign({ message, nonce, recipient });
    const rpc = fakeRpcFor([maker]);
    const out = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        verifyNep413(proof, expected, rpc, { nonces: i % 2 ? a : b }),
      ),
    );
    expect(out.filter((c) => c.ok)).toHaveLength(1);
    other.close();
  });

  test('a restart: an issued nonce still works, a used one stays used', async () => {
    const { path, store } = setup();
    const { nonce } = await durableNonceStore(store.challenge).issue();
    await store.close();

    const second = openStore(path);
    const proof = maker.sign({ message, nonce, recipient });
    const rpc = fakeRpcFor([maker]);
    expect(
      await verifyNep413(proof, expected, rpc, { nonces: durableNonceStore(second.challenge) }),
    ).toEqual({ ok: true });
    await second.close();

    const third = openStore(path);
    expect(
      await verifyNep413(proof, expected, rpc, { nonces: durableNonceStore(third.challenge) }),
    ).toEqual({ ok: false, reason: 'the nonce was already used' });
    third.close();
  });

  test('an RPC that cannot answer releases it, so the maker need not sign again', async () => {
    const { store } = setup();
    const nonces = durableNonceStore(store.challenge);
    const { nonce } = await nonces.issue();
    const proof = maker.sign({ message, nonce, recipient });
    const down: Rpc = {
      query: () => Promise.reject(new Error('rpc down')),
    };
    await expect(verifyNep413(proof, expected, down, { nonces })).rejects.toMatchObject({
      code: 'source_failed',
    });
    expect(await verifyNep413(proof, expected, fakeRpcFor([maker]), { nonces })).toEqual({
      ok: true,
    });
  });

  test('a store that is down refuses: the proof does not pass', async () => {
    const { store } = setup();
    const nonces = durableNonceStore(store.challenge);
    const { nonce } = await nonces.issue();
    await store.close();
    const proof = maker.sign({ message, nonce, recipient });
    await expect(verifyNep413(proof, expected, fakeRpcFor([maker]), { nonces })).rejects.toThrow();
  });

  test('it expires, and behaves like the in-memory form', async () => {
    const { store } = setup();
    let now = Date.parse('2026-11-05T12:00:00Z');
    const durable = durableNonceStore(store.challenge, NONCE_TTL_MS, () => now);
    const { nonce, expires_at } = await durable.issue();
    expect(Date.parse(expires_at)).toBe(now + NONCE_TTL_MS);
    expect(Buffer.from(nonce, 'base64')).toHaveLength(32);
    now += NONCE_TTL_MS;
    expect(await durable.reserve(nonce)).toBe('expired');

    for (const nonces of [durableNonceStore(store.challenge), createNonceStore()]) {
      const n = (await nonces.issue()).nonce;
      expect(await nonces.reserve('nope')).toBe('unknown');
      expect(await nonces.reserve(n)).toBe('ok');
      expect(await nonces.reserve(n)).toBe('used');
      await nonces.release(n);
      expect(await nonces.reserve(n)).toBe('ok');
      await nonces.spend(n);
      await nonces.release(n);
      expect(await nonces.reserve(n)).toBe('used');
    }
  });
});

describe('publish drafts', () => {
  test('one proof sent many times at once publishes once', async () => {
    const { r, run, prep, proof } = await prepared();
    const writes: unknown[] = [];
    const writer = r.ctx.map.writer;
    r.ctx.map.writer = {
      ...writer,
      write: (entries: Record<string, unknown>) => {
        writes.push(entries);
        return writer?.write(entries);
      },
    } as never;
    const out = await Promise.all(
      Array.from({ length: 8 }, () =>
        run('publish_flower', { entry_sha256: prep.entry_sha256, proof }),
      ),
    );
    expect(out.filter((o) => !o.error)).toHaveLength(1);
    expect(out.filter((o) => o.error?.code === 'unauthorised')).toHaveLength(7);
    expect(writes).toHaveLength(1);
  });

  test('prepared again while a publish is being checked: only one of them publishes', async () => {
    const { r, run, f, prep, proof } = await prepared();
    // Both proofs are good and each has its own nonce, so only the draft's used_at can stop this.
    const real = r.ctx.rpc;
    let open: () => void = () => {};
    const gate = new Promise<void>((ok) => {
      open = ok;
    });
    r.ctx.rpc = {
      query: async (q) => {
        await gate;
        return real.query(q);
      },
    } as Rpc;
    const first = run('publish_flower', { entry_sha256: prep.entry_sha256, proof });
    await new Promise((ok) => setTimeout(ok, 5));

    const again = await run('prepare_publish', { entry: f.draft });
    expect(again.nonce).not.toBe(prep.nonce);
    const second = run('publish_flower', {
      entry_sha256: prep.entry_sha256,
      proof: r.signer.sign({
        message: again.message as string,
        nonce: again.nonce as string,
        recipient: again.recipient as string,
      }),
    });
    await new Promise((ok) => setTimeout(ok, 5));
    open();

    const out = await Promise.all([first, second]);
    expect(out.filter((o) => !o.error)).toHaveLength(1);
    expect(out.find((o) => o.error)?.error).toMatchObject({
      code: 'unauthorised',
      message: 'This draft was already published; the nonce is used.',
    });
  });

  test('a restart: a published draft stays used, and a prepared one can still be signed', async () => {
    const a = await prepared();
    stateStore(a.r.stateDir).close();
    const pub = await a.run('publish_flower', {
      entry_sha256: a.prep.entry_sha256,
      proof: a.proof,
    });
    expect(pub.error).toBeUndefined();

    stateStore(a.r.stateDir).close();
    const again = await a.run('publish_flower', {
      entry_sha256: a.prep.entry_sha256,
      proof: a.proof,
    });
    expect(again.error).toMatchObject({
      code: 'unauthorised',
      message: 'This draft was already published; the nonce is used.',
    });
  });

  test('claim: true once, for many callers at once; a missing draft is false', async () => {
    const { r, prep } = await prepared();
    const drafts = draftStore(r.ctx.config);
    const sha = prep.entry_sha256 as string;
    const out = await Promise.all(
      Array.from({ length: 10 }, () => drafts.claim(sha, '2026-11-05T12:00:00.000Z')),
    );
    expect(out.filter(Boolean)).toHaveLength(1);
    expect((await drafts.get(sha))?.used_at).toBe('2026-11-05T12:00:00.000Z');
    expect(await drafts.claim('f'.repeat(64), '2026-11-05T12:00:00.000Z')).toBe(false);
    expect(await drafts.get('f'.repeat(64))).toBeNull();
  });

  test('drafts live in <stateDir>/private.db, with no public facts beside them', async () => {
    const { r } = await prepared();
    expect(existsSync(join(r.stateDir, 'private.db'))).toBe(true);
    expect(existsSync(join(r.stateDir, 'drafts'))).toBe(false);
    expect(privateStore(r.ctx.config).path).toBe(join(r.stateDir, 'private.db'));
    expect(existsSync(join(r.stateDir, 'cache'))).toBe(true);
  });
});

test('making a context and using a read-only tool never opens the store', async () => {
  const stateDir = mkdtempSync(join(tmpdir(), 'petal-ctx-'));
  const ctx = createContext({ root: REPO, stateDir, fake: true });
  const nets = (await callTool('list_networks', {}, ctx)) as { networks: unknown[] };
  expect(nets.networks.length).toBeGreaterThan(0);
  expect(existsSync(join(stateDir, 'private.db'))).toBe(false);
});
