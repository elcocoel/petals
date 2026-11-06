// The stress test of the model and the skill: real conversations (stress-cases.ts) through one door,
// each kept as a transcript a person can read. Run by hand; `pnpm test:e2e` doesn't.
//
//   node scripts/stress.ts --door claude --model sonnet --out <dir> [--cases a,b] [--jobs 4] [--web]
//   set -a; source ../.secrets/near-ai.env; set +a
//   node scripts/stress.ts --door near --model <NEAR AI id> --out <dir> --stop-at-usd 0.20 --cases a,b
//   node scripts/stress.ts --door loop --model sonnet --out <dir> [--cases a,b] [--window tokens]
//
// `loop` is the control: Petal's own loop, gate, prompt and trimmed tool results exactly as `near` has
// them, at no NEAR AI cost, with a subscription model answering each call. Only the model differs, so
// a failure both share is the tools, the prompt or the loop, not the model. Earlier turns reach it as
// a written transcript, not as API messages: a small difference from `near`, worth a live check.
// Its tokens are estimates from the text, and --window compacts threads against a smaller window, so a
// long conversation can show what compaction does.
// `near` is Petal's own agent: the real loop, the real yes gate, the real follow-up thread, on NEAR AI.
// It spends real money, under a ledger shared across its runs (--ledger), and refuses past --stop-at-usd.
// A model call holds up to the cap until it settles, so run this door with --jobs 1.
// `claude` is the skill and the tools through `claude -p` on a subscription, at no NEAR AI cost, with no
// API key and with --allowedTools from scripts/try-agent.ts. --web also lets it search the web.
//
// Both read the same map as Elco's app and neither holds a writer key, so nothing is ever written.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  createNearAiClient,
  DEFAULT_BUDGET,
  fileLedger,
  flowersOf,
  type LlmClient,
  type LlmMessage,
  type LlmRequest,
  startRun,
} from '@petal/agent';
import type { AgentEvent } from '@petal/core/types';
import { configFromEnv, createContext } from '@petal/tools';
import { CASES, type Case } from './stress-cases.ts';
import { agentEnv, claudeArgs, readClaude } from './try-agent.ts';

const REPO = resolve(import.meta.dirname, '..');

const { values: o } = parseArgs({
  options: {
    door: { type: 'string', default: 'claude' },
    model: { type: 'string' },
    out: { type: 'string' },
    cases: { type: 'string' },
    groups: { type: 'string' },
    jobs: { type: 'string', default: '3' },
    web: { type: 'boolean', default: false },
    ledger: { type: 'string' },
    'stop-at-usd': { type: 'string', default: '0.1' },
    tag: { type: 'string' },
    window: { type: 'string' },
  },
});

/** The same shared map as `scripts/serve-testnet.sh`; no writer key, so a read writes no fingerprint. */
const MAP = { PETAL_MAP_NETWORK: 'testnet', PETAL_MAP_RECEIVER: 'petals.testnet' };
const TURN_MS = 5 * 60_000;

interface Told {
  say: string;
  tools: string[];
  text: string;
  ms: number;
  usd?: number;
  tokens?: { in: number; out: number };
  signature?: string | null;
  flower?: string;
  approval?: boolean;
  error?: string;
  /** what each tool said, one line each */
  results?: string[];
}

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean).length;
/** What Petal's own text measured (near-ai.md). */
const tokensIn = (text: string) => Math.round(text.length / 3.7);
const short = (text: string) => text.replace(/\/draft\?spec=[\w=&;%-]+/g, '/draft?spec=…');

const STUB_TOOLS = join(import.meta.dirname, 'stress-stub-tools.ts');

/**
 * One model call as one `claude -p --max-turns 1`. The tool list is real to the model (a stub MCP
 * server, stress-stub-tools.ts), so it calls them natively; the call ends there and the loop runs them.
 */
