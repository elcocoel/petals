// Claude Code in the chat box: the person's own `claude`, signed in as they are, run in its
// stream-json mode the way Orca and Claude's own Agent SDK run it, and its stream turned into the
// chat's ACP-shaped updates (chat.ts).
//
// The wire, as Claude's Agent SDK (0.3.x) speaks it:
//   in:  {"type":"user","session_id":"","message":{"role":"user","content":[{"type":"text","text":…}]},"parent_tool_use_id":null}
//        {"type":"control_request","request_id":…,"request":{"subtype":"initialize"|"interrupt"|"set_permission_mode"|"set_model",…}}
//        {"type":"control_response","response":{"subtype":"success","request_id":…,"response":{"behavior":"allow"|"deny",…}}}
//   out: {"type":"system","subtype":"init",model,permissionMode,slash_commands,…}
//        {"type":"stream_event","event":<Anthropic stream event>,"parent_tool_use_id":…}
//        {"type":"assistant"|"user","message":{…},"parent_tool_use_id":…}
//        {"type":"result",subtype,is_error,usage,modelUsage,…}
//        {"type":"control_request","request_id":…,"request":{"subtype":"can_use_tool",tool_name,input,permission_suggestions,tool_use_id}}
//        {"type":"control_response","response":{"subtype":"success"|"error","request_id":…,…}}
//        {"type":"control_cancel_request","request_id":…}
import type { ChildProcess } from 'node:child_process';
import {
  type AgentLaunch,
  type ChatAgent,
  endProcess,
  jsonLines,
  type Mode,
  type Model,
  type PermissionOption,
  startProcess,
  tail,
  type Update,
} from './chat.ts';

/**
 * How the chat runs claude. Approvals come to this helper on stdin and out to the page's buttons.
 * AskUserQuestion is left out, so Claude asks in its reply, which the chat shows.
 */
export const CLAUDE_FLAGS = [
  '-p',
  '--input-format',
  'stream-json',
  '--output-format',
  'stream-json',
  '--verbose',
  '--include-partial-messages',
  '--permission-prompt-tool',
  'stdio',
  '--permission-mode',
  'default',
  '--disallowedTools',
  'AskUserQuestion',
];

/** Claude Code's permission modes, as the box offers them. */
export const CLAUDE_MODES: Mode[] = [
  { id: 'default', name: 'Default', description: 'Asks before edits and commands' },
  {
    id: 'acceptEdits',
    name: 'Accept edits',
    description: 'Edits without asking; asks before commands',
  },
  { id: 'plan', name: 'Plan', description: 'Reads and plans; changes nothing' },
];

type Json = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** ACP's tool kinds, from Claude's tool names. */
export function toolKind(name: string): string {
  if (name === 'Read' || name === 'NotebookRead' || name === 'LS') return 'read';
  if (name === 'Edit' || name === 'MultiEdit' || name === 'Write' || name === 'NotebookEdit')
    return 'edit';
  if (name === 'Bash' || name === 'BashOutput' || name === 'KillShell' || name === 'KillBash')
    return 'execute';
  if (name === 'Glob' || name === 'Grep' || name === 'ToolSearch') return 'search';
  if (name === 'WebFetch' || name === 'WebSearch') return 'fetch';
  if (name === 'Task' || name === 'Agent') return 'think';
  if (name === 'ExitPlanMode' || name === 'EnterPlanMode') return 'switch_mode';
  return 'other';
}

/** A short line for a tool call: its name and what it's about. */
export function toolTitle(name: string, input: Json): string {
  const path = str(input.file_path) ?? str(input.notebook_path) ?? str(input.path);
  const mcp = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(name);
  if (mcp) return (mcp[2] as string).replace(/_/g, ' ');
  switch (name) {
    case 'Bash':
      return str(input.description) ?? str(input.command) ?? name;
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return path ? `${name} ${path}` : name;
    case 'Glob':
    case 'Grep':
      return `${name} ${str(input.pattern) ?? ''}`.trim();
    case 'WebFetch':
      return `${name} ${str(input.url) ?? ''}`.trim();
    case 'WebSearch':
      return `${name} ${str(input.query) ?? ''}`.trim();
    case 'Task':
    case 'Agent':
      return str(input.description) ?? name;
    default:
      return name;
  }
}

