// J4 (#49): the yes, held in code. Petal's own agent can't start a new map until the person has said
// so, whatever its prompt or the person's first message tells it. $0: scripted models, fake tools.
import { join } from 'node:path';
import type { AgentEvent } from '@petal/core/types';
import { openStore, type Store } from '@petal/store';
import { describe, expect, test } from 'vitest';
import { DEFAULT_BUDGET, type LlmMessage } from '../src/llm.ts';
import { HAND_TRANSCRIPT, recordedClient } from '../src/recorded.ts';
import { createAgentRoutes } from '../src/routes.ts';
import { startRun } from '../src/run.ts';
import { fileRunStore, interruptRuns, type RunStore, sqliteRunStore } from '../src/runs.ts';
import type { EarlierFlower } from '../src/thread.ts';
import { flowersOf } from '../src/thread.ts';
import {
  collect,
  fakeContext,
  fakeRegistry,
  INTERPRETATION,
  parseSse,
  runIdOf,
  type ScriptTurn,
  SHA,
  SPEC,
  SPEC_SHA,
  scriptedLlm,
  tmpRoot,
  tool,
} from './helpers.ts';

const QUESTION = 'who stands behind NEAR’s validators?';
const ASK = 'I can read NEAR’s validators for you. Shall I draw them? Yes or no.';
const HERE = 'Here it is.';

const NEAR = { name: 'get_snapshot', args: { network: 'near-validators' } };
const BITCOIN = { name: 'get_snapshot', args: { network: 'bitcoin-mining-pools' } };
const PROPOSE = { name: 'propose_spec', args: { network: 'near-validators', sha256: SHA } };
const VALIDATE = {
  name: 'validate_spec',
  args: { spec: SPEC_SHA, interpretation: INTERPRETATION },
};
const RENDER = { name: 'render_flower', args: { spec: SPEC_SHA } };
/** From a snapshot to a flower, once the snapshot is in hand. */
const TO_FLOWER: ScriptTurn[] = [
  { calls: [PROPOSE] },
  { calls: [VALIDATE] },
  { calls: [RENDER] },
  { content: HERE },
];

type Tools = ReturnType<typeof fakeRegistry>;

async function chat(
  turns: ScriptTurn[],
  o: {
    said?: string;
    thread?: LlmMessage[];
    flowers?: EarlierFlower[];
    draft?: { spec: typeof SPEC };
    tools?: Tools;
    kind?: 'recorded';
  } = {},
) {
  const llm = scriptedLlm(turns, o.kind ? { kind: o.kind } : {});
  const tools = o.tools ?? fakeRegistry();
  let thread: LlmMessage[] = [];
  const es = await collect(
    startRun(
      {
        messages: [{ role: 'user', content: o.said ?? QUESTION }],
        ...(o.thread ? { thread: o.thread } : {}),
        ...(o.flowers ? { flowers: o.flowers } : {}),
        ...(o.draft ? { draft: o.draft } : {}),
      },
      { tools: fakeContext(), llm, budget: DEFAULT_BUDGET },
      {
        registry: tools.registry,
        runId: 'run_yes_1',
        onThread: (t) => {
          thread = t;
        },
      },
    ),
  );
  return { es, llm, tools, thread };
}

const pick = <N extends AgentEvent['event']>(es: AgentEvent[], n: N) =>
  es.filter((e): e is Extract<AgentEvent, { event: N }> => e.event === n);
const names = (es: AgentEvent[]) => es.map((e) => e.event);
const held = (es: AgentEvent[]) =>
  (es as { event: string; data: unknown }[])
    .filter((e) => e.event === 'approval_required')
    .map((e) => e.data as Record<string, unknown>);
const ran = (tools: Tools) => tools.calls.map((c) => c.name);
const said = (es: AgentEvent[]) => pick(es, 'message').map((e) => e.data.text);
const offered = (llm: { requests: { tools?: { name: string }[] }[] }, at: number) =>
  (llm.requests[at]?.tools ?? []).map((t) => t.name);
/** What the model read in place of the last call's answer. */
const toldAfter = (llm: { requests: { messages: LlmMessage[] }[] }) => {
  const tool = llm.requests.at(-1)?.messages.findLast((m) => m.role === 'tool');
  return (JSON.parse((tool as { content: string }).content) as { error: { hint: string } }).error;
};

/** The first chat of a run: the model reaches for the map, is held, and asks. */
const asked = () => chat([{ calls: [NEAR] }, { content: ASK }]);
const reply = (thread: LlmMessage[], text: string): LlmMessage[] => [
  ...thread,
  { role: 'user', content: text },
];

