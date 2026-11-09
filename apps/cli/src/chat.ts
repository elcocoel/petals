// The chat in the page's box (004 W10; Elco, 9 Nov: "a real chat in the box, like Orca's"). The
// person's own agent runs in its structured mode, and the page draws a real chat from one event
// shape, whatever the agent. That shape borrows the Agent Client Protocol's own vocabulary
// (agentclientprotocol.com/protocol/v1): the page gets ACP `session/update` objects as they are,
// inside a few envelopes of ours (hello, models, permission, turn, error, exit).
//
// Agents that speak ACP (Hermes) are driven as ACP agents here. Claude Code is driven in its own
// stream-json mode, the person's own `claude`, and its stream is turned into the same updates
// (claude.ts).
import { type ChildProcess, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export type Update = Record<string, unknown> & { sessionUpdate: string };
export interface Model {
  id: string;
  name: string;
  description?: string;
}
export interface Mode {
  id: string;
  name: string;
  description?: string;
}
export interface PermissionOption {
  optionId: string;
  name: string;
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
}

/** What the page receives, one JSON text frame each. */
export type ToPage =
  | {
      t: 'hello';
      agent: string;
      model: string | null;
      mode: { current: string; available: Mode[] } | null;
      commands: { name: string; description?: string }[];
      usage: { used: number; size: number | null } | null;
    }
  | { t: 'models'; current: string | null; available: Model[] }
  | { t: 'update'; update: Update }
  | { t: 'permission'; id: string; toolCall: Record<string, unknown>; options: PermissionOption[] }
  | { t: 'turn'; stopReason: string }
  | { t: 'error'; message: string }
  | { t: 'exit'; code: number };

/** What the page sends. */
export type FromPage =
  | { t: 'prompt'; text: string }
  | { t: 'cancel' }
  | { t: 'permission'; id: string; optionId: string | null }
  | { t: 'mode'; id: string }
  | { t: 'model'; id: string };

/** A message from the page, or null when it isn't one. */
export function fromPage(text: string): FromPage | null {
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  const str = (v: unknown, max = 200_000) => typeof v === 'string' && v.length <= max;
  if (m.t === 'prompt' && str(m.text) && (m.text as string).trim())
    return { t: 'prompt', text: m.text as string };
  if (m.t === 'cancel') return { t: 'cancel' };
  if (m.t === 'permission' && str(m.id, 200) && (m.optionId === null || str(m.optionId, 200)))
    return { t: 'permission', id: m.id as string, optionId: m.optionId as string | null };
  if (m.t === 'mode' && str(m.id, 200)) return { t: 'mode', id: m.id as string };
  if (m.t === 'model' && str(m.id, 200)) return { t: 'model', id: m.id as string };
  return null;
}

export interface McpServer {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

/** One running agent, whatever its protocol. */
export interface ChatAgent {
  /** starts it, says hello, and sends the opening message, which the page doesn't show as the person's */
  start(opening: string): Promise<void>;
  prompt(text: string): void;
  cancel(): void;
  answer(id: string, optionId: string | null): void;
  setMode(id: string): void;
  setModel(id: string): void;
  /** ends it: end of input, then a stop if it doesn't go quietly; `now` stops it at once */
  close(now?: boolean): void;
}

export interface AgentLaunch {
  /** the agent's own program, and what it runs with */
  command: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** Petals' tools, for agents that load MCP servers per session */
  mcp: McpServer[];
  send: (event: ToPage) => void;
  /** the agent's name, for hello */
  agent: string;
}

/** Reads a newline-delimited JSON stream, one object per line, skipping anything else. */
export function jsonLines(child: ChildProcess, each: (msg: Record<string, unknown>) => void): void {
  if (!child.stdout) return;
  createInterface({ input: child.stdout }).on('line', (line) => {
    const t = line.trim();
    if (!t.startsWith('{')) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(t) as Record<string, unknown>;
    } catch {
      return; // a stray log line
    }
    each(msg);
  });
}

/** The last lines the agent wrote to stderr, to say why it ended early. */
export function tail(child: ChildProcess, keep = 20): () => string {
  const lines: string[] = [];
  if (child.stderr) {
    createInterface({ input: child.stderr }).on('line', (l) => {
      lines.push(l);
      if (lines.length > keep) lines.shift();
    });
  }
  return () => lines.join('\n').trim();
}

/** Starts the agent's process in its own group, so ending it ends what it started. */
export function startProcess(o: AgentLaunch): ChildProcess {
  const [cmd, ...args] = o.command;
  return spawn(cmd as string, args, {
    cwd: o.cwd,
    env: o.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
  });
}

/** End of input, then SIGTERM to the group after two seconds (at once if `now`), then SIGKILL. */
export function endProcess(child: ChildProcess | null, now = false): void {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.stdin?.end();
  const group = (sig: NodeJS.Signals) => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
      process.kill(-(child.pid as number), sig);
    } catch {
      child.kill(sig);
    }
  };
  if (now) group('SIGTERM');
  else setTimeout(() => group('SIGTERM'), 2000).unref();
  setTimeout(() => group('SIGKILL'), 5000).unref();
}

/**
 * An ACP agent over stdio (JSON-RPC 2.0, one message per line). This side is the client, and it
 * offers no file system or terminal, so the agent uses its own tools for those.
 */
