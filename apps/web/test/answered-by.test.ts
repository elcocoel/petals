// T168: /make says which model answered and whether the answer has an enclave signature. NEAR AI
// gave a model without attestation a `gateway` signature when asked live on 2026-11-05.
import type { ModelSignature } from '@petal/core/types';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { AnsweredBy } from '../components/chat/AnsweredBy.tsx';
import type { Done } from '../lib/thread.ts';
import { answeredBy } from '../lib/thread-view.ts';

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
  renderToStaticMarkup(createElement(AnsweredBy, { line: answeredBy(d, s) }));

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

  // What the component rendered before T178 moved its decisions into thread-view.ts, byte for byte.
  test.each([
    [
      done({ model: 'm/x' }),
      sig('provider_tee'),
      '<p data-quiet="true" class="type-mono-small wrap-anywhere text-muted">Answered by <code>m/x</code>. Enclave signature: yes (provider_tee, signer <code>0xabc</code>, <a href="/api/v1/attestations/r">attestation report</a>). 2 model calls, $0.0123.</p>',
    ],
    [
      done({ model: 'm/x' }),
      { signature_kind: 'provider_tee', signing_address: '0xabc' } as ModelSignature,
      '<p data-quiet="true" class="type-mono-small wrap-anywhere text-muted">Answered by <code>m/x</code>. Enclave signature: yes (provider_tee, signer <code>0xabc</code>). 2 model calls, $0.0123.</p>',
    ],
    [
      done({ model: 'm/x' }),
      sig('gateway'),
      '<p data-quiet="true" class="type-mono-small wrap-anywhere text-muted">Answered by <code>m/x</code>. Enclave signature: no. It has only a gateway signature, which does not prove which model answered. 2 model calls, $0.0123.</p>',
    ],
    [
      done({ model: 'm/x' }),
      null,
      '<p data-quiet="true" class="type-mono-small wrap-anywhere text-muted">Answered by <code>m/x</code>. Enclave signature: no. NEAR AI gave no signature for this answer, so nothing proves which model wrote it. Only models with enclave attestation get one. 2 model calls, $0.0123.</p>',
    ],
    [
      done({ model: 'm/x', fallback_used: true }),
      sig('provider_tee'),
      '<p data-quiet="true" class="type-mono-small wrap-anywhere text-muted">Answered by <code>m/x</code> (a fallback: the first-choice model did not answer). Enclave signature: yes (provider_tee, signer <code>0xabc</code>, <a href="/api/v1/attestations/r">attestation report</a>). 2 model calls, $0.0123.</p>',
    ],
    [
      done({ model: 'm/x', turns: 1, cost_usd: 0 }),
      null,
      '<p data-quiet="true" class="type-mono-small wrap-anywhere text-muted">Answered by <code>m/x</code>. Enclave signature: no. NEAR AI gave no signature for this answer, so nothing proves which model wrote it. Only models with enclave attestation get one. 1 model call, $0.0000.</p>',
    ],
    [
      done({ model: 'recorded' }),
      null,
      '<p data-quiet="true" class="type-mono-small wrap-anywhere text-muted">Recorded run: no model answered just now.</p>',
    ],
    [
      done({ turns: 0 }),
      null,
      '<p data-quiet="true" class="type-mono-small wrap-anywhere text-muted">No model answered.</p>',
    ],
  ])('renders what it always rendered (%#)', (d, s, markup) => {
    expect(text(d, s)).toBe(markup);
  });

  test('recorded and unanswered chats name no model', () => {
    expect(text(done({ model: 'recorded' }), null)).toContain('Recorded run');
    expect(text(done({ turns: 0 }), null)).toContain('No model answered');
  });
});
