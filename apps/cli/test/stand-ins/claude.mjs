#!/usr/bin/env node
// A stand-in for Claude Code in stream-json mode, for the chat box's tests and for building the page
// against: it speaks the wire as Claude's Agent SDK (0.3.x) does, and plays one turn: streamed text,
// a command that asks for approval, a todo list, and a closing line. A prompt with "wait" in it holds
// the turn until it's interrupted. It writes what it was given to $STAND_IN_LOG, one JSON line each.
import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const log = (entry) => {
  if (process.env.STAND_IN_LOG)
    appendFileSync(process.env.STAND_IN_LOG, `${JSON.stringify(entry)}\n`);
};
// STAND_IN_ONE_CHUNK holds its answer to initialize back, to send it with its first system line in
// one write, as a busy machine can deliver them
let holding = !!process.env.STAND_IN_ONE_CHUNK;
let held = '';
const out = (msg) => {
  const line = `${JSON.stringify(msg)}\n`;
  if (holding) {
    held += line;
    return;
  }
  process.stdout.write(held + line);
  held = '';
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
log({
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  home: process.env.HOME,
  exploration: process.env.PETALS_EXPLORATION ?? null,
});

const MODEL = 'claude-stand-in-1';
let mode = 'default';
let turn = 0;
const waiting = new Map(); // request_id -> resolve
let interrupted = null;

const session = 'stand-in-session';
const init = () =>
  out({
    type: 'system',
    subtype: 'init',
    session_id: session,
    cwd: process.cwd(),
    model: MODEL,
    permissionMode: mode,
    slash_commands: ['compact', 'review'],
    tools: ['Bash', 'Read', 'TodoWrite', 'mcp__petals__render_flower'],
    mcp_servers: [{ name: 'petals', status: 'connected' }],
  });
const ev = (event) =>
  out({ type: 'stream_event', event, parent_tool_use_id: null, session_id: session });
const ask = (request_id, request) =>
  new Promise((resolve) => {
    waiting.set(request_id, resolve);
    out({ type: 'control_request', request_id, request });
  });

async function play(text) {
  turn += 1;
  holding = false;
  init();
  if (process.env.STAND_IN_LOGGED_OUT) {
    // what a claude that isn't signed in says, as Claude Code 2.1 does
    const said = 'Not logged in · Please run /login';
    out({
      type: 'assistant',
      session_id: session,
      parent_tool_use_id: null,
      message: {
        id: `synthetic-${turn}`,
        model: '<synthetic>',
        content: [{ type: 'text', text: said }],
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    });
    out({
      type: 'result',
      subtype: 'success',
      is_error: true,
      result: said,
      session_id: session,
      usage: {},
      modelUsage: {},
      terminal_reason: 'api_error',
    });
    return;
  }
  const id = `msg_${turn}_a`;
  ev({
    type: 'message_start',
    message: { id, usage: { input_tokens: 12, cache_read_input_tokens: 900 } },
  });
  ev({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
  for (const piece of ['Hello', ", I'm the stand-in."]) {
    ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: piece } });
    await delay(5);
  }
  if (text.includes('wait')) {
    await new Promise((resolve) => {
      interrupted = resolve;
    });
    out({
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      session_id: session,
      usage: {},
      modelUsage: {},
    });
    return;
  }
  ev({ type: 'content_block_stop', index: 0 });
  ev({
    type: 'content_block_start',
    index: 1,
    content_block: { type: 'tool_use', id: `toolu_${turn}_bash`, name: 'Bash', input: {} },
  });
  ev({ type: 'content_block_stop', index: 1 });
  ev({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 30 } });
  ev({ type: 'message_stop' });
  const input = { command: 'echo hi', description: 'Say hi' };
  out({
    type: 'assistant',
    session_id: session,
    parent_tool_use_id: null,
    message: {
      id,
      role: 'assistant',
      model: MODEL,
      content: [
        { type: 'text', text: "Hello, I'm the stand-in." },
        { type: 'tool_use', id: `toolu_${turn}_bash`, name: 'Bash', input },
      ],
      usage: { input_tokens: 12, cache_read_input_tokens: 900, output_tokens: 30 },
    },
  });
  const answer = await ask(`perm-${turn}`, {
    subtype: 'can_use_tool',
    tool_name: 'Bash',
    input,
    tool_use_id: `toolu_${turn}_bash`,
    permission_suggestions: [
      {
        type: 'addRules',
        rules: [{ toolName: 'Bash', ruleContent: 'echo:*' }],
        behavior: 'allow',
        destination: 'localSettings',
      },
    ],
  });
  const allowed = answer?.response?.response?.behavior === 'allow';
  out({
    type: 'user',
    session_id: session,
    parent_tool_use_id: null,
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: `toolu_${turn}_bash`,
          content: allowed ? 'hi' : 'The person declined',
          is_error: !allowed,
        },
      ],
    },
    tool_use_result: allowed ? { stdout: 'hi', stderr: '' } : 'declined',
  });
  // a subagent's chatter, which the chat leaves to its tool call
  out({
    type: 'assistant',
    session_id: session,
    parent_tool_use_id: 'toolu_x',
    message: { id: 'msg_sub', content: [{ type: 'text', text: 'SUBAGENT' }] },
  });
  out({
    type: 'assistant',
    session_id: session,
    parent_tool_use_id: null,
    message: {
      id: `msg_${turn}_b`,
      content: [
        {
          type: 'tool_use',
          id: `toolu_${turn}_todo`,
          name: 'TodoWrite',
          input: {
            todos: [
              { content: 'Map the validators', status: 'in_progress' },
              { content: 'Draw the flower', status: 'pending' },
            ],
          },
        },
      ],
      usage: { input_tokens: 12, cache_read_input_tokens: 950, output_tokens: 40 },
    },
  });
  out({
    type: 'user',
    session_id: session,
    parent_tool_use_id: null,
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: `toolu_${turn}_todo`, content: 'ok' }],
    },
  });
  out({
    type: 'assistant',
    session_id: session,
    parent_tool_use_id: null,
    message: {
      id: `msg_${turn}_c`,
      content: [{ type: 'text', text: 'Done.' }],
      usage: { input_tokens: 12, cache_read_input_tokens: 1000, output_tokens: 8 },
    },
  });
  out({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'Done.',
    session_id: session,
    num_turns: 3,
    usage: { input_tokens: 36, output_tokens: 78 },
    modelUsage: { [MODEL]: { inputTokens: 36, outputTokens: 78, contextWindow: 200000 } },
  });
}

