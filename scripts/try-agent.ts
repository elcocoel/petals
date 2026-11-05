// One conversation with Petal's skill and tools, through your own agent, on your subscription.
// It spends no NEAR AI credit and no API key, and writes nothing to the agent's config: the tools
// and the skill are loaded for this run only. `petal connect` is the lasting install.
//
//   node scripts/try-agent.ts claude "Who holds UNI on Base?" yes
//   node scripts/try-agent.ts codex "Who holds the shares of Moloch DAO?" "top ten only"
//   node scripts/try-agent.ts claude --model sonnet "Who holds UNI on Base?"
//
// Each extra argument is the next thing you say. The default models are small on purpose: Petal's
// own agent runs a small model too, and a test should not use up a subscription.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '..');
const TURN_MS = 5 * 60_000;

export type Agent = 'claude' | 'codex';

export interface Turn {
  tools: string[];
  text: string;
  session?: string;
  billing?: string;
  error?: string;
}

/**
 * The environment the agent runs in. API keys go, so the agent bills its subscription. NEAR AI's
 * key goes, so nothing can spend that credit. Petal's own settings go, so a test can't reach a real
 * map or the writer key. A Claude Code session's own markers go, or a nested `claude` won't start.
 */
export function agentEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(env)) {
    if (/^(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|OPENAI_API_KEY|CODEX_API_KEY)$/.test(k)) continue;
    if (k === 'NEAR_AI_API_KEY' || k === 'ENVIO_API_TOKEN' || k.startsWith('PETAL_')) continue;
    if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_')) continue;
    out[k] = v;
  }
  return out;
}

const objects = (stdout: string): Record<string, unknown>[] =>
  stdout.split('\n').flatMap((line) => {
    if (!line.startsWith('{')) return [];
    try {
      return [JSON.parse(line) as Record<string, unknown>];
    } catch {
      return [];
    }
  });

const toolName = (name: string) => name.replace(/^mcp__petal__/, '');

/** Reads `claude -p --output-format stream-json`. */
export function readClaude(stdout: string): Turn {
  const turn: Turn = { tools: [], text: '' };
  for (const o of objects(stdout)) {
    if (o.type === 'system' && o.subtype === 'init') {
      turn.session = String(o.session_id);
      turn.billing = o.apiKeySource === 'none' ? 'subscription' : `api key: ${o.apiKeySource}`;
    }
    if (o.type === 'assistant') {
      const content = (o.message as { content?: { type: string; name?: string }[] })?.content ?? [];
      for (const block of content)
        if (block.type === 'tool_use' && block.name) turn.tools.push(toolName(block.name));
    }
    if (o.type === 'result') {
      turn.text = typeof o.result === 'string' ? o.result : '';
      if (o.is_error) turn.error = String(o.result ?? o.subtype);
    }
  }
  return turn;
}

/** Reads `codex exec --json`. */
export function readCodex(stdout: string): Turn {
  const turn: Turn = { tools: [], text: '', billing: 'subscription' };
  for (const o of objects(stdout)) {
    if (o.type === 'thread.started') turn.session = String(o.thread_id);
    if (o.type === 'error' || o.type === 'turn.failed') {
      const e = o.error as { message?: string } | undefined;
      turn.error = String(e?.message ?? o.message ?? o.type);
    }
    if (o.type !== 'item.completed') continue;
    const item = o.item as { type?: string; text?: string; tool?: string; command?: string };
    if (item.type === 'agent_message' && item.text) turn.text = item.text;
    if (item.type === 'mcp_tool_call' && item.tool) turn.tools.push(toolName(item.tool));
    if (item.type === 'command_execution') turn.tools.push('shell');
  }
  return turn;
}

