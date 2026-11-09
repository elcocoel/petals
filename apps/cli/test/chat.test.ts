// The chat box (004 W10): the person's own agent in its structured mode, its events to the page as
// one shape, and the page's prompts, approvals and choices back. Stand-ins take the agents' place
// (test/stand-ins), with a throwaway HOME: no real agent, login or ~/.petals is touched.
import { existsSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { WebSocket } from 'ws';
import { fromPage, type ToPage } from '../src/chat.ts';
import { toolKind, toolTitle } from '../src/claude.ts';
import { type Agent, FIRST_MESSAGE, startTerminal, type TerminalHelper } from '../src/terminal.ts';

const SITE = 'https://petals.example';
const LINK = `${SITE}/s/${'a'.repeat(43)}`;
const STAND_INS = join(import.meta.dirname, 'stand-ins');
let port = 47900 + Math.floor(Math.random() * 300);
let helper: TerminalHelper | null = null;

afterEach(async () => {
  await helper?.close();
  helper = null;
});

interface Run {
  h: TerminalHelper;
  log: string;
  home: string;
  said: string[];
}

async function start(
  agent: Agent,
  standIn: string,
  extra: Record<string, string> = {},
): Promise<Run> {
  port += 1;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'petal-chat-')));
  const log = join(dir, 'stand-in.log');
  const home = join(dir, 'petals');
  const said: string[] = [];
  helper = await startTerminal({
    agent,
    command: [process.execPath, join(STAND_INS, standIn)],
    port,
    origins: [SITE],
    cwd: dir,
    env: { ...process.env, HOME: join(dir, 'home'), STAND_IN_LOG: log, ...extra },
    say: (l) => said.push(l),
    openPage: false,
    petals: { node: process.execPath, file: '/nowhere/petal.mjs', site: SITE, home },
    skill: async () => 'THE SKILL',
  });
  return { h: helper, log, home, said };
}

const until = async (ok: () => boolean, ms = 8000) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
  return ok();
};

interface Page {
  ws: WebSocket;
  got: (ToPage | Record<string, unknown>)[];
  closed?: number;
  send: (m: unknown) => void;
  find: (ok: (e: Record<string, unknown>) => boolean) => Record<string, unknown> | undefined;
  updates: (kind: string) => Record<string, unknown>[];
}