describe('a model that goes straight to a new map', () => {
  test('is refused: the tool does not run, one event, what draws goes, and the chat ends in its words', async () => {
    const { es, llm, tools } = await asked();
    expect(ran(tools)).toEqual([]);
    expect(held(es)).toEqual([
      { tool: 'get_snapshot', network: 'near-validators', target_key: 'near-validators' },
    ]);
    expect(pick(es, 'progress')).toEqual([]);
    expect(llm.requests).toHaveLength(2);
    expect(offered(llm, 0)).toContain('propose_spec');
    expect(offered(llm, 1)).not.toContain('propose_spec');
    expect(offered(llm, 1)).not.toContain('render_flower');
    expect(names(es).at(-1)).toBe('done');
    expect(names(es)).not.toContain('error');
    expect(said(es)).toEqual([ASK]);
    expect(pick(es, 'flower')).toEqual([]);
  });

  test('the event comes between the call and its result, and the result says it was not run', async () => {
    const { es } = await asked();
    const n = names(es) as string[];
    const at = n.indexOf('approval_required');
    expect(n[at - 1]).toBe('tool_call');
    expect(n[at + 1]).toBe('tool_result');
    const result = pick(es, 'tool_result')[0]?.data;
    expect(result).toMatchObject({ name: 'get_snapshot', ok: false });
    expect(result?.summary).toMatch(/^approval_required: /);
  });

  test('a refused call says no stage of work that did not happen', async () => {
    const { es } = await asked();
    expect(pick(es, 'stage').map((e) => e.data.stage)).not.toContain('fetching');
  });

  test('the model reads a tool error that steers it to the person, with no extra user turn', async () => {
    const { llm } = await asked();
    const sent = llm.requests[1]?.messages ?? [];
    expect(sent.filter((m) => m.role === 'user')).toEqual([{ role: 'user', content: QUESTION }]);
    const answer = JSON.parse((sent.at(-1) as { content: string }).content) as {
      error: { code: string; message: string; hint: string };
    };
    expect(sent.at(-1)?.role).toBe('tool');
    expect(answer.error.code).toBe('approval_required');
    expect(answer.error.hint).toMatch(/plain yes or no/);
    expect(answer.error.hint).toMatch(/what you found/);
    // the steer is theirs to follow, not to repeat
    expect(answer.error.hint).toMatch(/Never mention/);
  });

  test('a stubborn model costs one more call: its words stand, and asking again does not run', async () => {
    const { es, llm, tools, thread } = await chat([
      { calls: [NEAR] },
      { content: ASK, calls: [NEAR] },
    ]);
    expect(llm.requests).toHaveLength(2);
    expect(ran(tools)).toEqual([]);
    expect(said(es)).toEqual([ASK]);
    expect(names(es)).not.toContain('error');
    expect(names(es).at(-1)).toBe('done');
    // nothing left open for a later chat to trip on
    expect(thread.at(-1)).toEqual({ role: 'assistant', content: ASK });
  });

  test('a stubborn model with no words gets one call with no tools, so it has to speak', async () => {
    const { es, llm, tools } = await chat([{ calls: [NEAR] }, { calls: [NEAR] }, { content: ASK }]);
    expect(llm.requests).toHaveLength(3);
    expect(llm.requests[2]?.tools).toBeUndefined();
    expect(ran(tools)).toEqual([]);
    expect(said(es)).toEqual([ASK]);
    expect(names(es)).not.toContain('error');
  });

  test('and after that, no words at all is an empty answer, not a spent budget', async () => {
    const { es, llm } = await chat([{ calls: [NEAR] }, { calls: [NEAR] }, { calls: [NEAR] }]);
    expect(llm.requests).toHaveLength(3);
    expect(pick(es, 'error').map((e) => e.data.code)).toEqual(['source_failed']);
    expect(pick(es, 'error')[0]?.data.message).toMatch(/empty answer/);
    expect(names(es).at(-1)).toBe('done');
  });

  test('one event per target in a chat; what is not held in the same round still runs', async () => {
    const { es, tools } = await chat([
      { calls: [{ name: 'list_flowers', args: {} }, NEAR, NEAR, BITCOIN] },
      { content: ASK },
    ]);
    expect(ran(tools)).toEqual(['list_flowers']);
    expect(held(es).map((h) => h.target_key)).toEqual(['near-validators', 'bitcoin-mining-pools']);
  });

  test('each held tool is held, keyed on what it names', async () => {
    const proposed = await chat([
      {
        calls: [
          {
            name: 'propose_spec',
            args: {
              network: 'erc20-holders',
              params: { chain: 'base', contract: '0xABC' },
              sha256: SHA,
            },
          },
        ],
      },
      { content: ASK },
    ]);
    expect(ran(proposed.tools)).toEqual([]);
    expect(held(proposed.es)).toEqual([
      {
        tool: 'propose_spec',
        network: 'erc20-holders',
        params: { chain: 'base', contract: '0xABC' },
        target_key: 'erc20-holders:{"chain":"base","contract":"0xabc"}',
      },
    ]);

    const drawn = { network: { id: 'near-validators' }, snapshot: { sha256: SHA } };
    const rendered = await chat([
      { calls: [{ name: 'validate_spec', args: { spec: drawn, interpretation: INTERPRETATION } }] },
      { calls: [{ name: 'render_flower', args: { spec: drawn } }] },
      { content: ASK },
    ]);
    expect(ran(rendered.tools)).toEqual(['validate_spec']);
    expect(held(rendered.es)).toEqual([
      { tool: 'render_flower', network: 'near-validators', target_key: 'near-validators' },
    ]);
  });
});