/** What the agent changed from Petal's default mapping, in the last spec it proposed. */
export function changesOf(stdout: string): string | undefined {
  const all = [...stdout.matchAll(/changed_from_default\\?"\s*:\s*\[([^\]]*)\]/g)];
  const last = all.at(-1)?.[1];
  return last === undefined ? undefined : last.replace(/[\\"]/g, '').trim() || 'nothing';
}

/** The flower drawn in this turn, if any: the last spec hash in the agent's own record. */
export const specOf = (stdout: string) =>
  [...stdout.matchAll(/spec_sha256\W+([0-9a-f]{64})/g)].at(-1)?.[1];

/** Its own state folder, so a test neither finds an earlier test's reads nor leaves its own. */
function petalServer(state: string) {
  return {
    command: 'pnpm',
    args: ['-s', '--dir', REPO, 'petal', 'mcp'],
    env: { PETAL_STATE_DIR: state },
  };
}

export function claudeArgs(
  say: string,
  o: { model: string; skill: string; session: string; first: boolean; state: string },
): string[] {
  return [
    '-p',
    say,
    '--output-format',
    'stream-json',
    '--verbose',
    '--model',
    o.model,
    '--max-turns',
    '20',
    '--strict-mcp-config',
    '--mcp-config',
    JSON.stringify({ mcpServers: { petal: petalServer(o.state) } }),
    '--setting-sources',
    'project',
    '--append-system-prompt',
    o.skill,
    ...(o.first ? ['--session-id', o.session] : ['--resume', o.session]),
    // The skill's own way to hand over a drawing: `petal render --out`, into this run's folder.
    '--allowedTools',
    'mcp__petal',
    'Bash(pnpm *)',
    'Bash(grep *)',
    'Write',
  ];
}

export function codexArgs(
  say: string,
  o: { model?: string; session?: string; path: string; state: string },
): string[] {
  const server = petalServer(o.state);
  const config = [
    `mcp_servers.petal.command="${server.command}"`,
    `mcp_servers.petal.args=${JSON.stringify(server.args)}`,
    `mcp_servers.petal.env={PATH=${JSON.stringify(o.path)},PETAL_STATE_DIR=${JSON.stringify(o.state)}}`,
    'mcp_servers.petal.default_tools_approval_mode="approve"',
    'sandbox_mode="workspace-write"',
    'model_reasoning_effort="low"',
  ].flatMap((c) => ['-c', c]);
  return [
    'exec',
    ...(o.session ? ['resume', o.session] : []),
    '--json',
    '--skip-git-repo-check',
    ...config,
    ...(o.model ? ['-m', o.model] : []),
    say,
  ];
}

const short = (text: string) => text.replace(/\/draft\?spec=[\w=&;%-]+/g, '/draft?spec=…');

function main(argv: string[]): number {
  const a = argv[0] as Agent;
  const at = argv.indexOf('--model');
  const model = at > 0 ? argv[at + 1] : undefined;
  const said = argv.slice(1).filter((_, i) => i + 1 !== at && i + 1 !== at + 1);
  if ((a !== 'claude' && a !== 'codex') || said.length === 0) {
    console.error('usage: node scripts/try-agent.ts <claude|codex> [--model m] "first" ["next" …]');
    return 2;
  }
  const claudeModel = model ?? 'haiku';
  const skill = readFileSync(join(REPO, 'skill/petal/SKILL.md'), 'utf8');
  // Outside any project, so the agent sees only the skill, not a repo's own instructions.
  const cwd = mkdtempSync(join(tmpdir(), 'petal-try-'));
  if (a === 'codex') writeFileSync(join(cwd, 'AGENTS.md'), skill);
  const state = join(cwd, '.petal');
  const env = { ...agentEnv(process.env), PETAL_STATE_DIR: state };

  console.log(`${a} (${a === 'claude' ? claudeModel : (model ?? 'its default')}), in ${cwd}`);
  let session: string | undefined = a === 'claude' ? randomUUID() : undefined;
  let failed = 0;
  for (const [i, say] of said.entries()) {
    const started = Date.now();
    const args =
      a === 'claude'
        ? claudeArgs(say, {
            model: claudeModel,
            skill,
            session: session as string,
            first: i === 0,
            state,
          })
        : codexArgs(say, {
            ...(model ? { model } : {}),
            ...(session ? { session } : {}),
            path: process.env.PATH ?? '',
            state,
          });
    const r = spawnSync(a, args, {
      cwd,
      env,
      encoding: 'utf8',
      timeout: TURN_MS,
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const turn = a === 'claude' ? readClaude(r.stdout ?? '') : readCodex(r.stdout ?? '');
    session = turn.session ?? session;
    const spec = specOf(r.stdout ?? '');
    const bad = turn.error ?? (r.status === 0 ? undefined : `exit ${r.status ?? r.signal}`);
    console.log(`\n--- You: ${say}`);
    console.log(
      `${Math.round((Date.now() - started) / 1000)} s; billing: ${turn.billing ?? 'unknown'}`,
    );
    console.log(`tools: ${turn.tools.join(', ') || 'none'}`);
    if (spec) console.log(`spec_sha256: ${spec}`);
    const changes = changesOf(r.stdout ?? '');
    if (changes) console.log(`changed from default: ${changes}`);
    if (bad) {
      failed++;
      console.log(`FAILED: ${bad}`);
      if (r.stderr) console.log(r.stderr.slice(-600));
    }
    console.log(`\n${short(turn.text)}`);
    if (bad) break;
  }
  const drawings = readdirSync(cwd).filter((f) => f.endsWith('.svg'));
  console.log(`\nflower files: ${drawings.map((f) => join(cwd, f)).join(', ') || 'none'}`);
  return failed ? 1 : 0;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