function subscriptionClient(model: string): LlmClient {
  const env = agentEnv(process.env);
  let calls = 0;
  const wire = (m: LlmMessage) => {
    if (m.role === 'tool') return `[result of your call ${m.tool_call_id}]\n${m.content}`;
    if (m.role === 'assistant') {
      const asked = (m.tool_calls ?? [])
        .map((c) => `[you called ${c.name}, call ${c.id}, with ${c.arguments}]`)
        .join('\n');
      return `[you said]\n${m.content ?? ''}${asked ? `\n${asked}` : ''}`;
    }
    return `[the person said]\n${m.content}`;
  };
  return {
    kind: 'near-ai-cloud',
    model: `subscription:${model}`,
    async complete(req: LlmRequest) {
      const [system, ...rest] = req.messages;
      const dir = mkdtempSync(join(tmpdir(), 'petal-stress-call-'));
      const toolsFile = join(dir, 'tools.json');
      writeFileSync(toolsFile, JSON.stringify(req.tools ?? []));
      const mcp = JSON.stringify({
        mcpServers: {
          petal: {
            type: 'stdio',
            command: process.execPath,
            args: ['--no-warnings', STUB_TOOLS, toolsFile],
          },
        },
      });
      const args = [
        '-p',
        '--output-format',
        'stream-json',
        '--verbose',
        '--model',
        model,
        '--effort',
        'low',
        '--max-turns',
        '1',
        '--tools',
        '',
        '--no-session-persistence',
        '--setting-sources',
        'project',
        '--strict-mcp-config',
        ...(req.tools ? ['--mcp-config', mcp, '--allowedTools', 'mcp__petal'] : []),
        '--system-prompt',
        system?.role === 'system' ? system.content : '',
      ];
      const raw = await new Promise<string>((done) => {
        const p = spawn('claude', args, { cwd: dir, env, stdio: ['pipe', 'pipe', 'ignore'] });
        let out = '';
        p.stdout.on('data', (d) => {
          out += d;
        });
        const t = setTimeout(() => p.kill(), TURN_MS);
        p.on('close', () => {
          clearTimeout(t);
          done(out);
        });
        p.stdin.end(
          `The conversation so far, with your earlier tool calls and their results. Carry on from here: say what you'd say next, or call the next tool.\n\n${rest.map(wire).join('\n\n')}`,
        );
      });
      rmSync(dir, { recursive: true, force: true });
      const text: string[] = [];
      const toolCalls: { id: string; name: string; arguments: string }[] = [];
      for (const line of raw.split('\n')) {
        if (!line.startsWith('{')) continue;
        const o = JSON.parse(line) as {
          type?: string;
          message?: { content?: { type: string; text?: string; name?: string; input?: unknown }[] };
        };
        if (o.type !== 'assistant') continue;
        for (const b of o.message?.content ?? []) {
          if (b.type === 'text' && b.text) text.push(b.text);
          if (b.type === 'tool_use' && b.name) {
            toolCalls.push({
              id: `call_${++calls}`,
              name: b.name.replace(/^mcp__petal__/, ''),
              arguments: JSON.stringify(b.input ?? {}),
            });
          }
        }
      }
      return {
        model: `subscription:${model}`,
        completion_id: `sub_${calls}`,
        message: {
          role: 'assistant' as const,
          content: text.join('\n\n') || null,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
        usage: {
          in: tokensIn(JSON.stringify(req)),
          out: tokensIn(text.join('') + toolCalls.map((c) => c.arguments).join('')),
        },
        cost_usd: 0,
        fallback_used: false,
        signature: null,
      };
    },
  };
}

async function loopConversation(
  c: Case,
  model: string,
  door: 'near' | 'loop',
  ledgerPath: string,
  stopAt: number,
) {
  const env = { ...process.env, ...MAP };
  const stateDir = mkdtempSync(join(tmpdir(), 'petal-stress-'));
  const config = { ...configFromEnv(env, REPO), stateDir };
  if (door === 'near' && !config.nearAiApiKey)
    throw new Error('stress: NEAR_AI_API_KEY is not set');
  const warnings: string[] = [];
  const llm =
    door === 'loop'
      ? subscriptionClient(model)
      : createNearAiClient(
          { apiKeyEnv: 'NEAR_AI_API_KEY', model, fallbacks: [] },
          {
            apiKey: config.nearAiApiKey as string,
            attestationsDir: join(stateDir, 'attestations'),
            onWarning: (w) => warnings.push(w),
          },
        );
  const tools = createContext(config);
  // Not the $0.05 a chat of a real server: a dearer model has to get to finish, for the comparison.
  // The ledger is the cap. Costs over $0.05 are in the transcript, for the question of what it'd take.
  // A `claude -p` call starts slowly, so the wall limit doesn't hold the control to a real server's.
  const budget = {
    ...DEFAULT_BUDGET,
    ...(door === 'loop'
      ? { wallSeconds: 900, usdPerChat: 1, usdPerDay: 1 }
      : {
          usdPerChat: Math.min(0.4, stopAt),
          usdPerDay: stopAt,
          ledger: fileLedger(ledgerPath),
        }),
  };
  const told: Told[] = [];
  let thread: LlmMessage[] = [];
  const all: AgentEvent[] = [];
  const said: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const say of c.turns) {
    const t0 = Date.now();
    said.push({ role: 'user', content: say });
    const events: AgentEvent[] = [];
    const run = startRun(
      {
        messages: [...said],
        flowers: flowersOf(all),
        ...(thread.length ? { thread: [...thread, { role: 'user', content: say }] } : {}),
      },
      { tools, llm, budget },
      {
        onThread: (t) => {
          thread = t;
        },
        ...(o.window ? { windowTokens: Number(o.window) } : {}),
      },
    );
    for await (const e of run) events.push(e);
    all.push(...events);
    const of = <T>(name: AgentEvent['event']) =>
      events.filter((e) => e.event === name).map((e) => e.data as T);
    const text = of<{ text: string }>('message')
      .map((m) => m.text)
      .join('\n\n');
    const done = of<{ cost_usd: number; tokens: { in: number; out: number } }>('done')[0];
    const error = of<{ code: string; message: string }>('error')[0];
    said.push({ role: 'assistant', content: text });
    told.push({
      say,
      tools: of<{ name: string }>('tool_call').map((x) => x.name),
      results: of<{ name: string; ok: boolean; summary: string }>('tool_result').map(
        (r) => `${r.name}${r.ok ? '' : ' FAILED'}: ${r.summary}`,
      ),
      text,
      ms: Date.now() - t0,
      usd: done?.cost_usd,
      tokens: done?.tokens,
      signature: of<{ signature_kind?: string }>('signature').at(-1)?.signature_kind ?? null,
      flower: of<{ spec_sha256: string }>('flower').at(-1)?.spec_sha256,
      approval: of('approval_required').length > 0,
      ...(error ? { error: `${error.code}: ${error.message}` } : {}),
    });
    if (error?.code === 'budget_exhausted') break;
  }
  rmSync(stateDir, { recursive: true, force: true });
  return { told, warnings };
}

