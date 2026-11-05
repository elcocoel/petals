// The entry a maker publishes from a run: a real run keeps its model signature; a replay of the
// recorded run does not, because that signature was made for the original run, not for this entry.
import type { AgentEvent, FlowerResult, ModelSignature, Run } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { entryDraftFromRun } from '../lib/entry.ts';

const signature = { completion_id: 'chatcmpl-1', signature_kind: 'provider_tee' } as ModelSignature;
const flower = {
  spec: { snapshot: { sha256: 'a'.repeat(64) } },
  spec_sha256: 'b'.repeat(64),
  render_sha256: 'c'.repeat(64),
  interpretation: {},
} as unknown as FlowerResult;

const runOn = (model: string): Run =>
  ({
    run_id: 'r',
    status: 'done',
    messages: [{ role: 'user', content: 'who holds power?' }],
    flower,
    updated_at: '2026-11-05T12:00:00Z',
    events: [
      { event: 'signature', data: signature },
      {
        event: 'done',
        data: { turns: 7, model, fallback_used: false, tokens: { in: 0, out: 0 }, cost_usd: 0 },
      },
    ] satisfies AgentEvent[],
  }) as unknown as Run;

describe('entryDraftFromRun', () => {
  test('a real run publishes the signature of the completion that wrote it', () => {
    const agent = entryDraftFromRun(runOn('deepseek-ai/x'), 'http://x')?.provenance.agent;
    expect(agent).toMatchObject({ model: 'deepseek-ai/x', signature });
  });

  test('a replay says recorded and publishes no signature', () => {
    const agent = entryDraftFromRun(runOn('recorded'), 'http://x')?.provenance.agent;
    expect(agent).toMatchObject({ model: 'recorded', signature: null });
  });
});