createInterface({ input: process.stdin }).on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    log({ notJson: line });
    return;
  }
  log({ in: msg });
  if (msg.type === 'user') {
    const text = (msg.message?.content ?? []).map((c) => c.text ?? '').join('');
    void play(text);
  } else if (msg.type === 'control_response') {
    const resolve = waiting.get(msg.response?.request_id);
    if (resolve) {
      waiting.delete(msg.response.request_id);
      resolve(msg);
    }
  } else if (msg.type === 'control_request') {
    const r = msg.request ?? {};
    const reply = (response) =>
      out({
        type: 'control_response',
        response: { subtype: 'success', request_id: msg.request_id, response },
      });
    if (r.subtype === 'initialize') {
      reply({
        commands: [{ name: 'compact', description: 'Clear history but keep a summary' }],
        models: [
          {
            value: 'default',
            displayName: 'Default (recommended)',
            description: 'The stand-in default',
          },
          { value: 'sonnet', displayName: 'Sonnet', description: 'A stand-in Sonnet' },
        ],
        account: {},
      });
    } else if (r.subtype === 'interrupt') {
      reply({ still_queued: [] });
      for (const [id, resolve] of waiting) {
        out({ type: 'control_cancel_request', request_id: id });
        resolve(null);
      }
      waiting.clear();
      interrupted?.();
      interrupted = null;
    } else if (r.subtype === 'set_permission_mode') {
      mode = r.mode;
      reply({});
    } else if (r.subtype === 'set_model') {
      reply({});
    } else {
      out({
        type: 'control_response',
        response: { subtype: 'error', request_id: msg.request_id, error: `unknown ${r.subtype}` },
      });
    }
  }
});
process.stdin.on('end', () => process.exit(0));