function runClaude(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((done) => {
    const p = spawn('claude', args, { cwd, env, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    p.stdout.on('data', (d) => {
      out += d;
    });
    const t = setTimeout(() => p.kill(), TURN_MS);
    p.on('close', () => {
      clearTimeout(t);
      done(out);
    });
  });
}

/** Each tool result the agent read, as one clipped line: what a judge needs, not 72 KB of it. */
function resultLines(stdout: string): string[] {
  const out: string[] = [];
  const names = new Map<string, string>();
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('{')) continue;
    const m = JSON.parse(line) as {
      type?: string;
      message?: {
        content?: {
          type: string;
          id?: string;
          name?: string;
          tool_use_id?: string;
          content?: unknown;
        }[];
      };
    };
    for (const b of m.message?.content ?? []) {
      if (typeof b === 'string') continue;
      if (b.type === 'tool_use' && b.id)
        names.set(b.id, (b.name ?? '').replace(/^mcp__petal__/, ''));
      if (b.type === 'tool_result') {
        const body = Array.isArray(b.content)
          ? b.content.map((x: { text?: string }) => x.text ?? '').join(' ')
          : String(b.content ?? '');
        out.push(
          `${names.get(b.tool_use_id ?? '') ?? '?'}: ${body.replace(/\s+/g, ' ').slice(0, 300)}`,
        );
      }
    }
  }
  return out;
}

