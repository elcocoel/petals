// T168: /make says which model answered and whether the answer has an enclave signature. NEAR AI
// gave a model without attestation a `gateway` signature when asked live on 2026-11-05.
import type { ModelSignature } from '@petal/core/types';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { AnsweredBy } from '../components/Chat.tsx';
import type { Done } from '../lib/thread.ts';

const done = (o: Partial<Done> = {}): Done => ({
  turns: 2,
  model: 'deepseek-ai/DeepSeek-V4.1-Flash-1017',
  fallback_used: false,
  tokens: { in: 1, out: 1 },
  cost_usd: 0.0123,
  ...o,
});
const sig = (signature_kind: 'provider_tee' | 'gateway') =>
  ({
    signature_kind,
    signing_address: '0xabc',
    attestation: { report_url: '/api/v1/attestations/r' },
  }) as ModelSignature;
const text = (d: Done, s: ModelSignature | null) =>
  renderToStaticMarkup(createElement(AnsweredBy, { done: d, signature: s }));

describe('AnsweredBy', () => {
  test('a provider_tee answer names the model, the signer and the report', () => {
    const out = text(done(), sig('provider_tee'));
    expect(out).toContain('<code>deepseek-ai/DeepSeek-V4.1-Flash-1017</code>');
    expect(out).toContain('Enclave signature: yes');
    expect(out).toContain('href="/api/v1/attestations/r"');
  });

  test('a gateway signature is plainly not an enclave signature', () => {
    const out = text(done({ model: 'deepseek/deepseek-v4.1-flash-1017' }), sig('gateway'));
    expect(out).toContain('Enclave signature: no');
    expect(out).toContain('does not prove which model answered');
    expect(out).toContain('deepseek/deepseek-v4.1-flash-1017');
  });

  test('no signature at all says so', () => {
    expect(text(done(), null)).toContain('Enclave signature: no. NEAR AI gave no signature');
  });

  test('a fallback shows the model that really answered, and says it is one', () => {
    const out = text(
      done({ model: 'z-ai/glm-5.3-flash', fallback_used: true }),
      sig('provider_tee'),
    );
    expect(out).toContain('<code>z-ai/glm-5.3-flash</code>');
    expect(out).toContain('a fallback');
  });

  test('recorded and unanswered chats name no model', () => {
    expect(text(done({ model: 'recorded' }), null)).toContain('Recorded run');
    expect(text(done({ turns: 0 }), null)).toContain('No model answered');
  });
});