/** Where a tool call works, for the page to show. */
function locations(input: Json): { path: string }[] | undefined {
  const path = str(input.file_path) ?? str(input.notebook_path);
  return path ? [{ path }] : undefined;
}

/** A tool result's text, whatever form it came in. */
function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) =>
        c && typeof c === 'object' && (c as Json).type === 'text'
          ? String((c as Json).text ?? '')
          : '',
      )
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/** A todo list (TodoWrite) as ACP's plan. */
function plan(input: Json): Update | null {
  if (!Array.isArray(input.todos)) return null;
  return {
    sessionUpdate: 'plan',
    entries: (input.todos as Json[]).map((t) => ({
      content: str(t.content) ?? '',
      status: t.status === 'completed' || t.status === 'in_progress' ? t.status : 'pending',
      priority: 'medium',
    })),
  };
}

/** Claude Code's stop, in ACP's words. */
function stopReason(result: Json, cancelled: boolean): string {
  if (cancelled) return 'cancelled';
  if (result.subtype === 'error_max_turns') return 'max_turn_requests';
  return 'end_turn';
}

export function claudeAgent(o: AgentLaunch): ChatAgent {
  let child: ChildProcess | null = null;
  let said = false; // hello sent
  let model: string | null = null;
  let mode = 'default';
  let models: Model[] = [];
  let chosen: string | null = null; // a model the page picked, by the list's own id
  let size: number | null = null;
  let used = 0; // the context the last message used
  let lastText = ''; // the last whole text the agent wrote, so an error it already said isn't said twice
  /** its commands, with what each does, once this claude has said */
  let commands: { name: string; description?: string }[] | null = null;
  let cancelled = false;
  let nextRequest = 1;
  const ours = new Map<string, { ok: (r: Json) => void; fail: (e: Error) => void }>();
  /** approvals waiting on the page, by request id */
  const asks = new Map<string, { input: Json; suggestions: unknown[]; toolUseId?: string }>();
  /** tool calls the page has heard of */
  const tools = new Map<string, { name: string }>();
  /** messages whose text came in as it was written, so their whole copy isn't sent again */
  const streamed = new Set<string>();
  let current: string | null = null; // the message being streamed
  const blocks = new Map<number, { type: string; id?: string }>();

  const write = (msg: Json) => {
    if (child?.stdin?.writable) child.stdin.write(`${JSON.stringify(msg)}\n`);
  };
  const update = (u: Update) => o.send({ t: 'update', update: u });
  const request = (request: Json) =>
    new Promise<Json>((ok, fail) => {
      const id = `petals-${nextRequest++}`;
      ours.set(id, { ok, fail });
      write({ type: 'control_request', request_id: id, request });
    });
  const sendModels = () => {
    if (!said || !models.length) return;
    const has = (id: string | null) => id !== null && models.some((m) => m.id === id);
    const current = chosen ?? (has(model) ? model : has('default') ? 'default' : model);
    o.send({ t: 'models', current, available: models });
  };

  const hello = (init: Json) => {
    model = str(init.model) ?? model;
    mode = str(init.permissionMode) ?? mode;
    const named = Array.isArray(init.slash_commands)
      ? (init.slash_commands as unknown[])
          .filter((c): c is string => typeof c === 'string')
          .map((name) => ({ name }))
      : [];
    said = true;
    o.send({
      t: 'hello',
      agent: o.agent,
      model,
      mode: { current: mode, available: CLAUDE_MODES },
      commands: commands ?? named,
      usage: { used: 0, size },
    });
    sendModels();
  };

  const toolCall = (id: string, name: string, input: Json | null) => {
    if (name === 'TodoWrite') {
      const p = input ? plan(input) : null;
      if (p) update(p);
      tools.set(id, { name });
      return;
    }
    const fields = input
      ? {
          title: toolTitle(name, input),
          kind: toolKind(name),
          rawInput: input,
          ...(locations(input) ? { locations: locations(input) } : {}),
        }
      : { title: toolTitle(name, {}), kind: toolKind(name) };
    if (!tools.has(id)) {
      tools.set(id, { name });
      update({
        sessionUpdate: 'tool_call',
        toolCallId: id,
        status: input ? 'in_progress' : 'pending',
        ...fields,
        _meta: { tool: name },
      });
    } else if (input) {
      update({
        sessionUpdate: 'tool_call_update',
        toolCallId: id,
        status: 'in_progress',
        ...fields,
      });
    }
  };

  const onEvent = (ev: Json) => {
    const type = ev.type;
    if (type === 'message_start') {
      const m = (ev.message ?? {}) as Json;
      current = str(m.id) ?? null;
      blocks.clear();
      return;
    }
    if (type === 'content_block_start') {
      const b = (ev.content_block ?? {}) as Json;
      blocks.set(num(ev.index), { type: String(b.type), ...(str(b.id) ? { id: str(b.id) } : {}) });
      if (b.type === 'tool_use' && str(b.id))
        toolCall(str(b.id) as string, String(b.name ?? 'tool'), null);
      return;
    }
    if (type === 'content_block_delta') {
      const d = (ev.delta ?? {}) as Json;
      if (d.type === 'text_delta' && str(d.text)) {
        if (current) streamed.add(current);
        update({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: d.text },
          ...(current ? { messageId: current } : {}),
        });
      } else if (d.type === 'thinking_delta' && str(d.thinking)) {
        if (current) streamed.add(current);
        update({
          sessionUpdate: 'agent_thought_chunk',
          content: { type: 'text', text: d.thinking },
          ...(current ? { messageId: current } : {}),
        });
      }
    }
  };

  const onAssistant = (msg: Json) => {
    const m = (msg.message ?? {}) as Json;
    const id = str(m.id);
    const already = id ? streamed.has(id) : false;
    const whole = (Array.isArray(m.content) ? (m.content as Json[]) : [])
      .filter((b) => b.type === 'text')
      .map((b) => String(b.text ?? ''))
      .join('');
    if (whole) lastText = whole;
    for (const block of Array.isArray(m.content) ? (m.content as Json[]) : []) {
      if (block.type === 'text' && !already && str(block.text)) {
        update({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: block.text },
          ...(id ? { messageId: id } : {}),
        });
      } else if (block.type === 'thinking' && !already && str(block.thinking)) {
        update({
          sessionUpdate: 'agent_thought_chunk',
          content: { type: 'text', text: block.thinking },
          ...(id ? { messageId: id } : {}),
        });
      } else if (block.type === 'tool_use' && str(block.id)) {
        toolCall(block.id as string, String(block.name ?? 'tool'), (block.input ?? {}) as Json);
      }
    }
    const u = (m.usage ?? {}) as Json;
    const now =
      num(u.input_tokens) +
      num(u.cache_creation_input_tokens) +
      num(u.cache_read_input_tokens) +
      num(u.output_tokens);
    if (now > 0) {
      used = now;
      update({ sessionUpdate: 'usage_update', used, size });
    }
  };

  const onUser = (msg: Json) => {
    const m = (msg.message ?? {}) as Json;
    for (const block of Array.isArray(m.content) ? (m.content as Json[]) : []) {
      if (block.type !== 'tool_result') continue;
      const id = str(block.tool_use_id);
      if (!id || !tools.has(id) || tools.get(id)?.name === 'TodoWrite') continue;
      const text = resultText(block.content);
      update({
        sessionUpdate: 'tool_call_update',
        toolCallId: id,
        status: block.is_error ? 'failed' : 'completed',
        ...(text ? { content: [{ type: 'content', content: { type: 'text', text } }] } : {}),
        rawOutput: msg.tool_use_result ?? block.content,
      });
    }
  };

  const onResult = (msg: Json) => {
    const before = size;
    const usage = msg.modelUsage as Record<string, Json> | undefined;
    for (const [name, mu] of Object.entries(usage ?? {})) {
      if (num(mu.contextWindow) > 0 && (!model || name.startsWith(model) || model.startsWith(name)))
        size = num(mu.contextWindow);
    }
    if (size === null) {
      const any = Object.values(usage ?? {}).find((mu) => num(mu.contextWindow) > 0);
      if (any) size = num(any.contextWindow);
    }
    // the window, once the first turn has said it
    if (size !== before && used > 0) update({ sessionUpdate: 'usage_update', used, size });
    if (msg.is_error && msg.subtype !== 'success' && !cancelled) {
      const errors = Array.isArray(msg.errors)
        ? (msg.errors as unknown[]).map(String).join('\n')
        : '';
      o.send({ t: 'error', message: errors || str(msg.result) || String(msg.subtype ?? 'error') });
    } else if (msg.is_error && str(msg.result) && msg.result !== lastText && !cancelled) {
      o.send({ t: 'error', message: msg.result as string });
    }
    o.send({ t: 'turn', stopReason: stopReason(msg, cancelled) });
    cancelled = false;
    // a finished turn leaves nothing to approve
    asks.clear();
  };

  const onRequest = (msg: Json) => {
    const id = String(msg.request_id ?? '');
    const r = (msg.request ?? {}) as Json;
    if (r.subtype !== 'can_use_tool') {
      write({
        type: 'control_response',
        response: {
          subtype: 'error',
          request_id: id,
          error: `${String(r.subtype)} isn't offered here`,
        },
      });
      return;
    }
    const name = String(r.tool_name ?? 'tool');
    const input = (r.input ?? {}) as Json;
    const toolUseId = str(r.tool_use_id);
    const suggestions = Array.isArray(r.permission_suggestions)
      ? (r.permission_suggestions as unknown[])
      : [];
    asks.set(id, { input, suggestions, ...(toolUseId ? { toolUseId } : {}) });
    const options: PermissionOption[] = [
      { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
      ...(suggestions.length
        ? [{ optionId: 'always', name: 'Always allow', kind: 'allow_always' as const }]
        : []),
      { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
    ];
    o.send({
      t: 'permission',
      id,
      toolCall: {
        toolCallId: toolUseId ?? id,
        title: str(r.title) ?? toolTitle(name, input),
        kind: toolKind(name),
        status: 'pending',
        rawInput: input,
        ...(locations(input) ? { locations: locations(input) } : {}),
        ...(str(r.description)
          ? { _meta: { tool: name, description: r.description } }
          : { _meta: { tool: name } }),
      },
      options,
    });
  };

  const onMessage = (msg: Json) => {
    switch (msg.type) {
      case 'system':
        if (msg.subtype === 'init' && !said) return hello(msg);
        if (str(msg.model) && msg.model !== model) {
          model = msg.model as string;
          sendModels();
        }
        if (str(msg.permissionMode) && msg.permissionMode !== mode) {
          mode = msg.permissionMode as string;
          update({ sessionUpdate: 'current_mode_update', currentModeId: mode });
        }
        return;
      case 'stream_event':
        if (msg.parent_tool_use_id) return; // a subagent's own work: its tool call shows it
        return onEvent((msg.event ?? {}) as Json);
      case 'assistant':
        if (msg.parent_tool_use_id) return;
        return onAssistant(msg);
      case 'user':
        if (msg.parent_tool_use_id) return;
        return onUser(msg);
      case 'result':
        return onResult(msg);
      case 'control_request':
        return onRequest(msg);
      case 'control_cancel_request':
        asks.delete(String(msg.request_id ?? ''));
        return;
      case 'control_response': {
        const r = (msg.response ?? {}) as Json;
        const p = ours.get(String(r.request_id ?? ''));
        if (!p) return;
        ours.delete(String(r.request_id));
        if (r.subtype === 'error') p.fail(new Error(String(r.error ?? 'error')));
        else p.ok((r.response ?? {}) as Json);
        return;
      }
    }
  };

  const prompt = (text: string) =>
    write({
      type: 'user',
      session_id: '',
      message: { role: 'user', content: [{ type: 'text', text }] },
      parent_tool_use_id: null,
    });

  return {
    async start(opening) {
      child = startProcess(o);
      const stderr = tail(child);
      jsonLines(child, onMessage);
      child.on('error', (e) => o.send({ t: 'error', message: e.message }));
      child.on('exit', (code, signal) => {
        for (const p of ours.values()) p.fail(new Error('Claude Code ended'));
        ours.clear();
        if (code && !said)
          o.send({ t: 'error', message: stderr() || `Claude Code ended (exit ${code})` });
        o.send({ t: 'exit', code: code ?? (signal ? 1 : 0) });
      });
      // its models and commands, when this claude offers them; an older one just goes on
      request({ subtype: 'initialize', hooks: null })
        .then((r) => {
          const list = Array.isArray(r.models) ? (r.models as Json[]) : [];
          models = list
            .map((m) => ({
              id: str(m.value) ?? str(m.id) ?? '',
              name: str(m.displayName) ?? str(m.name) ?? str(m.value) ?? '',
              ...(str(m.description) ? { description: str(m.description) } : {}),
            }))
            .filter((m) => m.id);
          if (Array.isArray(r.commands)) {
            commands = (r.commands as Json[])
              .filter((c) => str(c.name))
              .map((c) => ({
                name: c.name as string,
                ...(str(c.description) ? { description: c.description as string } : {}),
              }));
            if (said)
              update({
                sessionUpdate: 'available_commands_update',
                availableCommands: commands.map((c) => ({
                  name: c.name,
                  description: c.description ?? '',
                })),
              });
          }
          sendModels();
        })
        .catch(() => {});
      prompt(opening);
    },
    prompt,
    cancel() {
      cancelled = true;
      request({ subtype: 'interrupt' }).catch(() => {});
    },
    answer(id, optionId) {
      const ask = asks.get(id);
      if (!ask) return;
      asks.delete(id);
      const toolUseID = ask.toolUseId ? { toolUseID: ask.toolUseId } : {};
      const response =
        optionId === 'allow' || optionId === 'always'
          ? {
              behavior: 'allow',
              updatedInput: ask.input,
              // "always" holds for this session only: nothing is written to the person's settings
              ...(optionId === 'always' && ask.suggestions.length
                ? {
                    updatedPermissions: ask.suggestions.map((s) => ({
                      ...(s as Json),
                      destination: 'session',
                    })),
                  }
                : {}),
              ...toolUseID,
            }
          : {
              behavior: 'deny',
              message: 'The person declined this in the Petals page.',
              ...toolUseID,
            };
      write({
        type: 'control_response',
        response: { subtype: 'success', request_id: id, response },
      });
    },
    setMode(id) {
      if (!CLAUDE_MODES.some((m) => m.id === id)) return;
      request({ subtype: 'set_permission_mode', mode: id })
        .then(() => {
          mode = id;
          update({ sessionUpdate: 'current_mode_update', currentModeId: id });
        })
        .catch((e: Error) => o.send({ t: 'error', message: e.message }));
    },
    setModel(id) {
      request({ subtype: 'set_model', model: id })
        .then(() => {
          chosen = id;
          sendModels();
        })
        .catch((e: Error) => o.send({ t: 'error', message: e.message }));
    },
    close(now) {
      endProcess(child, now);
    },
  };
}