export function acpAgent(o: AgentLaunch): ChatAgent {
  let child: ChildProcess | null = null;
  let nextId = 1;
  let sessionId: string | null = null;
  let models: { current: string | null; available: Model[] } | null = null;
  const pending = new Map<number, { ok: (v: unknown) => void; fail: (e: Error) => void }>();
  const write = (msg: Record<string, unknown>) => {
    if (child?.stdin?.writable)
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);
  };
  const request = (method: string, params: unknown) =>
    new Promise<Record<string, unknown>>((ok, fail) => {
      const id = nextId++;
      pending.set(id, { ok: (v) => ok((v ?? {}) as Record<string, unknown>), fail });
      write({ id, method, params });
    });

  const onMessage = (msg: Record<string, unknown>) => {
    if ('id' in msg && !('method' in msg)) {
      const p = pending.get(msg.id as number);
      if (!p) return;
      pending.delete(msg.id as number);
      if (msg.error)
        p.fail(new Error(String((msg.error as { message?: unknown }).message ?? 'error')));
      else p.ok(msg.result);
      return;
    }
    const method = String(msg.method ?? '');
    const params = (msg.params ?? {}) as Record<string, unknown>;
    if (method === 'session/update') {
      const update = params.update as Update | undefined;
      if (update && typeof update.sessionUpdate === 'string') o.send({ t: 'update', update });
      return;
    }
    if (method === 'session/request_permission' && 'id' in msg) {
      o.send({
        t: 'permission',
        id: JSON.stringify(msg.id),
        toolCall: (params.toolCall ?? {}) as Record<string, unknown>,
        options: (params.options ?? []) as PermissionOption[],
      });
      return;
    }
    // anything else asked of a client that offered nothing more
    if ('id' in msg)
      write({ id: msg.id, error: { code: -32601, message: `${method} isn't offered here` } });
  };

  const prompt = (text: string) => {
    if (!sessionId) return;
    request('session/prompt', { sessionId, prompt: [{ type: 'text', text }] })
      .then((r) => o.send({ t: 'turn', stopReason: String(r.stopReason ?? 'end_turn') }))
      .catch((e: Error) => o.send({ t: 'error', message: e.message }));
  };

  return {
    async start(opening) {
      child = startProcess(o);
      const stderr = tail(child);
      jsonLines(child, onMessage);
      child.on('exit', (code, signal) => {
        for (const p of pending.values()) p.fail(new Error(stderr() || 'the agent ended'));
        pending.clear();
        o.send({ t: 'exit', code: code ?? (signal ? 1 : 0) });
      });
      child.on('error', (e) => o.send({ t: 'error', message: e.message }));
      try {
        await request('initialize', {
          protocolVersion: 1,
          clientCapabilities: {
            fs: { readTextFile: false, writeTextFile: false },
            terminal: false,
          },
          clientInfo: { name: 'petals', title: 'Petals', version: '1' },
        });
        const session = await request('session/new', {
          cwd: o.cwd,
          mcpServers: o.mcp.map((m) => ({
            name: m.name,
            command: m.command,
            args: m.args,
            env: Object.entries(m.env).map(([name, value]) => ({ name, value })),
          })),
        });
        sessionId = String(session.sessionId);
        const modes = session.modes as
          | { currentModeId: string; availableModes: Mode[] }
          | undefined;
        const offered = session.models as
          | {
              currentModelId?: string;
              availableModels?: { modelId: string; name?: string; description?: string }[];
            }
          | undefined;
        if (offered?.availableModels?.length) {
          models = {
            current: offered.currentModelId ?? null,
            available: offered.availableModels.map((m) => ({
              id: m.modelId,
              name: m.name ?? m.modelId,
              ...(m.description ? { description: m.description } : {}),
            })),
          };
        }
        o.send({
          t: 'hello',
          agent: o.agent,
          model:
            models?.available.find((m) => m.id === models?.current)?.name ??
            models?.current ??
            null,
          mode: modes ? { current: modes.currentModeId, available: modes.availableModes } : null,
          commands: [],
          usage: null,
        });
        if (models) o.send({ t: 'models', ...models });
        prompt(opening);
      } catch (e) {
        o.send({ t: 'error', message: (e as Error).message });
        endProcess(child);
      }
    },
    prompt,
    cancel() {
      if (sessionId) write({ method: 'session/cancel', params: { sessionId } });
    },
    answer(id, optionId) {
      let rpcId: unknown;
      try {
        rpcId = JSON.parse(id);
      } catch {
        return;
      }
      write({
        id: rpcId,
        result: {
          outcome: optionId ? { outcome: 'selected', optionId } : { outcome: 'cancelled' },
        },
      });
    },
    setMode(id) {
      if (!sessionId) return;
      request('session/set_mode', { sessionId, modeId: id })
        .then(() =>
          o.send({
            t: 'update',
            update: { sessionUpdate: 'current_mode_update', currentModeId: id },
          }),
        )
        .catch((e: Error) => o.send({ t: 'error', message: e.message }));
    },
    setModel(id) {
      if (!sessionId || !models) return;
      request('session/set_model', { sessionId, modelId: id })
        .then(() => {
          if (!models) return;
          models = { ...models, current: id };
          o.send({ t: 'models', ...models });
        })
        .catch((e: Error) => o.send({ t: 'error', message: e.message }));
    },
    close(now) {
      endProcess(child, now);
    },
  };
}
