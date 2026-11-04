// T057: runAgent on recordedClient and scripted models, with a fake registry (W4 builds the real
// one in parallel).
import type { AgentEvent } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { memoryLedger } from '../src/budget.ts';
import { runAgent } from '../src/index.ts';
import { type Budget, DEFAULT_BUDGET, type LlmClient } from '../src/llm.ts';
import { LlmCallError } from '../src/near-ai.ts';
import { recordedClient, SKELETON_TRANSCRIPT } from '../src/recorded.ts';
import { type RunOptions, SKILL_HINT, startRun } from '../src/run.ts';
import {
  collect,
  fakeContext,
  fakeRegistry,
  fakeSignature,
  INTERPRETATION,
  inOrder,
  RENDER_SHA,
  SPEC,
  SPEC_SHA,
  scriptedLlm,
  slowRecorded,
  VIEW_URL,
} from './helpers.ts';

const QUESTION = [{ role: 'user' as const, content: 'who stands behind NEAR’s validators?' }];

function run(
  llm: LlmClient,
  o: { budget?: Partial<Budget>; opts?: RunOptions; tools?: ReturnType<typeof fakeRegistry> } = {},
) {
  const tools = o.tools ?? fakeRegistry();
  const events = startRun(
    { messages: QUESTION },
    { tools: fakeContext(), llm, budget: { ...DEFAULT_BUDGET, ...o.budget } },
    { registry: tools.registry, runId: 'run_test_1', ...o.opts },
  );
  return { events, tools };
}

const names = (es: AgentEvent[]) => es.map((e) => e.event);
const pick = <N extends AgentEvent['event']>(es: AgentEvent[], n: N) =>
  es.filter((e): e is Extract<AgentEvent, { event: N }> => e.event === n);

/** A whole skeleton run, scripted, with a signature on every completion. */
function signedSkeleton(): ReturnType<typeof scriptedLlm> {
  return scriptedLlm([
    {
      calls: [{ name: 'get_snapshot', args: { network: 'near-validators' } }],
      signature: fakeSignature('c1'),
    },
    {
      calls: [
        {
          name: 'propose_spec',
          args: { network: 'near-validators', choices: { segments: 'backers' } },
        },
      ],
      signature: fakeSignature('c2'),
    },
    {
      calls: [{ name: 'validate_spec', args: { spec: SPEC, interpretation: INTERPRETATION } }],
      signature: fakeSignature('c3'),
    },
    { calls: [{ name: 'render_flower', args: { spec: SPEC } }], signature: fakeSignature('c4') },
    { content: `Here it is: ${VIEW_URL}`, signature: fakeSignature('c5') },
  ]);
}