describe('after it asked', () => {
  test('"yes": the same call runs, and the next tools pass without another yes', async () => {
    const first = await asked();
    const { es, tools, llm } = await chat([{ calls: [NEAR] }, ...TO_FLOWER], {
      said: 'yes',
      thread: reply(first.thread, 'yes'),
    });
    expect(ran(tools)).toEqual(['get_snapshot', 'propose_spec', 'validate_spec', 'render_flower']);
    expect(held(es)).toEqual([]);
    expect(pick(es, 'flower')).toHaveLength(1);
    expect(llm.requests.every((r) => r.tools?.length)).toBe(true);
    expect(said(es)).toEqual([HERE]);
    // "don't go through the six steps again" isn't what a yes means
    expect(llm.requests[0]?.messages[0]?.content).toMatch(/said yes, go on and draw it/);
  });

  test.each([
    'no',
    'not yet',
    'what does it cost?',
    'what does it cost',
    'yes but which one?',
    'wait',
    'stop',
  ])('%j: refused again, and the chat ends in its words', async (answer) => {
    const first = await asked();
    const { es, tools, llm } = await chat([{ calls: [NEAR] }, { content: ASK }], {
      said: answer,
      thread: reply(first.thread, answer),
    });
    expect(ran(tools)).toEqual([]);
    expect(held(es).map((h) => h.target_key)).toEqual(['near-validators']);
    expect(offered(llm, 1)).not.toContain('propose_spec');
    expect(pick(es, 'flower')).toEqual([]);
  });

  test.each(['yes', 'ok', 'draw it', 'draw'])(
    'a first message %j does not count: the agent has said nothing yet',
    async (first) => {
      const { es, tools } = await chat([{ calls: [NEAR] }, { content: ASK }], { said: first });
      expect(ran(tools)).toEqual([]);
      expect(held(es)).toHaveLength(1);
    },
  );

  test('a model that only reached for a tool has not said anything: "yes" is still too early', async () => {
    // the first chat ended on a stubborn model with no words, so nothing was ever asked
    const first = await chat([{ calls: [NEAR] }, { calls: [NEAR] }]);
    const { tools } = await chat([{ calls: [NEAR] }, { content: ASK }], {
      said: 'yes',
      thread: reply(first.thread, 'yes'),
    });
    expect(ran(tools)).toEqual([]);
  });

  test('a yes covers one target: a second one in the same chat is refused', async () => {
    const first = await asked();
    const { es, tools } = await chat([{ calls: [NEAR] }, { calls: [BITCOIN] }, { content: ASK }], {
      said: 'yes',
      thread: reply(first.thread, 'yes'),
    });
    expect(ran(tools)).toEqual(['get_snapshot']);
    expect(tools.calls[0]?.args.network).toBe('near-validators');
    expect(held(es).map((h) => h.target_key)).toEqual(['bitcoin-mining-pools']);
  });

  test('a second target in a later chat needs a new yes, and gets it', async () => {
    const first = await asked();
    const second = await chat([{ calls: [NEAR] }, ...TO_FLOWER], {
      said: 'yes',
      thread: reply(first.thread, 'yes'),
    });
    const third = await chat([{ calls: [BITCOIN] }, { content: ASK }], {
      said: 'now the bitcoin pools',
      thread: reply(second.thread, 'now the bitcoin pools'),
    });
    expect(ran(third.tools)).toEqual([]);
    expect(held(third.es).map((h) => h.target_key)).toEqual(['bitcoin-mining-pools']);
    const fourth = await chat([{ calls: [BITCOIN] }, { content: HERE }], {
      said: 'yes please',
      thread: reply(third.thread, 'yes please'),
    });
    expect(ran(fourth.tools)).toEqual(['get_snapshot']);
    expect(held(fourth.es)).toEqual([]);
  });

  test('a read that fails does not use up the yes: the model can correct itself', async () => {
    const tools = fakeRegistry();
    tools.registry.unshift(
      tool('get_snapshot', (args) =>
        args.network === 'near-validtors'
          ? { error: { code: 'cannot_read', message: 'no such network' } }
          : { sha256: SHA, reused: true },
      ),
    );
    const first = await asked();
    const { es } = await chat(
      [
        { calls: [{ name: 'get_snapshot', args: { network: 'near-validtors' } }] },
        { calls: [NEAR] },
        { content: HERE },
      ],
      { said: 'yes', thread: reply(first.thread, 'yes'), tools },
    );
    expect(held(es)).toEqual([]);
    expect(pick(es, 'tool_result').map((e) => e.data.ok)).toEqual([false, true]);
  });
});

