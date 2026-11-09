#!/usr/bin/env node
// A stand-in ACP agent (agentclientprotocol.com, v1) for the chat box's tests: one turn of text, an
// approval and a finished tool call. A prompt with "wait" in it holds the turn until session/cancel.
// It writes what it was given to $STAND_IN_LOG, one JSON line each.
import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const log = (entry) => {
  if (process.env.STAND_IN_LOG)
    appendFileSync(process.env.STAND_IN_LOG, `${JSON.stringify(entry)}\n`);
};
const out = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);
log({ argv: process.argv.slice(2), cwd: process.cwd(), home: process.env.HOME });

const sessionId = 'acp-stand-in';
const SESSION = {
  modes: {
    currentModeId: 'ask',
    availableModes: [
      { id: 'ask', name: 'Ask' },
      { id: 'code', name: 'Code' },
    ],
  },
  models: {
    currentModelId: 'm1',
    availableModels: [
      { modelId: 'm1', name: 'Model one' },
      { modelId: 'm2', name: 'Model two' },
    ],
  },
};
const update = (u) => out({ method: 'session/update', params: { sessionId, update: u } });
const waiting = new Map();
let held = null;
let asked = 100;

async function prompt(id, text) {
  update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hi from ACP.' } });
  if (text.includes('wait')) {
    await new Promise((resolve) => {
      held = resolve;
    });
    out({ id, result: { stopReason: 'cancelled' } });
    return;
  }
  update({
    sessionUpdate: 'tool_call',
    toolCallId: 'call_1',
    title: 'Read notes.md',
    kind: 'read',
    status: 'pending',
  });
  const ask = asked++;
  const answer = await new Promise((resolve) => {
    waiting.set(ask, resolve);
    out({
      id: ask,
      method: 'session/request_permission',
      params: {
        sessionId,
        toolCall: { toolCallId: 'call_1', title: 'Read notes.md', kind: 'read' },
        options: [
          { optionId: 'yes', name: 'Allow', kind: 'allow_once' },
          { optionId: 'no', name: 'Reject', kind: 'reject_once' },
        ],
      },
    });
  });
  const ok = answer?.outcome?.outcome === 'selected' && answer.outcome.optionId === 'yes';
  update({
    sessionUpdate: 'tool_call_update',
    toolCallId: 'call_1',
    status: ok ? 'completed' : 'failed',
  });
  update({ sessionUpdate: 'usage_update', used: 1234, size: 128000 });
  out({ id, result: { stopReason: 'end_turn' } });
}

createInterface({ input: process.stdin }).on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  log({ in: msg });
  if (!msg.method && 'id' in msg) {
    const resolve = waiting.get(msg.id);
    if (resolve) {
      waiting.delete(msg.id);
      resolve(msg.result);
    }
    return;
  }
  const p = msg.params ?? {};
  switch (msg.method) {
    case 'initialize':
      return out({
        id: msg.id,
        result: {
          protocolVersion: 1,
          agentCapabilities: { loadSession: true },
          agentInfo: { name: 'stand-in', title: 'Stand-in', version: '1' },
        },
      });
    case 'session/new':
      return out({ id: msg.id, result: { sessionId, ...SESSION } });
    case 'session/load':
      // a saved session: its turns come back as updates, then the answer
      update({
        sessionUpdate: 'user_message_chunk',
        content: { type: 'text', text: 'An earlier question' },
      });
      update({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'An earlier answer' },
      });
      return out({ id: msg.id, result: SESSION });
    case 'session/prompt':
      return void prompt(msg.id, (p.prompt ?? []).map((c) => c.text ?? '').join(''));
    case 'session/cancel':
      held?.();
      held = null;
      return;
    case 'session/set_mode':
    case 'session/set_model':
      return out({ id: msg.id, result: {} });
    default:
      if ('id' in msg) out({ id: msg.id, error: { code: -32601, message: 'no' } });
  }
});
process.stdin.on('end', () => process.exit(0));
