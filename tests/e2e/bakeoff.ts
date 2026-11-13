// T060: one real agent run on one model, measured and kept as a transcript/v1 file that
// recordedClient can replay (T061 keeps one as fixtures/transcripts/skeleton.json). It calls NEAR AI
// Cloud and spends real money, so it never runs in the tests. Nothing here signs or publishes; the
// only testnet write is get_snapshot's normal fingerprint, when a writer key is set.
//
//   set -a; source /path/to/keys/near-ai.env; set +a
//   PETAL_WRITER_KEY_FILE=/path/to/keys/petal-writer.testnet.json \
//     node tests/e2e/bakeoff.ts --model z-ai/glm-5.3-flash --question validators \
//       [--effort low|medium|high|model] [--out fixtures/transcripts/bakeoff]
//       [--ledger /path/ledger.json] [--stop-at-usd 0.8] [--skeleton]
//
// The ledger is shared between runs: a run refuses to start once it holds --stop-at-usd.
// With --skeleton the run becomes fixtures/transcripts/skeleton.json (T061), and the attestation
// report its signatures name goes next to it, byte for byte.
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  createNearAiClient,
  DEFAULT_BUDGET,
  fileLedger,
  type LlmClient,
  runAgent,
  type Transcript,
  type TranscriptTurn,
} from '@petal/agent';
import type { FlowerResult, ModelSignature } from '@petal/core/types';
import { configFromEnv, createContext, registry } from '@petal/tools';
import { longestGap, REPO, type TimedEvent, unbacked } from './helpers.ts';

export const QUESTIONS: Record<string, string> = {
  validators:
    'Who stands behind NEAR’s validators? Make me a fresh flower with their backers, not an existing one.',
  hos: 'Who holds power in NEAR’s House of Stake? Make me a fresh flower, not an existing one.',
};

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : fallback;
  if (v === undefined) throw new Error(`bakeoff: --${name} is required`);
  return v;
}

type Json = Record<string, unknown>;

const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

interface TurnFacts {
  ms: number;
  in: number;
  out: number;
  usd: number;
  tools: string[];
}

/** The client, keeping each reply the way a transcript replays it. */
function recording(llm: LlmClient) {
  const turns: TranscriptTurn[] = [];
  const facts: TurnFacts[] = [];
  const results = new Map<string, Json>();
  const client: LlmClient = {
    kind: llm.kind,
    model: llm.model,
    async complete(req) {
      for (const m of req.messages) {
        if (m.role === 'tool') results.set(m.tool_call_id, parsed(m.content) as Json);
      }
      const t0 = performance.now();
      const c = await llm.complete(req);
      const calls = c.message.tool_calls ?? [];
      facts.push({
        ms: Math.round(performance.now() - t0),
        in: c.usage.in,
        out: c.usage.out,
        usd: c.cost_usd,
        tools: calls.map((x) => x.name),
      });
      turns.push({
        content: c.message.content,
        tool_calls: calls.map((x) => ({
          id: x.id,
          name: x.name,
          arguments: parsed(x.arguments),
        })),
        signature: c.signature,
      });
      return c;
    },
  };
  return { client, turns, facts, results };
}

/**
 * The run as a replayable script: a hash or link the model copied from a tool result becomes a
 * reference to that result, as in the hand-made transcript, so nothing is hard-coded twice.
 */