describe('runAgent on the recorded skeleton run', () => {
  test('events: run first, done last, the quickstart tool order, then the flower', async () => {
    const { events, tools } = run(recordedClient(SKELETON_TRANSCRIPT));
    const es = await collect(events);
    const n = names(es);
    expect(n[0]).toBe('run');
    expect(n.at(-1)).toBe('done');
    expect(
      inOrder(n, ['run', 'stage', 'tool_call', 'tool_result', 'flower', 'message', 'done']),
    ).toBe(true);
    expect(pick(es, 'run')[0]?.data).toEqual({
      run_id: 'run_test_1',
      resume_url: '/make?run=run_test_1',
    });
    expect(pick(es, 'tool_call').map((e) => e.data.name)).toEqual([
      'get_snapshot',
      'describe_snapshot',
      'compute_figures',
      'propose_spec',
      'validate_spec',
      'render_flower',
    ]);
    expect(tools.calls.map((c) => c.name)).toEqual(pick(es, 'tool_call').map((e) => e.data.name));
    expect(pick(es, 'tool_result').every((e) => e.data.ok)).toBe(true);
    expect(n).not.toContain('error');
    // recorded: no signature to show ("recorded run, no signature")
    expect(n).not.toContain('signature');
    expect(pick(es, 'done')[0]?.data).toEqual({
      turns: 7,
      model: 'recorded',
      fallback_used: false,
      tokens: { in: 0, out: 0 },
      cost_usd: 0,
    });
  });

  test('stages follow the tools: fetching, counting, proposing, validating, drawing', async () => {
    const es = await collect(run(recordedClient(SKELETON_TRANSCRIPT)).events);
    // "thinking" sits between model calls, so a stage can come back after it: collapse repeats
    const stages = pick(es, 'stage')
      .map((e) => e.data.stage)
      .filter((s) => s !== 'thinking')
      .filter((s, i, all) => s !== all[i - 1]);
    expect(stages).toEqual(['fetching', 'counting', 'proposing', 'validating', 'drawing']);
    expect(pick(es, 'stage')[0]?.data.stage).toBe('thinking');
  });

  test('the flower carries the validated spec, the interpretation and the render', async () => {
    const es = await collect(run(recordedClient(SKELETON_TRANSCRIPT)).events);
    const flower = pick(es, 'flower')[0]?.data;
    expect(flower).toMatchObject({
      spec: SPEC,
      spec_sha256: SPEC_SHA,
      render_sha256: RENDER_SHA,
      view_url: VIEW_URL,
      validation: { valid: true, errors: [], warnings: [] },
    });
    expect(flower?.legend).toHaveLength(1);
    expect(flower?.interpretation.unknowns.length).toBeGreaterThan(0);
    expect(flower?.interpretation.summary).toContain('9 of the 371 seated validators');
  });

  test('the answer quotes only tool figures', async () => {
    const es = await collect(run(recordedClient(SKELETON_TRANSCRIPT)).events);
    const text = pick(es, 'message')
      .map((e) => e.data.text)
      .join('\n');
    expect(text).toContain('9 of 371 seated validators');
    expect(text).toContain('block 222915356');
    expect(text).toContain(VIEW_URL);
  });

  test('tool progress is forwarded; summaries are one line, never raw bodies', async () => {
    const es = await collect(run(recordedClient(SKELETON_TRANSCRIPT)).events);
    expect(pick(es, 'progress')[0]?.data).toEqual({
      stage: 'fetching',
      message: 'found in the fixtures',
      done: 1,
      total: 1,
    });
    const summaries = Object.fromEntries(
      pick(es, 'tool_result').map((e) => [e.data.name, e.data.summary]),
    );
    expect(summaries.get_snapshot).toMatch(/^reused from fixture: block 222915356/);
    expect(summaries.compute_figures).toMatch(
      /^Nakamoto 9 at 0.333333; 371 included; top 10 hold 41%/,
    );
    expect(summaries.validate_spec).toBe('valid');
    for (const s of Object.values(summaries)) expect(s).not.toMatch(/\n/);
  });

  test('render_flower is asked without SVG, and the model never reads SVG or petal details', async () => {
    const inner = recordedClient(SKELETON_TRANSCRIPT);
    const seen: string[] = [];
    const spy: LlmClient = {
      ...inner,
      complete: (req) => {
        seen.push(JSON.stringify(req.messages));
        return inner.complete(req);
      },
    };
    const { events, tools } = run(spy);
    await collect(events);
    expect(tools.calls.find((c) => c.name === 'render_flower')?.args.include_svg).toBe(false);
    const last = seen.at(-1) ?? '';
    expect(last).toContain('petals_drawn');
    expect(last).not.toContain('<svg');
  });

  test('the model is offered the registry minus the tools that need a person’s proof', async () => {
    const llm = scriptedLlm([{ content: 'hello' }]);
    await collect(run(llm).events);
    const offered = llm.requests[0]?.tools?.map((t) => t.name) ?? [];
    expect(offered).toContain('render_flower');
    expect(offered).not.toContain('publish_flower');
    const def = llm.requests[0]?.tools?.find((t) => t.name === 'compute_figures');
    expect(def?.description).toMatch(/Quote only these/);
    expect(def?.parameters).toEqual({ type: 'object' });
    const system = llm.requests[0]?.messages[0];
    expect(system?.role).toBe('system');
    expect(system?.content).toMatch(/^# Petal/);
    expect(system?.content).toMatch(/at most 8 tool rounds and 120 s/);
  });

  test('the contract export runs on the @petal/tools registry (empty until W4 lands)', async () => {
    const es = await collect(
      runAgent(
        { messages: QUESTION },
        { tools: fakeContext(), llm: scriptedLlm([{ content: 'ok' }]), budget: DEFAULT_BUDGET },
      ),
    );
    expect(names(es)).toEqual(['run', 'stage', 'message', 'done']);
    expect(pick(es, 'run')[0]?.data.run_id).toMatch(/^[0-9a-f]{24}$/);
  });
});

describe('the flower and its signature', () => {
  test('signature follows the flower: the completion that sent the spec and interpretation to validate_spec', async () => {
    const es = await collect(run(signedSkeleton()).events);
    const n = names(es);
    const at = n.indexOf('flower');
    expect(at).toBeGreaterThan(0);
    expect(n[at + 1]).toBe('signature');
    expect(pick(es, 'signature')).toHaveLength(1);
    expect(pick(es, 'signature')[0]?.data.completion_id).toBe('c3');
    expect(
      inOrder(n, ['run', 'stage', 'tool_call', 'tool_result', 'flower', 'signature', 'done']),
    ).toBe(true);
  });

  test('render_flower is refused until the spec passed validate_spec with an interpretation', async () => {
    const llm = scriptedLlm([
      { calls: [{ name: 'render_flower', args: { spec: SPEC } }] },
      { calls: [{ name: 'validate_spec', args: { spec: SPEC } }] },
      { calls: [{ name: 'render_flower', args: { spec: SPEC } }] },
      { calls: [{ name: 'validate_spec', args: { spec: SPEC, interpretation: INTERPRETATION } }] },
      { calls: [{ name: 'render_flower', args: { spec: SPEC } }] },
      { content: 'done' },
    ]);
    const { events, tools } = run(llm);
    const es = await collect(events);
    const renders = pick(es, 'tool_result').filter((e) => e.data.name === 'render_flower');
    expect(renders.map((e) => e.data.ok)).toEqual([false, false, true]);
    expect(renders[0]?.data.summary).toMatch(
      /^bad_input: render_flower draws only a spec that passed/,
    );
    expect(tools.calls.filter((c) => c.name === 'render_flower')).toHaveLength(1);
    expect(pick(es, 'flower')).toHaveLength(1);
    // the model was told why, as a tool result
    expect(llm.requests[1]?.messages.at(-1)?.content).toMatch(/validate_spec/);
  });

  test('a spec can be named by its spec_sha256 instead of copied', async () => {
    const llm = scriptedLlm([
      { calls: [{ name: 'propose_spec', args: { network: 'near-validators' } }] },
      {
        calls: [
          { name: 'validate_spec', args: { spec: SPEC_SHA, interpretation: INTERPRETATION } },
        ],
      },
      { calls: [{ name: 'render_flower', args: { spec_sha256: SPEC_SHA } }] },
      { content: 'done' },
    ]);
    const { events, tools } = run(llm);
    const es = await collect(events);
    expect(tools.calls.find((c) => c.name === 'validate_spec')?.args.spec).toEqual(SPEC);
    expect(tools.calls.find((c) => c.name === 'render_flower')?.args).toEqual({
      spec: SPEC,
      include_svg: false,
    });
    expect(pick(es, 'flower')[0]?.data.spec).toEqual(SPEC);
  });

  test('a failed validation is fixed and retried, as the prompt says', async () => {
    const llm = scriptedLlm([
      { calls: [{ name: 'validate_spec', args: { spec: SPEC, interpretation: INTERPRETATION } }] },
      { calls: [{ name: 'validate_spec', args: { spec: SPEC, interpretation: INTERPRETATION } }] },
      { calls: [{ name: 'render_flower', args: { spec: SPEC } }] },
      { content: 'done' },
    ]);
    const es = await collect(run(llm, { tools: fakeRegistry({ failValidateOnce: true }) }).events);
    const v = pick(es, 'tool_result').filter((e) => e.data.name === 'validate_spec');
    expect(v.map((e) => e.data.summary)).toEqual([
      'invalid: 1 errors; first: unknowns is empty',
      'valid',
    ]);
    expect(pick(es, 'flower')).toHaveLength(1);
  });
});

describe('tool trouble goes back to the model, not to the user', () => {
  test('bad JSON, an unknown tool, a proof-only tool and a tool that throws', async () => {
    const llm = scriptedLlm([
      { calls: [{ name: 'get_snapshot', args: '{not json' }] },
      { calls: [{ name: 'no_such_tool', args: {} }] },
      { calls: [{ name: 'publish_flower', args: {} }] },
      { calls: [{ name: 'explode', args: {} }] },
      { content: 'Sorry, something went wrong.' },
    ]);
    const { events, tools } = run(llm);
    const es = await collect(events);
    expect(pick(es, 'tool_result').map((e) => e.data.summary)).toEqual([
      'bad_input: the arguments of get_snapshot are not a JSON object',
      'not_found: no tool named no_such_tool',
      'not_found: no tool named publish_flower',
      'internal: explode failed: boom',
    ]);
    expect(tools.calls.map((c) => c.name)).toEqual(['explode']);
    expect(names(es)).not.toContain('error');
    expect(names(es).at(-1)).toBe('done');
  });
});

describe('limits', () => {
  test('tool rounds: one last call without tools, then budget_exhausted', async () => {
    const llm = recordedClient(SKELETON_TRANSCRIPT);
    const seen: (string[] | undefined)[] = [];
    const spy: LlmClient = {
      ...llm,
      complete: (req) => {
        seen.push(req.tools?.map((t) => t.name));
        return llm.complete(req);
      },
    };
    const es = await collect(run(spy, { budget: { toolRounds: 2 } }).events);
    expect(pick(es, 'tool_call')).toHaveLength(2);
    expect(seen).toHaveLength(3);
    expect(seen[2]).toBeUndefined();
    expect(pick(es, 'error')[0]?.data).toMatchObject({
      code: 'budget_exhausted',
      hint: SKILL_HINT,
    });
    expect(pick(es, 'error')[0]?.data.message).toMatch(/2 tool rounds/);
    expect(names(es).at(-1)).toBe('done');
  });

  test('wall time: the chat stops when its seconds are up', async () => {
    const es = await collect(run(slowRecorded(80), { budget: { wallSeconds: 0.2 } }).events);
    expect(pick(es, 'error')[0]?.data).toMatchObject({ code: 'budget_exhausted' });
    expect(pick(es, 'error')[0]?.data.message).toMatch(/0.2 s/);
    expect(names(es).at(-1)).toBe('done');
    expect(pick(es, 'flower')).toHaveLength(0);
  });

  test('dollars per chat', async () => {
    const llm = scriptedLlm(
      [
        { calls: [{ name: 'list_flowers', args: {} }] },
        { calls: [{ name: 'list_networks', args: {} }] },
        { content: 'never reached' },
      ],
      { costUsd: 0.03 },
    );
    const es = await collect(run(llm).events);
    expect(llm.requests).toHaveLength(2);
    expect(pick(es, 'error')[0]?.data.message).toMatch(/\$0.05 budget/);
    expect(pick(es, 'done')[0]?.data.cost_usd).toBe(0.06);
  });

  test('the daily cap: no model call, budget_exhausted pointing to the skill', async () => {
    const ledger = memoryLedger();
    await ledger.add(3);
    const llm = scriptedLlm([{ content: 'never' }]);
    const es = await collect(run(llm, { budget: { ledger } }).events);
    expect(llm.requests).toHaveLength(0);
    expect(names(es)).toEqual(['run', 'stage', 'error', 'done']);
    expect(pick(es, 'error')[0]?.data).toMatchObject({
      code: 'budget_exhausted',
      hint: SKILL_HINT,
    });
  });

  test('spend goes to the shared ledger; the recorded client ignores the daily cap', async () => {
    const ledger = memoryLedger();
    await collect(
      run(scriptedLlm([{ content: 'a' }], { costUsd: 0.01 }), { budget: { ledger } }).events,
    );
    expect(await ledger.spentToday()).toBeCloseTo(0.01, 9);
    await ledger.add(5);
    const es = await collect(
      run(recordedClient(SKELETON_TRANSCRIPT), { budget: { ledger } }).events,
    );
    expect(pick(es, 'flower')).toHaveLength(1);
  });

  test('a model failure becomes one error event with its code, then done', async () => {
    const failing: LlmClient = {
      kind: 'near-ai-cloud',
      model: 'z-ai/glm-5.3-flash',
      complete: async () => {
        throw new LlmCallError('rate_limited', 'NEAR AI Cloud: no model answered', {
          retryAfterS: 30,
        });
      },
    };
    const es = await collect(run(failing).events);
    expect(names(es)).toEqual(['run', 'stage', 'error', 'done']);
    expect(pick(es, 'error')[0]?.data).toMatchObject({ code: 'rate_limited', retry_after_s: 30 });
  });
});

describe('liveness', () => {
  test('heartbeats fill quiet stretches: no gap reaches the heartbeat interval by much', async () => {
    const stamped: { e: string; t: number }[] = [];
    const { events } = run(slowRecorded(120), { opts: { heartbeatMs: 40 } });
    for await (const e of events) stamped.push({ e: e.event, t: performance.now() });
    expect(stamped.some((s) => s.e === 'heartbeat')).toBe(true);
    const gaps = stamped.slice(1).map((s, i) => s.t - (stamped[i]?.t ?? s.t));
    expect(Math.max(...gaps)).toBeLessThan(40 + 60);
    expect(stamped.at(-1)?.e).toBe('done');
  });

  test('a consumer that stops early stops the run', async () => {
    const llm = scriptedLlm(
      [
        { calls: [{ name: 'list_flowers', args: {} }] },
        { calls: [{ name: 'list_networks', args: {} }] },
        { content: 'x' },
      ],
      { delayMs: 30 },
    );
    const { events } = run(llm);
    for await (const e of events) if (e.event === 'tool_call') break;
    await new Promise((r) => setTimeout(r, 120));
    expect(llm.requests).toHaveLength(1);
  });
});
