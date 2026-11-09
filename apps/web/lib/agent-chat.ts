// The chat in the box (specs/004-workspace, W10; Elco, 9 Nov: "can we REALLY style the output ... have an
// input box, the chat above it, proper typography, show context"). The person's own agent runs on their
// computer under the Petals helper in its structured mode, and the helper sends its events in CONNECTORS's
// small shape, with Agent Client Protocol update objects inside (agentclientprotocol.com, v1). Pure: what
// the helper says, folded into what the box shows. Words are proposals (design/journey-strings.md).
import { HELPER_PORT } from './terminal-pass.ts';

export const helperChatUrl = (port: number = HELPER_PORT) => `ws://127.0.0.1:${port}/chat`;

/**
 * The first frame: the one-use code, the page's conversation for the agent to write into (a continue
 * link), and that conversation's own id, which the helper keeps the agent's saved session under, so
 * reopening the conversation reopens the session (B2; Elco, 9 Nov: "reopening the saved session first").
 */
export const chatHello = (pair: string, exploration: string | null, conversation?: string | null) =>
  JSON.stringify({
    pair,
    ...(exploration ? { exploration } : {}),
    ...(conversation ? { conversation } : {}),
  });

/** What the page says to the helper once paired. */
export const toHelper = {
  prompt: (text: string) => JSON.stringify({ t: 'prompt', text }),
  cancel: () => JSON.stringify({ t: 'cancel' }),
  permission: (id: string | number, optionId: string | null) =>
    JSON.stringify({ t: 'permission', id, optionId }),
  mode: (id: string) => JSON.stringify({ t: 'mode', id }),
  model: (id: string) => JSON.stringify({ t: 'model', id }),
};

export interface Choice {
  id: string;
  name: string;
  description?: string;
}

export type ChatItem =
  | { kind: 'user'; key: string; text: string }
  | { kind: 'agent'; key: string; text: string }
  | { kind: 'thought'; key: string; text: string }
  | { kind: 'tool'; key: string; title: string; tool: string; status: string; detail: string }
  | { kind: 'plan'; key: string; entries: { content: string; status: string }[] };

export interface Permission {
  id: string | number;
  title: string;
  options: { optionId: string; name: string; kind: string }[];
}

export interface ChatState {
  paired: boolean;
  agent: string;
  model: string;
  /** The models the agent offers, when it offers a choice. */
  models: { current: string; available: Choice[] };
  mode: { current: string; available: Choice[] };
  commands: { name: string; description: string }[];
  /** Tokens used and the window's size, as the agent last said. */
  usage: { used: number; size: number } | null;
  items: ChatItem[];
  /** A turn is under way: the input can't send, and Stop can. */
  busy: boolean;
  permission: Permission | null;
  error: string | null;
  exited: boolean;
  /** For keys of items with no id of their own. */
  seq: number;
}

