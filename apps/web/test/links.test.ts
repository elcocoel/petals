// The draft link (/draft?spec=) and the publish page's targets (/publish/[draft]).
import type { Spec } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { decodeDraft, draftUrl, encodeDraft } from '../lib/draft.ts';
import data from '../lib/mock/near-validators.json' with { type: 'json' };
import { DEFAULT_RECIPIENT, proofFrom, publishMessage, publishTarget } from '../lib/publish.ts';

const spec = data.spec as unknown as Spec;

describe('draft links', () => {
  test('a spec survives the round trip, with non-ASCII text', () => {
    const s = {
      ...spec,
      selection: { ...spec.selection, tail: { group: true, label: 'tous les autres — ñ' } },
    };
    const back = decodeDraft(encodeDraft(s));
    expect(back).toEqual({ ok: true, spec: s });
  });
  test('the link is URL-safe', () => {
    expect(draftUrl(spec)).toMatch(/^\/draft\?spec=[A-Za-z0-9_-]+$/);
  });
  test('plain JSON works too', () => {
    expect(decodeDraft(JSON.stringify(spec))).toEqual({ ok: true, spec });
  });
  test('garbage and non-specs are refused', () => {
    expect(decodeDraft('%%%').ok).toBe(false);
    expect(decodeDraft(encodeDraft({ petal: 'flower/v1' } as unknown as Spec)).ok).toBe(false);
  });
});

describe('publish targets', () => {
  const sha = 'a'.repeat(64);
  test('a run id', () => {
    expect(publishTarget('run_0123abcd', {})).toEqual({ kind: 'run', run_id: 'run_0123abcd' });
  });
  test('a sign_url: entry hash plus nonce; the message follows shared-map.md', () => {
    const t = publishTarget(sha, { nonce: 'bm9uY2U=', expires_at: '2026-11-04T20:00:00Z' });
    expect(t).toEqual({
      kind: 'prepared',
      prepared: {
        entry_sha256: sha,
        nonce: 'bm9uY2U=',
        recipient: DEFAULT_RECIPIENT,
        message: `{"petal":"publish/v1","entry_sha256":"${sha}"}`,
        expires_at: '2026-11-04T20:00:00Z',
      },
    });
  });
  test('an entry hash without a nonce, or junk, is refused', () => {
    expect(publishTarget(sha, {}).kind).toBe('bad');
    expect(publishTarget('../etc', {}).kind).toBe('bad');
  });
  test('a wallet signature becomes a NEP-413 proof over the prepared message', () => {
    const p = {
      entry_sha256: sha,
      nonce: 'n',
      recipient: 'petals.testnet',
      message: publishMessage(sha),
      expires_at: '',
    };
    expect(
      proofFrom({ accountId: 'maker.testnet', publicKey: 'ed25519:K', signature: 'c2ln' }, p),
    ).toEqual({
      type: 'nep413',
      account_id: 'maker.testnet',
      public_key: 'ed25519:K',
      signature: 'c2ln',
      message: p.message,
      nonce: 'n',
      recipient: 'petals.testnet',
    });
  });
});