async function claudeConversation(c: Case, model: string, web: boolean) {
  const cwd = mkdtempSync(join(tmpdir(), 'petal-stress-'));
  const state = join(cwd, '.petal');
  const skill = readFileSync(join(REPO, 'skill/petal/SKILL.md'), 'utf8');
  const env = { ...agentEnv(process.env), ...MAP, PETAL_STATE_DIR: state };
  const session = randomUUID();
  const told: Told[] = [];
  const raws: string[] = [];
  for (const [i, say] of c.turns.entries()) {
    const t0 = Date.now();
    const args = claudeArgs(say, { model, skill, session, first: i === 0, state });
    if (web) args.push('--allowedTools', 'WebSearch', 'WebFetch');
    const raw = await runClaude(args, cwd, env);
    raws.push(raw);
    const turn = readClaude(raw);
    told.push({
      say,
      tools: turn.tools,
      results: resultLines(raw),
      text: turn.text,
      ms: Date.now() - t0,
      ...(turn.error ? { error: turn.error } : {}),
    });
    if (turn.error) break;
  }
  rmSync(cwd, { recursive: true, force: true });
  return { told, warnings: [] as string[], raws };
}

function readable(c: Case, label: string, told: Told[]): string {
  const lines = [`# ${c.id} (${label})`, '', `**Want:** ${c.want}`, ''];
  for (const t of told) {
    lines.push(`## You: ${t.say}`, '');
    const money = t.usd === undefined ? '' : `, $${t.usd.toFixed(4)}`;
    const size = t.tokens ? `, ${t.tokens.in}/${t.tokens.out} tokens` : '';
    const sign = t.signature ? `, signed ${t.signature}` : '';
    lines.push(
      `*${Math.round(t.ms / 1000)} s${money}${size}${sign}, ${wordsOf(t.text)} words*`,
      '',
    );
    if (t.tools.length) lines.push(`Tools: ${t.tools.join(', ')}`, '');
    if (t.results?.length) lines.push(...t.results.map((r) => `- ${short(r)}`), '');
    if (t.approval) lines.push('(the yes gate held a call)', '');
    if (t.flower) lines.push(`(drew ${t.flower.slice(0, 12)})`, '');
    if (t.error) lines.push(`**ERROR:** ${t.error}`, '');
    lines.push(short(t.text), '');
  }
  return lines.join('\n');
}

async function main() {
  const model = o.model;
  if (!model || !o.out) throw new Error('stress: --model and --out are required');
  const label = (o.tag ?? `${o.door}-${model}`).replace(/[^a-zA-Z0-9.-]+/g, '-');
  const dir = join(resolve(o.out), label);
  mkdirSync(dir, { recursive: true });
  const ledger = resolve(o.ledger ?? join(tmpdir(), 'petal-stress-ledger.db'));
  const stopAt = Number(o['stop-at-usd']);
  const wanted = o.cases?.split(',');
  const groups = o.groups?.split(',');
  const queue = CASES.filter(
    (c) => (!wanted || wanted.includes(c.id)) && (!groups || groups.includes(c.group)),
  );
  const rows: Record<string, unknown>[] = [];
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const started = Date.now();
      try {
        const r =
          o.door === 'near' || o.door === 'loop'
            ? await loopConversation(c, model, o.door, ledger, stopAt)
            : await claudeConversation(c, model, o.web ?? false);
        writeFileSync(join(dir, `${c.id}.md`), readable(c, label, r.told));
        writeFileSync(
          join(dir, `${c.id}.json`),
          `${JSON.stringify({ case: c, door: o.door, model, told: r.told, warnings: r.warnings }, null, 1)}\n`,
        );
        const usd = r.told.reduce((n, t) => n + (t.usd ?? 0), 0);
        rows.push({
          id: c.id,
          turns: r.told.length,
          words: r.told.map((t) => wordsOf(t.text)),
          secs: r.told.map((t) => Math.round(t.ms / 1000)),
          usd: Math.round(usd * 1e4) / 1e4,
          drew: r.told.filter((t) => t.flower).length,
          errors: r.told.filter((t) => t.error).map((t) => t.error?.slice(0, 80)),
        });
      } catch (e) {
        rows.push({ id: c.id, failed: String(e).slice(0, 300) });
      }
      console.log(JSON.stringify(rows.at(-1)), `(${Math.round((Date.now() - started) / 1000)} s)`);
    }
  };
  await Promise.all(Array.from({ length: Number(o.jobs) }, worker));
  writeFileSync(join(dir, 'summary.json'), `${JSON.stringify(rows, null, 1)}\n`);
  console.log(`done: ${dir}`);
}

await main();
