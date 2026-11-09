// The terminal helper (004 W10): only this machine, only the Petals site, one pairing code shown here,
// one session at a time, and closing the box ends the program. Stand-in programs take the agent's place.
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { WebSocket } from 'ws';
import {
  FIRST_MESSAGE,
  findAgent,
  findPython,
  inPetals,
  pageUrl,
  parseTerminalArgs,
  sessionNotes,
  startTerminal,
  type TerminalHelper,
} from '../src/terminal.ts';

const SITE = 'https://petals.example';
const hasPython = findPython() !== null;
let port = 47600 + Math.floor(Math.random() * 300);
let helper: TerminalHelper | null = null;
let said: string[] = [];
const opened: string[] = [];

async function start(
  command: string[] | null,
  find?: (name: string) => string | null,
  petalsHome?: string,
) {
  port += 1;
  // each helper its own log: one still shutting down mustn't speak for the next
  const mine: string[] = [];
  said = mine;
  helper = await startTerminal({
    agent: 'claude',
    ...(command ? { command } : {}),
    ...(find ? { find } : {}),
    ...(petalsHome
      ? {
          petals: { node: '/usr/bin/node', file: '/x/petal.mjs', site: SITE, home: petalsHome },
          skill: async () => 'THE SKILL',
        }
      : {}),
    port,
    origins: [SITE],
    cwd: mkdtempSync(join(tmpdir(), 'petal-term-')),
    say: (l) => mine.push(l),
    // never the real browser in a test: the address it would open is kept instead
    openPage: (url) => opened.push(url),
  });
  return helper;
}

afterEach(async () => {
  await helper?.close();
  helper = null;
});

