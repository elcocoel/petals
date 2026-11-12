// Petals' own agent reads the brain as needed (research/brain-departments-2026-11-11.md, step 10): brain_context is
// one of its tools, and each read it makes gets a receipt like everyone else's, with its run in consumer_context.
import { join } from 'node:path';
import { type BrainReceipt, registry } from '@petal/tools';
import { describe, expect, test } from 'vitest';
import { runAgent } from '../src/index.ts';
import { DEFAULT_BUDGET } from '../src/llm.ts';
import { llmTools } from '../src/tool-defs.ts';
import { collect, fakeContext, scriptedLlm } from './helpers.ts';

const BRAIN = join(import.meta.dirname, '..', '..', '..', 'brain');

describe("Petals' agent reads the brain", () => {
  test('brain_context is one of its tools, and its read is kept with its run', async () => {
    expect(llmTools(registry).map((t) => t.name)).toContain('brain_context');
    const kept: BrainReceipt[] = [];
    const base = fakeContext();
    const tools = {
      ...base,
      config: { ...base.config, brainDir: BRAIN },
      onBrainServed: async (r: BrainReceipt) => void kept.push(r),
    };
    const llm = scriptedLlm([
      { calls: [{ name: 'brain_context', args: { question: 'when do these tokens unlock' } }] },
      { content: 'They unlock on the schedule the vesting chapter says to read.' },
    ]);
    const es = await collect(
      runAgent(
        { messages: [{ role: 'user', content: 'when do these tokens unlock?' }] },
        { tools, llm, budget: DEFAULT_BUDGET },
      ),
    );
    const run = es.find((e) => e.event === 'run')?.data as { run_id: string };
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({
      core_doctrine: true,
      consumer_context: { run: run.run_id },
    });
    expect(kept[0]?.served_docs).toContain('vesting');
  });
});