describe('what is already approved stays approved', () => {
  async function drawn() {
    const first = await asked();
    return chat([{ calls: [NEAR] }, ...TO_FLOWER], {
      said: 'yes',
      thread: reply(first.thread, 'yes'),
    });
  }
  const VARY = {
    name: 'propose_spec',
    args: { network: 'near-validators', variation_of: SPEC_SHA, choices: { petals: 10 } },
  };

  test('a variation on the flower in a later turn passes with no new yes', async () => {
    const second = await drawn();
    const { es, tools } = await chat(
      [{ calls: [VARY] }, { calls: [VALIDATE] }, { calls: [RENDER] }, { content: HERE }],
      {
        said: 'only the top ten',
        thread: reply(second.thread, 'only the top ten'),
        flowers: flowersOf(second.es),
      },
    );
    expect(ran(tools)).toEqual(['propose_spec', 'validate_spec', 'render_flower']);
    expect(held(es)).toEqual([]);
    expect(pick(es, 'flower')).toHaveLength(1);
  });

  test('the same target again passes, however its params are written', async () => {
    const params = { chain: 'base', contract: '0xABC' };
    const shuffled = { contract: '0xabc', chain: 'BASE' };
    const asks = { name: 'get_snapshot', args: { network: 'erc20-holders', params } };
    const first = await chat([{ calls: [asks] }, { content: ASK }]);
    const second = await chat([{ calls: [asks] }, { content: HERE }], {
      said: 'yes',
      thread: reply(first.thread, 'yes'),
    });
    const third = await chat(
      [
        {
          calls: [{ name: 'get_snapshot', args: { network: 'erc20-holders', params: shuffled } }],
        },
        { content: HERE },
      ],
      { said: 'and a year ago', thread: reply(second.thread, 'and a year ago') },
    );
    expect(ran(third.tools)).toEqual(['get_snapshot']);
    expect(held(third.es)).toEqual([]);
  });

  test('a snapshot that came back from an approved read passes under any name', async () => {
    const first = await asked();
    const { tools, es } = await chat(
      [
        { calls: [NEAR] },
        { calls: [{ name: 'propose_spec', args: { network: 'renamed', sha256: SHA } }] },
        { content: HERE },
      ],
      { said: 'yes', thread: reply(first.thread, 'yes') },
    );
    expect(ran(tools)).toEqual(['get_snapshot', 'propose_spec']);
    expect(held(es)).toEqual([]);
  });

  test('a snapshot no approved read returned is keyed on the name it comes with', async () => {
    const first = await asked();
    const other = 'f'.repeat(64);
    const { tools, es } = await chat(
      [
        { calls: [NEAR] },
        { calls: [{ name: 'propose_spec', args: { network: 'renamed', sha256: other } }] },
        { content: ASK },
      ],
      { said: 'yes', thread: reply(first.thread, 'yes') },
    );
    expect(ran(tools)).toEqual(['get_snapshot']);
    expect(held(es).map((h) => h.target_key)).toEqual(['renamed']);
  });

  test('a flower drawn earlier is enough, when the thread no longer holds the read', async () => {
    const second = await drawn();
    const flowers = flowersOf(second.es);
    const { es, tools } = await chat(
      [{ calls: [VARY] }, { calls: [VALIDATE] }, { calls: [RENDER] }, { content: HERE }],
      { said: 'only the top ten', flowers },
    );
    expect(ran(tools)).toEqual(['propose_spec', 'validate_spec', 'render_flower']);
    expect(held(es)).toEqual([]);
  });

  test('the draft the person brought is theirs to vary, with no yes', async () => {
    const { es, tools } = await chat(
      [{ calls: [VARY] }, { calls: [VALIDATE] }, { calls: [RENDER] }, { content: HERE }],
      { said: 'only the top ten', draft: { spec: SPEC } },
    );
    expect(ran(tools)).toEqual(['propose_spec', 'validate_spec', 'render_flower']);
    expect(held(es)).toEqual([]);
  });
});