/** Opens /pty as a page at `origin` would; resolves with the socket, or the refusal's status. */
function open(origin = SITE, host?: string): Promise<WebSocket | number> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/pty`, {
      origin,
      ...(host ? { headers: { host } } : {}),
    });
    ws.once('open', () => resolve(ws));
    ws.once('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
    ws.once('error', () => resolve(-1));
  });
}

interface Seen {
  text: string[];
  output: string;
  close?: number;
}

function watch(ws: WebSocket): Seen {
  const seen: Seen = { text: [], output: '' };
  ws.on('message', (raw, isBinary) => {
    if (isBinary) seen.output += raw.toString();
    else seen.text.push(raw.toString());
  });
  ws.on('close', (code) => {
    seen.close = code;
  });
  return seen;
}

const until = async (ok: () => boolean, ms = 8000) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
  return ok();
};

describe.skipIf(!hasPython)('who may connect', () => {
  test('another site is refused before any code is asked for', async () => {
    await start(['cat']);
    expect(await open('https://elsewhere.example')).toBe(403);
    expect(await open('')).toBe(403);
    expect(said.some((l) => l.includes("isn't allowed"))).toBe(true);
  });

  test('a page that renamed itself to this address is refused by its Host', async () => {
    await start(['cat']);
    expect(await open(SITE, `evil.example:${port}`)).toBe(403);
  });

  test('a wrong code is refused, and five retire it', async () => {
    const h = await start(['cat']);
    const first = h.code();
    for (let i = 0; i < 5; i++) {
      const ws = (await open()) as WebSocket;
      const seen = watch(ws);
      ws.send(JSON.stringify({ pair: 'WRONG-CODE' }));
      await until(() => seen.close !== undefined);
      expect(seen.close).toBe(4401);
    }
    expect(h.code()).not.toBe(first);
    expect(said.some((l) => l.includes('retired'))).toBe(true);
  });
});

describe.skipIf(!hasPython)('a session', () => {
  test('pairs with the code, then keystrokes, a resize and the exit go through', async () => {
    const h = await start([
      'sh',
      '-c',
      'stty size; read line; echo "got:$line"; stty size; exit 3',
    ]);
    const code = h.code();
    const ws = (await open()) as WebSocket;
    const seen = watch(ws);
    ws.send(JSON.stringify({ pair: code.toLowerCase(), cols: 120, rows: 32 }));
    expect(await until(() => seen.text.some((t) => t.includes('"paired":true')))).toBe(true);
    const reply = JSON.parse(seen.text[0] as string) as { agent: string };
    expect(reply.agent).toBe('claude');
    expect(await until(() => seen.output.includes('32 120'))).toBe(true);
    ws.send(JSON.stringify({ resize: { cols: 80, rows: 24 } }));
    await new Promise((r) => setTimeout(r, 200));
    ws.send('hello\r');
    expect(await until(() => seen.output.includes('got:hello'))).toBe(true);
    expect(await until(() => seen.output.includes('24 80'))).toBe(true);
    expect(await until(() => seen.close !== undefined)).toBe(true);
    expect(seen.text).toContain(JSON.stringify({ exit: 3 }));
    expect(seen.close).toBe(1000);
    // the code was used once, so it doesn't open a second session; the next code does
    expect(h.code()).not.toBe(code);
    const again = (await open()) as WebSocket;
    const seen2 = watch(again);
    again.send(JSON.stringify({ pair: code }));
    await until(() => seen2.close !== undefined);
    expect(seen2.close).toBe(4401);
    const next = (await open()) as WebSocket;
    const seen3 = watch(next);
    next.send(JSON.stringify({ pair: h.code() }));
    expect(await until(() => seen3.text.some((t) => t.includes('"paired":true')))).toBe(true);
    next.close();
  });

  test('there is no token to reuse: a page that comes back needs the next code from the terminal', async () => {
    const h = await start(['cat']);
    const ws = (await open()) as WebSocket;
    const seen = watch(ws);
    ws.send(JSON.stringify({ pair: h.code() }));
    expect(await until(() => seen.text.length > 0)).toBe(true);
    expect(seen.text[0]).toBe(JSON.stringify({ paired: true, agent: 'claude' }));
    ws.close();
    expect(await until(() => said.some((l) => l.includes('the code is')))).toBe(true);
    const back = (await open()) as WebSocket;
    expect(typeof back, `refused: ${String(back)}; said: ${said.join(' / ')}`).toBe('object');
    const seen2 = watch(back);
    back.send(JSON.stringify({ token: 'anything' }));
    await until(() => seen2.close !== undefined);
    expect(seen2.close).toBe(4401);
  });

  test('one session at a time', async () => {
    const h = await start(['cat']);
    const ws = (await open()) as WebSocket;
    const seen = watch(ws);
    ws.send(JSON.stringify({ pair: h.code() }));
    await until(() => seen.text.length > 0);
    expect(await open()).toBe(409);
    ws.close();
  });

  test('closing the box ends the program, and anything it started', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'petal-term-pid-'));
    const pidFile = join(dir, 'pid');
    const h = await start(['sh', '-c', `sleep 300 & echo $! > ${pidFile}; wait`]);
    const ws = (await open()) as WebSocket;
    const seen = watch(ws);
    ws.send(JSON.stringify({ pair: h.code() }));
    expect(
      await until(() => existsSync(pidFile) && readFileSync(pidFile, 'utf8').trim() !== ''),
    ).toBe(true);
    const pid = Number(readFileSync(pidFile, 'utf8').trim());
    ws.close();
    const gone = () => {
      try {
        process.kill(pid, 0);
        return false;
      } catch {
        return true;
      }
    };
    expect(await until(gone, 10_000)).toBe(true);
    expect(seen.text[0]).toContain('"paired":true');
  });
});

describe('its arguments', () => {
  test('an agent, a port, and the origins the person names', () => {
    expect(parseTerminalArgs([])).toEqual({ agent: 'claude', port: 7466, extra: [] });
    expect(
      parseTerminalArgs(['codex', '--port', '7500', '--allow-origin', 'http://127.0.0.1:3195']),
    ).toEqual({ agent: 'codex', port: 7500, extra: ['http://127.0.0.1:3195'] });
    expect('error' in parseTerminalArgs(['bash'])).toBe(true);
    expect('error' in parseTerminalArgs(['--allow-origin', 'http://x.example/path'])).toBe(true);
    expect('error' in parseTerminalArgs(['--port', '80'])).toBe(true);
  });
});

describe.skipIf(!hasPython)('one paste, then nothing', () => {
  test('the helper opens the page with the code in the fragment, which no server sees', async () => {
    opened.length = 0;
    const h = await start(['cat']);
    expect(opened).toEqual([`${SITE}/make?terminal=1#pair=${h.code()}&port=${port}`]);
    expect(pageUrl('https://x.example/', 'AB12-CD34', 7466)).toBe(
      'https://x.example/make?terminal=1#pair=AB12-CD34',
    );
  });

  test("an agent that can't be found: the box says so in one line, with how to install it", async () => {
    const h = await start(null, () => null);
    expect(said.some((l) => l.includes("isn't installed here, or can't be found"))).toBe(true);
    const ws = (await open()) as WebSocket;
    const seen = watch(ws);
    ws.send(JSON.stringify({ pair: h.code() }));
    expect(await until(() => seen.close !== undefined)).toBe(true);
    expect(seen.output).toMatch(
      /Claude Code isn't installed here, or can't be found\. Install it with: curl -fsSL https:\/\/claude\.ai\/install\.sh \| bash/,
    );
    expect(seen.text.some((t) => t.includes('"exit":127'))).toBe(true);
  });

  test("the agent's own folder comes first on its PATH, so its node is the one it came with", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'petal-agentdir-'));
    const agent = join(dir, 'claude');
    writeFileSync(agent, '#!/bin/sh\necho "path=$PATH"\n');
    chmodSync(agent, 0o755);
    const h = await start(null, () => agent);
    const ws = (await open()) as WebSocket;
    const seen = watch(ws);
    ws.send(JSON.stringify({ pair: h.code() }));
    expect(await until(() => seen.output.includes('path='))).toBe(true);
    expect(seen.output).toContain(`path=${dir}:`);
  });
});

