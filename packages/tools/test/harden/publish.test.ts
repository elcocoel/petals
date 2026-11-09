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
});
