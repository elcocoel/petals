// The terminal helper (004 W10): only this machine, only the Petals site, one pairing code shown here,
// one session at a time, and closing the box ends the program. Stand-in programs take the agent's place.
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { WebSocket } from 'ws';
import {
  findPython,
  parseTerminalArgs,
  startTerminal,
  type TerminalHelper,
} from '../src/terminal.ts';

const SITE = 'https://petals.example';
const hasPython = findPython() !== null;
let port = 47600 + Math.floor(Math.random() * 300);
let helper: TerminalHelper | null = null;
let said: string[] = [];

async function start(command: string[]) {
  port += 1;
  // each helper its own log: one still shutting down mustn't speak for the next
  const mine: string[] = [];
  said = mine;
  helper = await startTerminal({
    agent: 'claude',
    command,
    port,
    origins: [SITE],
    cwd: mkdtempSync(join(tmpdir(), 'petal-term-')),
    say: (l) => mine.push(l),
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
