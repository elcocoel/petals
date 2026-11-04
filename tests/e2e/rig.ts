// The parts of the recorded end-to-end run (T071) that petalApp's fake mode cannot make itself.
// Fake mode already gives the recorded agent (recordedClient), the fake map, the recorded dry
// quote and the fixture store. This adds the rest the task names:
//   - the test NEP-413 signer, through a fake RPC that knows its keys (maker.testnet has one
//     full-access key and one function-call key), so publish can verify a proof offline;
//   - the recorded House of Stake answers, behind the real module and a real RPC pool;
//   - a fake map the test holds, so it can read back what was written.
// skeleton.test.ts wraps @petal/tools' createContext with withRecordedParts (vi.mock), so the
// app under test is the real petalApp with only these parts swapped.
import { fakeRpcFor, testSigner } from '@petal/near/auth/testing';
import { fakeMap } from '@petal/near/map';
import type { ToolContext } from '@petal/tools';
import { recordedHouseOfStake } from './helpers.ts';

export const signer = testSigner('maker.testnet');
/** another key of maker.testnet, a function-call key only: it may not publish */
export const fcSigner = testSigner('maker.testnet', 'maker.testnet/function-call');
export const map: ReturnType<typeof fakeMap> = fakeMap();
export const hos = recordedHouseOfStake();
export const rpc = fakeRpcFor([signer, fcSigner], [fcSigner]);

export function withRecordedParts(ctx: ToolContext): ToolContext {
  return {
    ...ctx,
    modules: { ...ctx.modules, 'near-house-of-stake': hos.module },
    map: { reader: map, writer: map, receiver: map.receiver, trustedWriters: [map.writer] },
    rpc,
  };
}