/** Opens /chat as the page would, and pairs. */
async function pair(h: TerminalHelper, exploration?: string): Promise<Page> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/chat`, { origin: SITE });
  await new Promise((r, j) => {
    ws.once('open', r);
    ws.once('error', j);
  });
  const page: Page = {
    ws,
    got: [],
    send: (m) => ws.send(JSON.stringify(m)),
    find: (ok) =>
      page.got.find((e) => ok(e as Record<string, unknown>)) as Record<string, unknown> | undefined,
    updates: (kind) =>
      page.got
        .filter((e) => (e as { t?: string }).t === 'update')
        .map((e) => (e as { update: Record<string, unknown> }).update)
        .filter((u) => u.sessionUpdate === kind),
  };
  ws.on('message', (raw) => page.got.push(JSON.parse(raw.toString())));
  ws.on('close', (code) => {
    page.closed = code;
  });
  ws.send(JSON.stringify({ pair: h.code(), ...(exploration ? { exploration } : {}) }));
  return page;
}

const logged = (log: string) =>
  existsSync(log)
    ? readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l) as Record<string, unknown>)
    : [];
const sent = (log: string) =>
  logged(log)
    .map((l) => l.in as Record<string, unknown> | undefined)
    .filter(Boolean) as Record<string, unknown>[];

describe('Claude Code, in stream-json', () => {
  test('one turn: streamed text, a command to approve, a plan, the usage, and the end', async () => {
    const { h, log, home } = await start('claude', 'claude.mjs');
    const page = await pair(h, LINK);

    expect(await until(() => !!page.find((e) => e.t === 'hello'))).toBe(true);
    expect(page.got[0]).toEqual({ paired: true, agent: 'claude' });
    const hello = page.find((e) => e.t === 'hello') as Extract<ToPage, { t: 'hello' }>;
    expect(hello).toMatchObject({
      agent: 'Claude Code',
      model: 'claude-stand-in-1',
      mode: { current: 'default' },
      commands: [{ name: 'compact', description: 'Clear history but keep a summary' }],
    });
    expect(hello.mode?.available.map((m) => m.id)).toEqual(['default', 'acceptEdits', 'plan']);
    expect(await until(() => !!page.find((e) => e.t === 'models'))).toBe(true);
    expect(page.find((e) => e.t === 'models')).toMatchObject({
      current: 'default',
      available: [
        { id: 'default', name: 'Default (recommended)' },
        { id: 'sonnet', name: 'Sonnet' },
      ],
    });

    // the person's claude got the chat's flags, Petals' tools for this session, and the opening
    const first = logged(log)[0] as { argv: string[]; cwd: string; exploration: string | null };
    expect(first.argv).toEqual(
      expect.arrayContaining([
        '-p',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
      ]),
    );
    expect(first.argv.join(' ')).toContain('--permission-prompt-tool stdio');
    expect(first.argv.join(' ')).toContain('--allowedTools mcp__petals');
    const mcp = JSON.parse(first.argv[first.argv.indexOf('--mcp-config') + 1] as string);
    expect(mcp.mcpServers.petals).toMatchObject({
      command: process.execPath,
      args: ['/nowhere/petal.mjs', 'mcp'],
      env: { PETALS_HOME: home, PETALS_SITE: SITE, PETALS_EXPLORATION: LINK },
    });
    expect(first.cwd).toBe(join(home, 'work'));
    expect(readFileSync(join(home, 'work', 'CLAUDE.md'), 'utf8')).toContain(
      'your replies as a chat',
    );
    const opening = sent(log).find((m) => m.type === 'user') as {
      message: { content: { text: string }[] };
    };
    expect(opening.message.content[0]?.text).toBe(FIRST_MESSAGE);

    // streamed text, once: the whole message that follows isn't sent again
    expect(await until(() => !!page.find((e) => e.t === 'permission'))).toBe(true);
    const chunks = page
      .updates('agent_message_chunk')
      .map((u) => (u.content as { text: string }).text);
    expect(chunks).toEqual(['Hello', ", I'm the stand-in."]);
    expect(page.updates('tool_call')[0]).toMatchObject({
      toolCallId: 'toolu_1_bash',
      status: 'pending',
      kind: 'execute',
    });
    expect(page.updates('tool_call_update')[0]).toMatchObject({
      toolCallId: 'toolu_1_bash',
      status: 'in_progress',
      title: 'Say hi',
      rawInput: { command: 'echo hi' },
    });
    const ask = page.find((e) => e.t === 'permission') as Extract<ToPage, { t: 'permission' }>;
    expect(ask.id).toBe('perm-1');
    expect(ask.options.map((o) => o.kind)).toEqual(['allow_once', 'allow_always', 'reject_once']);
    expect(ask.toolCall).toMatchObject({
      toolCallId: 'toolu_1_bash',
      title: 'Say hi',
      kind: 'execute',
    });

    // "always" holds for this session only: nothing goes to the person's settings
    page.send({ t: 'permission', id: 'perm-1', optionId: 'always' });
    expect(await until(() => !!page.find((e) => e.t === 'turn'))).toBe(true);
    const reply = sent(log).find((m) => m.type === 'control_response') as {
      response: {
        request_id: string;
        response: {
          behavior: string;
          updatedPermissions: { destination: string }[];
          toolUseID: string;
        };
      };
    };
    expect(reply.response.request_id).toBe('perm-1');
    expect(reply.response.response).toMatchObject({ behavior: 'allow', toolUseID: 'toolu_1_bash' });
    expect(reply.response.response.updatedPermissions.map((p) => p.destination)).toEqual([
      'session',
    ]);

    const done = page.updates('tool_call_update').find((u) => u.status === 'completed');
    expect(done).toMatchObject({
      toolCallId: 'toolu_1_bash',
      content: [{ type: 'content', content: { type: 'text', text: 'hi' } }],
    });
    expect(page.updates('plan')[0]).toMatchObject({
      entries: [
        { content: 'Map the validators', status: 'in_progress' },
        { content: 'Draw the flower', status: 'pending' },
      ],
    });
    // the todo list is a plan, not a tool call; a subagent's words stay in its tool call
    expect(page.updates('tool_call').some((u) => u.toolCallId === 'toolu_1_todo')).toBe(false);
    const text = page
      .updates('agent_message_chunk')
      .map((u) => (u.content as { text: string }).text);
    expect(text).toContain('Done.');
    expect(text).not.toContain('SUBAGENT');
    const usage = page.updates('usage_update');
    expect(usage.at(-1)).toMatchObject({ used: 1020, size: 200000 });
    expect(page.find((e) => e.t === 'turn')).toEqual({ t: 'turn', stopReason: 'end_turn' });
    page.ws.close();
  });

  test('the person writes, stops a turn, and switches the mode and the model', async () => {
    const { h, log } = await start('claude', 'claude.mjs');
    const page = await pair(h);
    expect(await until(() => !!page.find((e) => e.t === 'permission'))).toBe(true);
    page.send({ t: 'permission', id: 'perm-1', optionId: 'reject' });
    expect(await until(() => page.got.filter((e) => e.t === 'turn').length === 1)).toBe(true);
    const denied = sent(log).find((m) => m.type === 'control_response') as {
      response: { response: { behavior: string } };
    };
    expect(denied.response.response.behavior).toBe('deny');
    expect(page.updates('tool_call_update').some((u) => u.status === 'failed')).toBe(true);

    page.send({ t: 'prompt', text: 'please wait for me' });
    expect(
      await until(() =>
        sent(log).some((m) => m.type === 'user' && JSON.stringify(m).includes('please wait')),
      ),
    ).toBe(true);
    page.send({ t: 'cancel' });
    expect(await until(() => page.got.filter((e) => e.t === 'turn').length === 2)).toBe(true);
    expect(page.got.filter((e) => e.t === 'turn').at(-1)).toEqual({
      t: 'turn',
      stopReason: 'cancelled',
    });
    expect(page.find((e) => e.t === 'error')).toBeUndefined();

    page.send({ t: 'mode', id: 'plan' });
    expect(await until(() => page.updates('current_mode_update').length > 0)).toBe(true);
    expect(page.updates('current_mode_update')[0]).toMatchObject({ currentModeId: 'plan' });
    page.send({ t: 'mode', id: 'bypassPermissions' }); // not offered: ignored
    page.send({ t: 'model', id: 'sonnet' });
    expect(await until(() => page.got.filter((e) => e.t === 'models').length === 2)).toBe(true);
    expect(page.got.filter((e) => e.t === 'models').at(-1)).toMatchObject({ current: 'sonnet' });
    const asked = sent(log)
      .filter((m) => m.type === 'control_request')
      .map((m) => (m.request as { subtype: string }).subtype);
    expect(asked).toEqual(['initialize', 'interrupt', 'set_permission_mode', 'set_model']);
    page.ws.close();
  });

  test("a claude that isn't signed in says so once, as its own reply", async () => {
    const { h } = await start('claude', 'claude.mjs', { STAND_IN_LOGGED_OUT: '1' });
    const page = await pair(h);
    expect(await until(() => !!page.find((e) => e.t === 'turn'))).toBe(true);
    const text = page
      .updates('agent_message_chunk')
      .map((u) => (u.content as { text: string }).text);
    expect(text).toEqual(['Not logged in · Please run /login']);
    expect(page.find((e) => e.t === 'error')).toBeUndefined();
    page.ws.close();
  });

  test('closing the box ends the agent', async () => {
    const { h, said } = await start('claude', 'claude.mjs');
    const page = await pair(h);
    expect(await until(() => !!page.find((e) => e.t === 'hello'))).toBe(true);
    page.ws.close();
    // the stand-in exits on end of input, and the helper takes the next session
    expect(await until(() => said.some((l) => l.includes('Claude Code ended')))).toBe(true);
    const next = await pair(h);
    expect(await until(() => !!next.find((e) => e.t === 'hello'))).toBe(true);
    next.ws.close();
  });
});

describe('an ACP agent (Hermes)', () => {
  test('hello with its modes and models, a turn with an approval, a cancel, and its choices', async () => {
    const { h, log } = await start('hermes', 'acp.mjs');
    const page = await pair(h, LINK);
    expect(await until(() => !!page.find((e) => e.t === 'permission'))).toBe(true);
    expect(page.find((e) => e.t === 'hello')).toMatchObject({
      agent: 'Hermes',
      model: 'Model one',
      mode: { current: 'ask', available: [{ id: 'ask' }, { id: 'code' }] },
    });
    expect(page.find((e) => e.t === 'models')).toMatchObject({
      current: 'm1',
      available: [{ id: 'm1' }, { id: 'm2' }],
    });
    const first = logged(log)[0] as { argv: string[] };
    expect(first.argv).toEqual(['acp']);
    const init = sent(log).find((m) => m.method === 'initialize') as {
      params: Record<string, unknown>;
    };
    expect(init.params).toMatchObject({
      protocolVersion: 1,
      clientCapabilities: { terminal: false },
    });
    const prompt = sent(log).find((m) => m.method === 'session/prompt') as {
      params: { prompt: { text: string }[] };
    };
    expect(prompt.params.prompt[0]?.text).toBe(FIRST_MESSAGE);

    const ask = page.find((e) => e.t === 'permission') as Extract<ToPage, { t: 'permission' }>;
    page.send({ t: 'permission', id: ask.id, optionId: 'yes' });
    expect(await until(() => !!page.find((e) => e.t === 'turn'))).toBe(true);
    expect(page.updates('tool_call_update')[0]).toMatchObject({ status: 'completed' });
    expect(page.updates('usage_update')[0]).toMatchObject({ used: 1234, size: 128000 });
    const answered = sent(log).find((m) => m.id === 100 && !m.method) as { result: unknown };
    expect(answered.result).toEqual({ outcome: { outcome: 'selected', optionId: 'yes' } });

    page.send({ t: 'prompt', text: 'wait here' });
    await until(() => sent(log).filter((m) => m.method === 'session/prompt').length === 2);
    page.send({ t: 'cancel' });
    expect(await until(() => page.got.filter((e) => e.t === 'turn').length === 2)).toBe(true);
    expect(page.got.filter((e) => e.t === 'turn').at(-1)).toEqual({
      t: 'turn',
      stopReason: 'cancelled',
    });

    page.send({ t: 'mode', id: 'code' });
    page.send({ t: 'model', id: 'm2' });
    expect(await until(() => page.updates('current_mode_update').length > 0)).toBe(true);
    expect(await until(() => page.got.filter((e) => e.t === 'models').length === 2)).toBe(true);
    expect(page.got.filter((e) => e.t === 'models').at(-1)).toMatchObject({ current: 'm2' });
    page.ws.close();
  });
});

describe('who may connect, and what the page may say', () => {
  test('/chat refuses another site, as /pty does', async () => {
    await start('claude', 'claude.mjs');
    const status = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/chat`, {
        origin: 'https://elsewhere.example',
      });
      ws.once('unexpected-response', (_q, res) => resolve(res.statusCode ?? 0));
      ws.once('open', () => resolve(101));
    });
    expect(status).toBe(403);
  });

  test('Codex stays in the terminal box for now', async () => {
    const { h } = await start('codex', 'claude.mjs');
    const page = await pair(h);
    expect(await until(() => page.closed !== undefined)).toBe(true);
    expect(page.find((e) => e.t === 'error')).toBeTruthy();
    expect(page.find((e) => e.t === 'exit')).toEqual({ t: 'exit', code: 2 });
  });

  test("the page's messages, and nothing else", () => {
    expect(fromPage('{"t":"prompt","text":"hi"}')).toEqual({ t: 'prompt', text: 'hi' });
    expect(fromPage('{"t":"prompt","text":"   "}')).toBeNull();
    expect(fromPage('{"t":"permission","id":"p1","optionId":null}')).toEqual({
      t: 'permission',
      id: 'p1',
      optionId: null,
    });
    expect(fromPage('{"t":"run","command":"rm -rf ~"}')).toBeNull();
    expect(fromPage('not json')).toBeNull();
  });

  test('tool calls read as a short line', () => {
    expect(toolTitle('Bash', { command: 'ls', description: 'List files' })).toBe('List files');
    expect(toolTitle('Read', { file_path: '/a/b.md' })).toBe('Read /a/b.md');
    expect(toolTitle('mcp__petals__render_flower', {})).toBe('render flower');
    expect(toolKind('Edit')).toBe('edit');
    expect(toolKind('mcp__petals__render_flower')).toBe('other');
  });
});
