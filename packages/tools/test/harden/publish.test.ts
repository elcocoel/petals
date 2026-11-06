// T300, finding 5: Petal's writer only publishes for an account that exists on chain, and only so many
// times a day, so a stranger with a fresh offline key can't spend the writer's allowance.
import { implicitSigner } from '@petal/near/auth/testing';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { callTool } from '../../src/registry.ts';
import { flow, rig, type TestRig } from '../helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Out = Record<string, any>;

let r: TestRig;
let f: Awaited<ReturnType<typeof flow>>;
const run = async (name: string, input: unknown) => (await callTool(name, input, r.ctx)) as Out;

beforeEach(async () => {
  r = await rig();
  f = await flow(run);
});

const prepared = (title: string) => run('prepare_publish', { entry: { ...f.draft, title } });
const proofOf = (p: Out, signer = r.signer) =>
  signer.sign({ message: p.message, nonce: p.nonce, recipient: p.recipient });

describe('publishing', () => {
  test('an unfunded implicit key, fine for sign-in, can’t make the writer publish', async () => {
    const write = vi.spyOn(r.map, 'write');
    const p = await prepared('from nowhere');
    const stranger = implicitSigner('offline-key');
    const out = await run('publish_flower', {
      entry_sha256: p.entry_sha256,
      proof: proofOf(p, stranger),
    });
    expect(out.error?.code).toBe('unauthorised');
    expect(write).not.toHaveBeenCalled();
  });

  test('a global daily cap on publishes, past the proof, before the writer', async () => {
    (r.ctx.config as Out).limits = { publishesPerDay: 2 };
    const write = vi.spyOn(r.map, 'write');
    for (const title of ['one', 'two']) {
      const p = await prepared(title);
      const out = await run('publish_flower', { entry_sha256: p.entry_sha256, proof: proofOf(p) });
      expect(out.error, title).toBeUndefined();
    }
    const p = await prepared('three');
    const out = await run('publish_flower', { entry_sha256: p.entry_sha256, proof: proofOf(p) });
    expect(out.error?.code).toBe('rate_limited');
    expect(out.error?.retry_after_s).toBeGreaterThan(0);
    expect(write).toHaveBeenCalledTimes(2);
    // a refused one isn't used up: its draft is still there for tomorrow
    r.clock.set('2026-11-05T00:00:01.000Z');
    const q = await prepared('three');
    const next = await run('publish_flower', { entry_sha256: q.entry_sha256, proof: proofOf(q) });
    expect(next.error).toBeUndefined();
  });

  test('a forged proof doesn’t use up the day’s publishes', async () => {
    (r.ctx.config as Out).limits = { publishesPerDay: 1 };
    const p = await prepared('forged');
    const proof = { ...proofOf(p, implicitSigner('forger')) };
    await run('publish_flower', { entry_sha256: p.entry_sha256, proof });
    const q = await prepared('real');
    const out = await run('publish_flower', { entry_sha256: q.entry_sha256, proof: proofOf(q) });
    expect(out.error).toBeUndefined();
  });
});