function asReplay(turns: TranscriptTurn[], results: Map<string, Json>): TranscriptTurn[] {
  const refs: [string, string][] = [];
  for (const [id, r] of results) {
    for (const key of ['sha256', 'spec_sha256', 'view_url']) {
      const v = r?.[key];
      if (typeof v === 'string') refs.push([v, `${id}.${key}`]);
    }
  }
  const inArgs = (x: unknown): unknown => {
    if (typeof x === 'string') {
      const hit = refs.find(([v]) => v === x);
      return hit ? { $from: hit[1] } : x;
    }
    if (Array.isArray(x)) return x.map(inArgs);
    if (x && typeof x === 'object') {
      return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, inArgs(v)]));
    }
    return x;
  };
  const inText = (text: string) =>
    refs
      .filter(([, ref]) => ref.endsWith('.view_url'))
      .reduce((t, [v, ref]) => t.replaceAll(v, `{{${ref}}}`), text);
  return turns.map((t) => ({
    ...t,
    content: t.content == null ? t.content : inText(t.content),
    tool_calls: t.tool_calls?.map((c) => ({ ...c, arguments: inArgs(c.arguments) })),
  }));
}

async function main() {
  const model = arg('model');
  const which = arg('question');
  const question = QUESTIONS[which];
  if (!question) throw new Error(`bakeoff: --question is one of ${Object.keys(QUESTIONS)}`);
  const out = resolve(REPO, arg('out', 'fixtures/transcripts/bakeoff'));
  const ledgerPath = resolve(arg('ledger', join(tmpdir(), 'petal-bakeoff-ledger.db')));
  const stopAt = Number(arg('stop-at-usd', '0.8'));

  const env = { ...process.env };
  if (!env.PETAL_MAP_NETWORK && !env.PETAL_MAP_RECEIVER) env.PETAL_MAP_NETWORK = 'testnet';
  // a fresh state folder per run: an empty cache, so a live network is really read
  const stateDir = mkdtempSync(join(tmpdir(), 'petal-bakeoff-'));
  const config = { ...configFromEnv(env, REPO), stateDir };
  const warnings: string[] = [];
  const apiKey = config.nearAiApiKey;
  if (!apiKey) throw new Error('bakeoff: NEAR_AI_API_KEY is not set');
  const attestations = resolve(arg('attestations', join(tmpdir(), 'petal-bakeoff-attestations')));
  const near = createNearAiClient(
    { apiKeyEnv: 'NEAR_AI_API_KEY', model, fallbacks: [] },
    {
      apiKey,
      attestationsDir: attestations,
      // --effort model: the model's own default
      ...(process.argv.includes('--effort')
        ? {
            reasoningEffort:
              arg('effort') === 'model' ? null : (arg('effort') as 'low' | 'medium' | 'high'),
          }
        : {}),
      onWarning: (w) => warnings.push(w),
    },
  );
  const { client, turns, facts, results: seen } = recording(near);
  const tools = createContext(config);
  const budget = { ...DEFAULT_BUDGET, usdPerDay: stopAt, ledger: fileLedger(ledgerPath) };

  const events: TimedEvent[] = [];
  const started = new Date().toISOString();
  const sent = Date.now();
  for await (const e of runAgent(
    {
      // A real model's first map waits for a yes (approval.ts), and a bake-off measures the drawing.
      messages: [
        { role: 'user', content: question },
        { role: 'assistant', content: 'Shall I read it and draw it? Yes or no.' },
        { role: 'user', content: 'yes' },
      ],
    },
    { tools, llm: client, budget },
  )) {
    events.push({ event: e.event, data: e.data, at: Date.now() - sent });
  }

  const data = <T>(name: string) => events.filter((e) => e.event === name).map((e) => e.data as T);
  const done = data<{
    turns: number;
    model: string;
    tokens: { in: number; out: number };
    cost_usd: number;
  }>('done')[0];
  const flower = data<FlowerResult>('flower').at(-1);
  const signature = data<ModelSignature>('signature').at(-1);
  const calls = data<{ id: string; name: string; args: Json }>('tool_call');
  const ids = calls.map((c) => c.id);
  const results = data<{ name: string; ok: boolean; summary: string; ms: number }>('tool_result');
  const answer = data<{ text: string }>('message')
    .map((m) => m.text)
    .join('\n');

  // quickstart step 2.5, as T072 checks it: the agent's own calls made again. Not get_snapshot:
  // made again with fresh: true it would read the network a second time, so what it said is used.
  const figures: unknown[] = calls.flatMap((c, i) =>
    c.name === 'get_snapshot' ? [seen.get(ids[i] ?? '')] : [],
  );
  for (const c of calls) {
    if (c.name !== 'compute_figures' && c.name !== 'describe_snapshot') continue;
    const tool = registry.find((t) => t.name === c.name);
    if (tool) figures.push(await tool.run(c.args, tools));
  }
  rmSync(stateDir, { recursive: true, force: true });

  const validations = results.filter((r) => r.name === 'validate_spec');
  const transcript: Transcript & { run: Json } = {
    petal: 'transcript/v1',
    kind: 'recorded',
    title: `Bake-off (${which}): ${model}`,
    question,
    model,
    note: 'A real run on NEAR AI Cloud (T060), kept with the signature each completion got. A hash or link the model copied from a tool result is written as a reference to that result ($from, {{…}}), so it replays on recordedClient.',
    turns: asReplay(turns, seen),
    run: {
      started_at: started,
      success: !!flower && !data('error').length,
      wall_ms: events.at(-1)?.at ?? 0,
      longest_gap_ms: longestGap(events),
      turns: done?.turns,
      tokens: done?.tokens,
      cost_usd: done?.cost_usd,
      per_turn: facts,
      tool_ms: results.map((r) => ({ name: r.name, ok: r.ok, ms: r.ms, summary: r.summary })),
      validate_tries: validations.length,
      errors: data('error'),
      warnings,
      unbacked_numbers: unbacked(answer, figures).map((q) => q.text),
      unbacked_in_interpretation: flower
        ? unbacked(
            [
              flower.interpretation.summary,
              ...flower.interpretation.power_means.map((p) => p.claim),
              ...flower.interpretation.conflicts,
              ...flower.interpretation.unknowns,
              ...flower.interpretation.inferred,
            ].join('\n'),
            figures,
          ).map((q) => q.text)
        : [],
      signature_kind: signature?.signature_kind ?? null,
      signature_id: signature?.completion_id ?? null,
      spec_sha256: flower?.spec_sha256 ?? null,
      proposed: calls.filter((c) => c.name === 'propose_spec').map((c) => c.args),
      interpretation: flower?.interpretation ?? null,
      answer,
    },
  };

  const skeleton = process.argv.includes('--skeleton');
  const slug = `${model.replace(/[^a-zA-Z0-9.-]+/g, '-')}--${which}`;
  const file = skeleton
    ? join(REPO, 'fixtures/transcripts/skeleton.json')
    : join(out, `${slug}.json`);
  mkdirSync(resolve(file, '..'), { recursive: true });
  if (skeleton) {
    transcript.title = 'Skeleton: who stands behind NEAR’s validators?';
    const to = join(REPO, 'fixtures/transcripts/attestations');
    mkdirSync(to, { recursive: true });
    const reports = new Set(turns.map((t) => t.signature?.attestation?.report_sha256));
    for (const sha of reports) {
      if (sha) copyFileSync(join(attestations, `${sha}.json`), join(to, `${sha}.json`));
    }
  }
  writeFileSync(file, `${JSON.stringify(transcript, null, 2)}\n`);
  const r = transcript.run;
  console.log(
    JSON.stringify({
      file: file.slice(REPO.length),
      success: r.success,
      wall_s: Math.round(Number(r.wall_ms) / 100) / 10,
      gap_s: Math.round(Number(r.longest_gap_ms) / 100) / 10,
      turns: r.turns,
      tokens: r.tokens,
      cost_usd: r.cost_usd,
      validate_tries: r.validate_tries,
      signature: r.signature_kind,
      unbacked: r.unbacked_numbers,
      unbacked_interp: r.unbacked_in_interpretation,
      warnings: warnings.length,
      errors: data<{ code: string }>('error').map((e) => e.code),
    }),
  );
}

if (import.meta.main) await main();