describe('continuing by run_id', () => {
  const STORES: [string, (dir: string) => { runs: RunStore; store?: Store }][] = [
    ['the file store', (dir) => ({ runs: fileRunStore(join(dir, 'runs')) })],
    [
      'the private store, reopened',
      (dir) => {
        const store = openStore(join(dir, 'private.db'));
        interruptRuns(store, () => {});
        return { runs: sqliteRunStore(store), store };
      },
    ],
  ];

  test.each(STORES)('across fresh servers, on %s', async (_label, open) => {
    const dir = tmpRoot();
    /** A new server each time: no memory but what the store keeps. */
    const server = (turns: ScriptTurn[]) => {
      const opened = open(dir);
      const tools = fakeRegistry();
      const llm = scriptedLlm(turns);
      const app = createAgentRoutes(
        { tools: fakeContext(dir), llm, budget: DEFAULT_BUDGET, runs: opened.runs },
        { registry: tools.registry },
      );
      const post = async (content: string, run_id?: string) => {
        const res = await app.request('/api/v1/agent/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7' },
          body: JSON.stringify({
            messages: [{ role: 'user', content }],
            ...(run_id ? { run_id } : {}),
          }),
        });
        const es = parseSse(await res.text());
        opened.store?.close();
        return es;
      };
      return { post, tools, llm };
    };

    const one = server([{ calls: [NEAR] }, { content: ASK }]);
    const first = await one.post(QUESTION);
    const runId = runIdOf(first);
    expect(one.tools.calls).toEqual([]);
    expect(first.filter((e) => e.event === 'approval_required').map((e) => e.data)).toEqual([
      { tool: 'get_snapshot', network: 'near-validators', target_key: 'near-validators' },
    ]);

    // a restart between the question and the yes
    const two = server([{ calls: [NEAR] }, ...TO_FLOWER]);
    const second = await two.post('yes', runId);
    expect(two.tools.calls.map((c) => c.name)).toEqual([
      'get_snapshot',
      'propose_spec',
      'validate_spec',
      'render_flower',
    ]);
    expect(second.map((e) => e.event)).toContain('flower');
    expect(second.map((e) => e.event)).not.toContain('approval_required');

    // and again before a variation: the approval is still there
    const three = server([
      {
        calls: [
          {
            name: 'propose_spec',
            args: { network: 'near-validators', variation_of: SPEC_SHA },
          },
        ],
      },
      { calls: [VALIDATE] },
      { calls: [RENDER] },
      { content: HERE },
    ]);
    const third = await three.post('only the top ten', runId);
    expect(three.tools.calls.map((c) => c.name)).toEqual([
      'propose_spec',
      'validate_spec',
      'render_flower',
    ]);
    expect(third.map((e) => e.event)).toContain('flower');
    expect(third.map((e) => e.event)).not.toContain('approval_required');

    // the event is stored like the rest, so a reader of the run finds it
    const reopened = open(dir);
    const stored = await reopened.runs.get(runId);
    reopened.store?.close();
    expect(held(stored?.events ?? [])).toHaveLength(1);
  });

  test('a chip is an ordinary message: "Yes" with the run id and nothing else', async () => {
    const dir = tmpRoot();
    const runs = fileRunStore(join(dir, 'runs'));
    const llm = scriptedLlm([
      { calls: [NEAR] },
      { content: ASK },
      { calls: [NEAR] },
      { content: HERE },
    ]);
    const tools = fakeRegistry();
    const app = createAgentRoutes(
      { tools: fakeContext(dir), llm, budget: DEFAULT_BUDGET, runs },
      { registry: tools.registry },
    );
    const post = (body: unknown) =>
      app.request('/api/v1/agent/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7' },
        body: JSON.stringify(body),
      });
    const first = parseSse(
      await (await post({ messages: [{ role: 'user', content: QUESTION }] })).text(),
    );
    await (
      await post({ messages: [{ role: 'user', content: 'Yes' }], run_id: runIdOf(first) })
    ).text();
    expect(tools.calls.map((c) => c.name)).toEqual(['get_snapshot']);
  });
});