export const emptyChat: ChatState = {
  paired: false,
  agent: '',
  model: '',
  models: { current: '', available: [] },
  mode: { current: '', available: [] },
  commands: [],
  usage: null,
  items: [],
  busy: false,
  permission: null,
  error: null,
  exited: false,
  seq: 0,
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

/** A content block as words: text as it is, anything else by its name. */
function words(block: unknown): string {
  if (!isObj(block)) return '';
  if (block.type === 'text') return str(block.text);
  if (block.type === 'resource_link') return `[${str(block.name, str(block.uri))}]`;
  return '';
}

/** A tool call's detail: what it was asked, then what it said, kept short enough to read. */
function detailOf(update: Obj, before = ''): string {
  const parts: string[] = [];
  if (update.rawInput !== undefined) parts.push(JSON.stringify(update.rawInput, null, 2));
  if (Array.isArray(update.content)) {
    for (const c of update.content) {
      if (!isObj(c)) continue;
      if (c.type === 'content') parts.push(words(c.content));
      if (c.type === 'diff') parts.push(`${str(c.path)} changed`);
    }
  }
  const next = parts.filter(Boolean).join('\n');
  return (next || before).slice(0, 4000);
}

/** Text that streams in pieces joins the item it belongs to: the same message, or the last of its kind. */
function appendText(
  s: ChatState,
  kind: 'user' | 'agent' | 'thought',
  id: string,
  text: string,
): ChatState {
  const items = [...s.items];
  const last = items.at(-1);
  const i = id
    ? items.findIndex((it) => it.kind === kind && it.key === `${kind}:${id}`)
    : last?.kind === kind
      ? items.length - 1
      : -1;
  const found = i >= 0 ? items[i] : undefined;
  if (found && (found.kind === 'user' || found.kind === 'agent' || found.kind === 'thought')) {
    items[i] = { ...found, text: found.text + text };
    return { ...s, items };
  }
  return {
    ...s,
    seq: s.seq + 1,
    items: [...items, { kind, key: id ? `${kind}:${id}` : `${kind}#${s.seq}`, text }],
  };
}

function applyUpdate(s: ChatState, u: Obj): ChatState {
  switch (u.sessionUpdate) {
    // the person's own words come back only with a reopened chat's earlier turns
    case 'user_message_chunk':
      return appendText(s, 'user', str(u.messageId), words(u.content));
    case 'agent_message_chunk':
      return appendText(s, 'agent', str(u.messageId), words(u.content));
    case 'agent_thought_chunk':
      return appendText(s, 'thought', str(u.messageId), words(u.content));
    case 'tool_call': {
      const key = `tool:${str(u.toolCallId)}`;
      const item: ChatItem = {
        kind: 'tool',
        key,
        title: str(u.title, 'A tool'),
        tool: str(u.kind, 'other'),
        status: str(u.status, 'pending'),
        detail: detailOf(u),
      };
      const at = s.items.findIndex((it) => it.key === key);
      if (at < 0) return { ...s, items: [...s.items, item] };
      const items = [...s.items];
      items[at] = item;
      return { ...s, items };
    }
    case 'tool_call_update': {
      const key = `tool:${str(u.toolCallId)}`;
      const at = s.items.findIndex((it) => it.key === key);
      const was = at >= 0 ? s.items[at] : undefined;
      if (!was || was.kind !== 'tool') return s;
      const items = [...s.items];
      items[at] = {
        ...was,
        title: str(u.title, was.title),
        tool: str(u.kind, was.tool),
        status: str(u.status, was.status),
        detail: detailOf(u, was.detail),
      };
      return { ...s, items };
    }
    case 'plan': {
      const entries = (Array.isArray(u.entries) ? u.entries : []).filter(isObj).map((e) => ({
        content: str(e.content),
        status: str(e.status, 'pending'),
      }));
      // each plan replaces the last, in place
      const at = s.items.findLastIndex((it) => it.kind === 'plan');
      if (at < 0)
        return {
          ...s,
          seq: s.seq + 1,
          items: [...s.items, { kind: 'plan', key: `plan#${s.seq}`, entries }],
        };
      const items = [...s.items];
      items[at] = { kind: 'plan', key: (items[at] as ChatItem).key, entries };
      return { ...s, items };
    }
    case 'usage_update':
      return typeof u.used === 'number' && typeof u.size === 'number'
        ? { ...s, usage: { used: u.used, size: u.size } }
        : s;
    case 'current_mode_update':
      return { ...s, mode: { ...s.mode, current: str(u.currentModeId, s.mode.current) } };
    case 'available_commands_update':
      return {
        ...s,
        commands: (Array.isArray(u.availableCommands) ? u.availableCommands : [])
          .filter(isObj)
          .map((c) => ({ name: str(c.name), description: str(c.description) })),
      };
    default:
      return s;
  }
}

const choices = (v: unknown): Choice[] =>
  (Array.isArray(v) ? v : []).filter(isObj).map((c) => ({
    id: str(c.id),
    name: str(c.name, str(c.id)),
    ...(typeof c.description === 'string' ? { description: c.description } : {}),
  }));

/** One frame from the helper, folded in. Anything it doesn't know leaves the chat as it was. */
export function foldChat(s: ChatState, text: string): ChatState {
  let m: unknown;
  try {
    m = JSON.parse(text);
  } catch {
    return s;
  }
  if (!isObj(m)) return s;
  // the pairing's own answers, before the chat's
  if (m.paired === true) return { ...s, paired: true, agent: str(m.agent, s.agent) };
  if (typeof m.error === 'string' && m.t === undefined) return { ...s, error: m.error };
  switch (m.t) {
    case 'hello': {
      const mode = isObj(m.mode) ? m.mode : {};
      const usage = isObj(m.usage) ? m.usage : null;
      return {
        ...s,
        paired: true,
        agent: str(m.agent, s.agent),
        model: str(m.model, s.model),
        mode: { current: str(mode.current), available: choices(mode.available) },
        commands: (Array.isArray(m.commands) ? m.commands : [])
          .filter(isObj)
          .map((c) => ({ name: str(c.name), description: str(c.description) })),
        usage:
          usage && typeof usage.used === 'number' && typeof usage.size === 'number'
            ? { used: usage.used, size: usage.size }
            : s.usage,
        // the agent speaks first, so a turn is under way until it says it's done
        busy: true,
      };
    }
    case 'models': {
      const available = choices(m.available);
      const current = str(m.current, s.models.current);
      const named = available.find((c) => c.id === current)?.name;
      return { ...s, models: { current, available }, model: named ?? (current || s.model) };
    }
    case 'update':
      return isObj(m.update) ? applyUpdate(s, m.update) : s;
    // A reopened chat: its earlier turns, as they were, before anything live. It doesn't speak first.
    case 'history':
      return {
        ...(Array.isArray(m.updates) ? m.updates : []).filter(isObj).reduce(applyUpdate, s),
        busy: false,
      };
    case 'permission': {
      const call = isObj(m.toolCall) ? m.toolCall : {};
      return {
        ...s,
        permission: {
          id: typeof m.id === 'number' ? m.id : str(m.id),
          title: str(call.title, 'A tool'),
          options: (Array.isArray(m.options) ? m.options : []).filter(isObj).map((o) => ({
            optionId: str(o.optionId),
            name: str(o.name, str(o.optionId)),
            kind: str(o.kind),
          })),
        },
      };
    }
    case 'turn':
      return { ...s, busy: false, permission: null };
    case 'error':
      return { ...s, error: str(m.message, 'The agent had a problem.'), busy: false };
    case 'exit':
      return { ...s, exited: true, busy: false, permission: null };
    default:
      return s;
  }
}

/** The person sent something: it shows at once, and a turn is under way. */
export function asked(s: ChatState, text: string): ChatState {
  return {
    ...s,
    busy: true,
    error: null,
    seq: s.seq + 1,
    items: [...s.items, { kind: 'user', key: `user#${s.seq}`, text }],
  };
}

/** The person answered the agent's question about a tool. */
export const answered = (s: ChatState): ChatState => ({ ...s, permission: null });

/** The agents as people know them, by the helper's id. */
export const agentName = (id: string) =>
  ({ claude: 'Claude Code', codex: 'Codex', hermes: 'Hermes', gemini: 'Gemini' })[id] ?? id;

/** How much of the context window is used, as a whole percentage, or null when the agent hasn't said. */
export const contextUsed = (usage: ChatState['usage']) =>
  usage && usage.size > 0 ? Math.min(100, Math.round((usage.used / usage.size) * 100)) : null;

export const chatWords = {
  /** The box's bar before an agent is on it. */
  box: 'Your agent',
  you: 'You',
  thinking: 'Thinking',
  placeholder: 'Ask your agent',
  send: 'Send',
  stop: 'Stop',
  context: (pct: number) => `${pct}% of context`,
  asks: 'Your agent asks to',
  ended: 'Your agent has stopped. Start it again from the buttons above.',
} as const;
