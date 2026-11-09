// The chat in the box (W10): CONNECTORS's frames, with ACP update objects inside, folded into what shows.
import { describe, expect, test } from 'vitest';
import {
  agentName,
  answered,
  asked,
  type ChatState,
  chatHello,
  contextUsed,
  emptyChat,
  foldChat,
  helperChatUrl,
  toHelper,
} from '../lib/agent-chat.ts';

const fold = (s: ChatState, ...frames: object[]) =>
  frames.reduce<ChatState>((acc, f) => foldChat(acc, JSON.stringify(f)), s);
const update = (u: object) => ({ t: 'update', update: u });

describe('the chat in the box', () => {
  test('talks only to this computer, and pairs with the code and the page’s conversation', () => {
    expect(helperChatUrl()).toBe('ws://127.0.0.1:7466/chat');
    expect(JSON.parse(chatHello('abc12345', 'https://site/s/t'))).toEqual({
      pair: 'abc12345',
      exploration: 'https://site/s/t',
    });
    expect(JSON.parse(chatHello('abc12345', null))).toEqual({ pair: 'abc12345' });
  });

  test('hello pairs it, names the agent, its model, modes and context, and the agent speaks first', () => {
    const s = fold(emptyChat, {
      t: 'hello',
      agent: 'claude',
      model: 'Opus',
      mode: {
        current: 'default',
        available: [
          { id: 'default', name: 'Ask' },
          { id: 'plan', name: 'Plan' },
        ],
      },
      usage: { used: 2000, size: 200000 },
    });
    expect(s.paired).toBe(true);
    expect(agentName(s.agent)).toBe('Claude Code');
    expect(s.model).toBe('Opus');
    expect(s.mode.available.map((m) => m.id)).toEqual(['default', 'plan']);
    expect(contextUsed(s.usage)).toBe(1);
    expect(s.busy).toBe(true);
  });

  test('message chunks join their message; a new message id starts another', () => {
    const s = fold(
      emptyChat,
      update({
        sessionUpdate: 'agent_message_chunk',
        messageId: 'm1',
        content: { type: 'text', text: 'Hel' },
      }),
      update({
        sessionUpdate: 'agent_message_chunk',
        messageId: 'm1',
        content: { type: 'text', text: 'lo' },
      }),
      update({
        sessionUpdate: 'agent_message_chunk',
        messageId: 'm2',
        content: { type: 'text', text: 'Next' },
      }),
    );
    expect(s.items.map((i) => (i.kind === 'agent' ? i.text : ''))).toEqual(['Hello', 'Next']);
  });

  test('chunks with no id join the last message of their kind', () => {
    const s = fold(
      emptyChat,
      update({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Hmm ' } }),
      update({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'yes' } }),
      update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Done' } }),
    );
    expect(s.items.map((i) => i.kind)).toEqual(['thought', 'agent']);
    expect(s.items[0]).toMatchObject({ text: 'Hmm yes' });
  });

  test('a tool call is one line that its updates change in place', () => {
    const s = fold(
      emptyChat,
      update({
        sessionUpdate: 'tool_call',
        toolCallId: 't1',
        title: 'Read the map',
        kind: 'read',
        status: 'pending',
        rawInput: { network: 'near' },
      }),
      update({ sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed' }),
    );
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ kind: 'tool', title: 'Read the map', status: 'completed' });
    expect(s.items[0]?.kind === 'tool' && s.items[0].detail).toContain('"network": "near"');
  });

  test('a plan replaces the last plan in place', () => {
    const s = fold(
      emptyChat,
      update({ sessionUpdate: 'plan', entries: [{ content: 'Find it', status: 'in_progress' }] }),
      update({ sessionUpdate: 'plan', entries: [{ content: 'Find it', status: 'completed' }] }),
    );
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ kind: 'plan', entries: [{ status: 'completed' }] });
  });

  test('a question about a tool shows its options, and answering clears it', () => {
    const s = fold(emptyChat, {
      t: 'permission',
      id: 7,
      toolCall: { toolCallId: 't1', title: 'Run curl' },
      options: [
        { optionId: 'yes', name: 'Allow', kind: 'allow_once' },
        { optionId: 'no', name: 'Deny', kind: 'reject_once' },
      ],
    });
    expect(s.permission).toMatchObject({ id: 7, title: 'Run curl' });
    expect(s.permission?.options.map((o) => o.name)).toEqual(['Allow', 'Deny']);
    expect(answered(s).permission).toBeNull();
    expect(JSON.parse(toHelper.permission(7, 'yes'))).toEqual({
      t: 'permission',
      id: 7,
      optionId: 'yes',
    });
  });

  test('the person’s words show at once; the turn ends when the helper says so', () => {
    const sent = asked(emptyChat, 'Map Moloch DAO');
    expect(sent.items.at(-1)).toMatchObject({ kind: 'user', text: 'Map Moloch DAO' });
    expect(sent.busy).toBe(true);
    expect(fold(sent, { t: 'turn', stopReason: 'end_turn' }).busy).toBe(false);
    expect(JSON.parse(toHelper.prompt('hi'))).toEqual({ t: 'prompt', text: 'hi' });
  });

  test('models, usage, modes and the end', () => {
    const s = fold(
      emptyChat,
      {
        t: 'models',
        current: 'o',
        available: [
          { id: 'o', name: 'Opus' },
          { id: 's', name: 'Sonnet' },
        ],
      },
      update({ sessionUpdate: 'usage_update', used: 50000, size: 200000 }),
      update({ sessionUpdate: 'current_mode_update', currentModeId: 'plan' }),
      { t: 'exit', code: 0 },
    );
    expect(s.model).toBe('Opus');
    expect(contextUsed(s.usage)).toBe(25);
    expect(s.mode.current).toBe('plan');
    expect(s.exited).toBe(true);
  });

  test('anything it doesn’t know, or can’t read, leaves the chat as it was', () => {
    expect(foldChat(emptyChat, 'not json')).toBe(emptyChat);
    expect(foldChat(emptyChat, '{"t":"later"}')).toBe(emptyChat);
    expect(fold(emptyChat, update({ sessionUpdate: 'something_new' }))).toBe(emptyChat);
  });
});