describe('never held', () => {
  test('a recorded replay runs as it always did: it spends nothing, and its transcript is fixed', async () => {
    const tools = fakeRegistry();
    const es = await collect(
      startRun(
        { messages: [{ role: 'user', content: QUESTION }] },
        { tools: fakeContext(), llm: recordedClient(HAND_TRANSCRIPT), budget: DEFAULT_BUDGET },
        { registry: tools.registry, runId: 'run_yes_1' },
      ),
    );
    expect(held(es)).toEqual([]);
    expect(pick(es, 'tool_call').map((e) => e.data.name)).toEqual([
      'get_snapshot',
      'describe_snapshot',
      'compute_figures',
      'propose_spec',
      'validate_spec',
      'render_flower',
    ]);
    expect(names(es).filter((n) => n !== 'stage' && n !== 'progress')).toEqual([
      'run',
      ...Array.from({ length: 5 }, () => ['tool_call', 'tool_result']).flat(),
      'tool_call',
      'tool_result',
      'flower',
      'message',
      'done',
    ]);
    expect(pick(es, 'done')[0]?.data.model).toBe('recorded');
    expect(pick(es, 'flower')).toHaveLength(1);
  });

  test('the recorded kind is what lets it through, not the script', async () => {
    const { es, tools } = await chat([{ calls: [NEAR] }, { content: HERE }], { kind: 'recorded' });
    expect(ran(tools)).toEqual(['get_snapshot']);
    expect(held(es)).toEqual([]);
  });

  test('showing a flower that exists: list_flowers and get_flower, on a first message', async () => {
    const { es, tools, llm } = await chat([
      { calls: [{ name: 'list_networks', args: {} }] },
      { calls: [{ name: 'list_flowers', args: { network: 'near-validators' } }] },
      { calls: [{ name: 'get_flower', args: { id: 'flower_1' } }] },
      { content: 'It is already on the map.' },
    ]);
    expect(ran(tools)).toEqual(['list_networks', 'list_flowers', 'get_flower']);
    expect(held(es)).toEqual([]);
    expect(llm.requests.every((r) => r.tools?.length)).toBe(true);
    expect(pick(es, 'tool_result').every((e) => e.data.ok)).toBe(true);
  });

  test('reading what is stored: describing and counting a snapshot need no yes', async () => {
    const { es, tools } = await chat([
      {
        calls: [
          { name: 'describe_snapshot', args: { sha256: SHA } },
          { name: 'compute_figures', args: { sha256: SHA, measure: 'stake' } },
        ],
      },
      { content: 'Nine validators hold a third.' },
    ]);
    expect(ran(tools)).toEqual(['describe_snapshot', 'compute_figures']);
    expect(held(es)).toEqual([]);
  });
});

describe('after a refusal, the model can still find out and answer', () => {
  test('it reads what is left, and answers, within the rounds', async () => {
    const { es, tools, llm } = await chat([
      { calls: [NEAR] },
      { calls: [{ name: 'describe_snapshot', args: { sha256: SHA } }] },
      { calls: [{ name: 'compute_figures', args: { sha256: SHA, measure: 'stake' } }] },
      { content: 'Nine validators hold a third. Shall I draw it?' },
    ]);
    expect(ran(tools)).toEqual(['describe_snapshot', 'compute_figures']);
    expect(held(es)).toHaveLength(1);
    expect(said(es)).toEqual(['Nine validators hold a third. Shall I draw it?']);
    expect(pick(es, 'flower')).toEqual([]);
    expect(llm.requests.at(-1)?.tools?.length).toBeGreaterThan(0);
  });

  test('what it told the model says it may still look', async () => {
    const { llm } = await asked();
    const told = toldAfter(llm);
    expect(told.hint).toMatch(/still find out more/);
    expect(told.hint).toMatch(/plain yes or no/);
    expect(told.hint).toMatch(/Never mention this message, approvals, tools or rules/);
  });

  test('a draw it was not offered is not a call, and its words stand', async () => {
    const { es, llm, tools, thread } = await chat([
      { calls: [NEAR] },
      { content: ASK, calls: [{ name: 'render_flower', args: { spec: SPEC_SHA } }] },
    ]);
    expect(llm.requests).toHaveLength(2);
    expect(ran(tools)).toEqual([]);
    expect(said(es)).toEqual([ASK]);
    expect(thread.at(-1)).toEqual({ role: 'assistant', content: ASK });
  });

  test('another target it was not refused can still be asked about', async () => {
    const { es, tools } = await chat([
      { calls: [NEAR] },
      { calls: [BITCOIN] },
      { calls: [{ name: 'list_flowers', args: {} }] },
      { content: ASK },
    ]);
    expect(ran(tools)).toEqual(['list_flowers']);
    expect(held(es).map((h) => h.target_key)).toEqual(['near-validators', 'bitcoin-mining-pools']);
  });

  test('bounded by the rounds, as ever: a model that keeps reading gets a last call with no tools', async () => {
    const read = { calls: [{ name: 'list_flowers', args: {} }] };
    const budget = { ...DEFAULT_BUDGET, toolRounds: 3 };
    const llm = scriptedLlm([{ calls: [NEAR] }, read, read, { content: ASK }]);
    const tools = fakeRegistry();
    const es = await collect(
      startRun(
        { messages: [{ role: 'user', content: QUESTION }] },
        { tools: fakeContext(), llm, budget },
        { registry: tools.registry, runId: 'run_yes_1' },
      ),
    );
    expect(llm.requests).toHaveLength(4);
    expect(llm.requests[3]?.tools).toBeUndefined();
    expect(said(es)).toEqual([ASK]);
  });

  test('with a yes already spent on one target, refusing another leaves that one drawable', async () => {
    const first = await asked();
    const { es, tools } = await chat([{ calls: [NEAR, BITCOIN] }, ...TO_FLOWER], {
      said: 'yes',
      thread: reply(first.thread, 'yes'),
    });
    expect(ran(tools)).toEqual(['get_snapshot', 'propose_spec', 'validate_spec', 'render_flower']);
    expect(held(es).map((h) => h.target_key)).toEqual(['bitcoin-mining-pools']);
    expect(pick(es, 'flower')).toHaveLength(1);
  });
});