describe("finding the agent the way the person's shell would", () => {
  const fakeHome = () => {
    const home = mkdtempSync(join(tmpdir(), 'petal-home-'));
    for (const v of ['v22.22.3', 'v24.14.0']) {
      mkdirSync(join(home, '.nvm/versions/node', v, 'bin'), { recursive: true });
      const p = join(home, '.nvm/versions/node', v, 'bin', 'petalagent');
      writeFileSync(p, '#!/bin/sh\n');
      chmodSync(p, 0o755);
    }
    return home;
  };

  test('not on this PATH, but in nvm: the newest Node first', () => {
    const home = fakeHome();
    expect(findAgent('petalagent', { PATH: '/usr/bin:/bin' }, home)).toBe(
      join(home, '.nvm/versions/node/v24.14.0/bin/petalagent'),
    );
  });

  test("an alias in the login shell, as Claude Code's local install makes", () => {
    const home = mkdtempSync(join(tmpdir(), 'petal-home-'));
    const target = join(home, 'somewhere/petalagent');
    mkdirSync(join(home, 'somewhere'));
    writeFileSync(target, '#!/bin/sh\n');
    chmodSync(target, 0o755);
    const shell = join(home, 'fake-shell');
    writeFileSync(shell, `#!/bin/sh\necho "welcome"\necho "alias petalagent='${target}'"\n`);
    chmodSync(shell, 0o755);
    expect(findAgent('petalagent', { PATH: '/usr/bin:/bin', SHELL: shell }, home)).toBe(target);
  });

  test('nowhere: null, so the box can say so', () => {
    const home = mkdtempSync(join(tmpdir(), 'petal-home-'));
    expect(findAgent('petalagent-nowhere', { PATH: '/usr/bin:/bin' }, home)).toBeNull();
  });

  test.skipIf(!findAgent('claude'))("this Mac's claude, from a shell whose PATH lacks it", () => {
    const found = findAgent('claude', {
      PATH: '/usr/bin:/bin:/opt/homebrew/bin',
      SHELL: process.env.SHELL,
    });
    expect(found).toMatch(/\/claude$/);
  });
});

const LINK = `${SITE}/s/${'a'.repeat(43)}`;

