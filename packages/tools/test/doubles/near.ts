// Doubles for @petal/near (W3 stubs): mapKeys, issueNonce and verifyNep413. The signature check
// is W0's signatureMatches from @petal/near/auth/testing (allowed in tests); the access key is
// checked with the context's RPC, as the real verifyNep413 does. See fallback.ts.
import type { Nep413Proof } from '@petal/core/types';
import type { AccessKeyView, Rpc } from '@petal/near/auth';
import { signatureMatches } from '@petal/near/auth/testing';
import { realOrFake, realOrFakeAll } from './fallback.ts';

type Auth = typeof import('@petal/near/auth');
type MapMod = typeof import('@petal/near/map');

export const fakeKeys: MapMod['mapKeys'] = {
  spec: (id) => `petal/v1/spec/${id}`,
  snapshot: (sha256) => `petal/v1/snapshot/${sha256}`,
  index: (caip2, population, block) => `petal/v1/index/${caip2}/${population}/${block}`,
  label: (caip2, address) => `petal/v1/label/${caip2}/${address}`,
  correction: (flowerId, id) => `petal/v1/correction/${flowerId}/${id}`,
  vouch: (account) => `petal/v1/vouch/${account}`,
};

const used = new Set<string>();

function fakeIssueNonce(): { nonce: string; expires_at: string } {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return {
    nonce: Buffer.from(bytes).toString('base64'),
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  };
}

async function fakeVerifyNep413(
  proof: Nep413Proof,
  expect: { message: string; recipient: string },
  rpc: Rpc,
): Promise<{ ok: boolean; reason?: string }> {
  if (proof.message !== expect.message || proof.recipient !== expect.recipient) {
    return { ok: false, reason: 'message or recipient differs' };
  }
  if (!signatureMatches(proof, expect)) return { ok: false, reason: 'bad signature' };
  if (used.has(proof.nonce)) return { ok: false, reason: 'nonce already used' };
  let view: AccessKeyView;
  try {
    view = await rpc.query<AccessKeyView>({
      request_type: 'view_access_key',
      finality: 'final',
      account_id: proof.account_id,
      public_key: proof.public_key,
    });
  } catch (err) {
    if ((err as { type?: string }).type === 'AccessKeyDoesNotExist') {
      return { ok: false, reason: 'no such key on the account' };
    }
    throw err;
  }
  if (view.permission !== 'FullAccess') return { ok: false, reason: 'not a full-access key' };
  used.add(proof.nonce);
  return { ok: true };
}

export function mockAuth(auth: Auth): Auth {
  return {
    ...auth,
    issueNonce: realOrFake(auth.issueNonce, fakeIssueNonce),
    verifyNep413: realOrFake(auth.verifyNep413, fakeVerifyNep413),
  };
}

export function mockMap(map: MapMod): MapMod {
  return { ...map, mapKeys: realOrFakeAll(map.mapKeys, fakeKeys) };
}