describe('a yes only answers a question a yes can answer', () => {
  const after = async (question: string) => {
    const thread: LlmMessage[] = [
      { role: 'user', content: QUESTION },
      { role: 'assistant', content: question },
      { role: 'user', content: 'yes' },
    ];
    return chat([{ calls: [NEAR] }, { content: ASK }], { said: 'yes', thread });
  };

  test.each([
    'Do you want the stored one, or a fresh read?',
    'Is that the latest, or should we read it fresh?',
    '1. The validators\n2. The House of Stake\nShall I draw it?',
    '- The validators\n- The House of Stake',
    'Which one would you like?',
    'Should I draw one of them?',
  ])('%j: a yes says nothing about which, so nothing runs', async (question) => {
    const { tools, es, llm } = await after(question);
    expect(ran(tools)).toEqual([]);
    expect(held(es)).toHaveLength(1);
    expect(toldAfter(llm).hint).toMatch(/Ask again, once, in one sentence/);
  });

  test.each([
    'I can read NEAR’s validators. Shall I draw them? Yes or no.',
    'Shall I read it and draw it, or not?',
    'Want me to draw it?',
    'Say the word and I will draw it.',
    'It holds:\n- A, 27%\n- B, 13%\n\nDo you want me to draw this as a flower?',
  ])('%j: a yes counts', async (question) => {
    const { tools } = await after(question);
    expect(ran(tools)).toEqual(['get_snapshot']);
  });
});