describe('the agent starts already in Petals, for this session only', () => {
  const setup = { node: '/n/node', file: '/h/.petals/petal.mjs', site: SITE, home: '/h/.petals' };

  test('Claude Code: the file as its MCP tools, allowed, and a first message', () => {
    const { args, env } = inPetals('claude', setup, LINK);
    expect(args[0]).toBe(FIRST_MESSAGE);
    const mcp = JSON.parse(args[args.indexOf('--mcp-config') + 1] as string);
    expect(mcp.mcpServers.petals).toEqual({
      command: '/n/node',
      args: ['/h/.petals/petal.mjs', 'mcp'],
      env: { PETALS_HOME: '/h/.petals', PETALS_SITE: SITE, PETALS_EXPLORATION: LINK },
    });
    expect(args.slice(-2)).toEqual(['--allowedTools', 'mcp__petals']);
    expect(env.PETALS_EXPLORATION).toBe(LINK);
  });

  test('Codex: the same through -c overrides, which change nothing in its config', () => {
    const { args } = inPetals('codex', setup);
    expect(args).toContain('mcp_servers.petals.command="/n/node"');
    expect(args).toContain('mcp_servers.petals.args=["/h/.petals/petal.mjs","mcp"]');
    expect(args.at(-1)).toBe(FIRST_MESSAGE);
  });

  test('Hermes: a seeded chat, with the tools as commands', () => {
    expect(inPetals('hermes', setup).args).toEqual(['chat', '-q', FIRST_MESSAGE]);
    expect(sessionNotes('hermes', SITE, 'S')).toContain('node ~/.petals/petal.mjs <command>');
  });

  test("the notes: the page's conversation when the page hands one in, or start one", () => {
    const withPage = sessionNotes('claude', SITE, 'THE SKILL', LINK);
    expect(withPage).toContain(`Its link is ${LINK}`);
    expect(withPage).toMatch(/render_flower` saves each flower there by itself/);
    expect(withPage.endsWith('THE SKILL')).toBe(true);
    expect(sessionNotes('claude', SITE, 'S')).toMatch(
      /start_exploration` \(client: "Claude Code"\)/,
    );
  });
});

describe.skipIf(!hasPython)('a session in Petals', () => {
  test("starts in ~/.petals/work, with the notes there, the page's link, and the flags", async () => {
    const home = mkdtempSync(join(tmpdir(), 'petal-home-'));
    const dir = mkdtempSync(join(tmpdir(), 'petal-agentdir-'));
    const agent = join(dir, 'claude');
    writeFileSync(
      agent,
      '#!/bin/sh\necho "cwd=$(pwd)"\necho "exp=$PETALS_EXPLORATION"\necho "argc=$#"\n',
    );
    chmodSync(agent, 0o755);
    const h = await start(null, () => agent, home);
    const ws = (await open()) as WebSocket;
    const seen = watch(ws);
    ws.send(JSON.stringify({ pair: h.code(), exploration: LINK }));
    expect(await until(() => seen.output.includes('argc='))).toBe(true);
    expect(seen.output).toMatch(new RegExp(`cwd=.*${join(home, 'work').replace(/[/.]/g, '\\$&')}`));
    expect(seen.output).toContain(`exp=${LINK}`);
    expect(seen.output).toContain('argc=5');
    const notes = readFileSync(join(home, 'work/AGENTS.md'), 'utf8');
    expect(notes).toContain(LINK);
    expect(notes.endsWith('THE SKILL')).toBe(true);
    expect(readFileSync(join(home, 'work/CLAUDE.md'), 'utf8')).toBe(notes);
  });

  test("a link that is not one of the site's continue links is ignored", async () => {
    const home = mkdtempSync(join(tmpdir(), 'petal-home-'));
    const dir = mkdtempSync(join(tmpdir(), 'petal-agentdir-'));
    const agent = join(dir, 'claude');
    writeFileSync(agent, '#!/bin/sh\necho "exp=[$PETALS_EXPLORATION]"\n');
    chmodSync(agent, 0o755);
    const h = await start(null, () => agent, home);
    const ws = (await open()) as WebSocket;
    const seen = watch(ws);
    ws.send(JSON.stringify({ pair: h.code(), exploration: 'https://x/s/short; rm -rf ~' }));
    expect(await until(() => seen.output.includes('exp=['))).toBe(true);
    expect(seen.output).toContain('exp=[]');
  });
});