describe('naming one is the yes, when several things carry the name', () => {
  const holders = (chain: string, contract: string) => ({
    module: 'erc20-holders',
    params: { chain, contract },
  });
  const CANDIDATES = [
    {
      name: 'UNI',
      chain: 'ethereum',
      address: '0xAAAaaa',
      draw: [holders('ethereum', '0xaaaaaa')],
    },
    { name: 'UNI', chain: 'base', address: '0xBBBbbb', draw: [holders('base', '0xbbbbbb')] },
  ];
  const read = (d: ReturnType<typeof holders>) => ({
    name: 'get_snapshot',
    args: { network: d.module, params: d.params },
  });
  const FIRST = read(holders('ethereum', '0xaaaaaa'));
  const SECOND = read(holders('base', '0xbbbbbb'));
  const WHICH = 'Two tokens carry that name: UNI on Ethereum, and UNI on Base. Which one?';

  function withFind(answer: unknown) {
    const tools = fakeRegistry();
    tools.registry.push(tool('find_target', () => answer));
    return tools;
  }
  const findIt = (ambiguous: boolean) =>
    chat([{ calls: [{ name: 'find_target', args: { query: 'UNI' } }] }, { content: WHICH }], {
      said: 'draw UNI',
      tools: withFind({ candidates: CANDIDATES, ambiguous }),
    });

  test.each([
    ['the first one', FIRST],
    ['First.', FIRST],
    ['the second one', SECOND],
    ['the one on base', SECOND],
    ['Ethereum', FIRST],
    ['0xbbbbbb', SECOND],
    ['the 0xAAAAAA one please', FIRST],
    ['o segundo', SECOND],
  ])('%j counts for that candidate', async (answer, call) => {
    const first = await findIt(true);
    const { es, tools } = await chat([{ calls: [call] }, { content: HERE }], {
      said: answer,
      thread: reply(first.thread, answer),
    });
    expect(ran(tools)).toEqual(['get_snapshot']);
    expect(held(es)).toEqual([]);
  });

  test('it counts for that candidate only', async () => {
    const first = await findIt(true);
    const { es, tools } = await chat([{ calls: [SECOND] }, { content: WHICH }], {
      said: 'the first one',
      thread: reply(first.thread, 'the first one'),
    });
    expect(ran(tools)).toEqual([]);
    expect(held(es)).toHaveLength(1);
  });

  test.each([
    'the first one?',
    'not the first one',
    'no, the first one',
    "don't draw the first one",
    'neither',
    'what is the first one',
    'the first or the second',
    'base or ethereum',
  ])('%j does not', async (answer) => {
    const first = await findIt(true);
    const { tools } = await chat([{ calls: [FIRST] }, { content: WHICH }], {
      said: answer,
      thread: reply(first.thread, answer),
    });
    expect(ran(tools)).toEqual([]);
  });

  test("look_up's listed candidates count the same way, when it says ambiguous", async () => {
    const tools = fakeRegistry();
    tools.registry.push(tool('look_up', () => ({ listed: CANDIDATES, ambiguous: true })));
    const first = await chat(
      [{ calls: [{ name: 'look_up', args: { query: 'UNI' } }] }, { content: WHICH }],
      { said: 'draw UNI', tools },
    );
    const { es, tools: after } = await chat([{ calls: [SECOND] }, { content: HERE }], {
      said: 'the one on base',
      thread: reply(first.thread, 'the one on base'),
    });
    expect(ran(after)).toEqual(['get_snapshot']);
    expect(held(es)).toEqual([]);
  });

  test('only when the last find_target was ambiguous', async () => {
    const first = await findIt(false);
    const { tools } = await chat([{ calls: [FIRST] }, { content: WHICH }], {
      said: 'the first one',
      thread: reply(first.thread, 'the first one'),
    });
    expect(ran(tools)).toEqual([]);
  });

  test('a later find_target that was not ambiguous ends it', async () => {
    const first = await findIt(true);
    const { tools } = await chat(
      [
        { calls: [{ name: 'find_target', args: { query: 'UNI on Ethereum' } }] },
        { calls: [FIRST] },
        { content: WHICH },
      ],
      {
        said: 'the first one',
        thread: reply(first.thread, 'the first one'),
        tools: withFind({ candidates: [CANDIDATES[0]], ambiguous: false }),
      },
    );
    expect(ran(tools)).toEqual([]);
  });

  test('a plain yes to which-one says nothing about which: nothing runs, and it asks again', async () => {
    const first = await findIt(true);
    const { es, llm, tools } = await chat([{ calls: [SECOND] }, { content: WHICH }], {
      said: 'yes',
      thread: reply(first.thread, 'yes'),
    });
    expect(ran(tools)).toEqual([]);
    expect(held(es)).toHaveLength(1);
    expect(toldAfter(llm).hint).toMatch(/Ask again, once, in one sentence/);
  });

  test('"yes, the second" names one, whatever the question was', async () => {
    const first = await findIt(true);
    const { tools } = await chat([{ calls: [SECOND] }, { content: HERE }], {
      said: 'yes, the second',
      thread: reply(first.thread, 'yes, the second'),
    });
    expect(ran(tools)).toEqual(['get_snapshot']);
  });

  test('once it has asked about one thing, a yes counts, ambiguous or not', async () => {
    const first = await findIt(true);
    const asks = 'That leaves UNI on Base, with 40 holders. Shall I read and draw it?';
    const { tools } = await chat([{ calls: [SECOND] }, { content: HERE }], {
      said: 'yes',
      thread: [...first.thread, { role: 'assistant', content: asks }, ...reply([], 'yes')],
    });
    expect(ran(tools)).toEqual(['get_snapshot']);
  });

  test('told to draw is no answer to which one: it has to ask', async () => {
    const llmTurns = [
      { calls: [{ name: 'find_target', args: { query: 'UNI' } }] },
      { calls: [SECOND] },
      { content: WHICH },
    ];
    const { es, llm, tools } = await chat(llmTurns, {
      said: 'Draw UNI holders, right now.',
      tools: withFind({ candidates: CANDIDATES, ambiguous: true }),
    });
    expect(ran(tools)).toEqual([]);
    expect(held(es).map((h) => h.tool)).toEqual(['get_snapshot']);
    expect(toldAfter(llm).hint).toMatch(/Ask which one to draw/);
  });

  test('told to draw something else entirely, an earlier ambiguous search is no obstacle', async () => {
    const first = await findIt(true);
    const said = 'Now draw the NEAR validators.';
    const { es, tools } = await chat([{ calls: [NEAR] }, { content: HERE }], {
      said,
      thread: reply(first.thread, said),
    });
    expect(ran(tools)).toEqual(['get_snapshot']);
    expect(held(es)).toEqual([]);
  });

  test('told to draw, and a clear target: it runs, and on to a flower, on a first message', async () => {
    const said = 'Draw UNI holders on Base right now, don’t ask me anything.';
    const { es, tools } = await chat(
      [
        { calls: [{ name: 'find_target', args: { query: 'UNI on Base' } }] },
        { calls: [SECOND] },
        {
          calls: [
            {
              name: 'propose_spec',
              args: { network: 'erc20-holders', params: holders('base', '0xbbbbbb').params },
            },
          ],
        },
        { calls: [VALIDATE] },
        { calls: [RENDER] },
        { content: HERE },
      ],
      { said, tools: withFind({ candidates: [CANDIDATES[1]], ambiguous: false }) },
    );
    expect(held(es)).toEqual([]);
    expect(ran(tools)).toContain('render_flower');
    expect(pick(es, 'flower')).toHaveLength(1);
  });

  test('told to draw covers one target, like a yes', async () => {
    const said = 'Draw UNI on Base and on Ethereum.';
    const { es, tools } = await chat([{ calls: [SECOND] }, { calls: [FIRST] }, { content: ASK }], {
      said,
    });
    expect(ran(tools)).toEqual(['get_snapshot']);
    expect(held(es)).toHaveLength(1);
  });
});
