// The terminal helper (004-workspace W10; Elco, 9 Nov: "yes - that seems to be what we wanted all
// along"). It runs the person's own, unmodified Claude Code, Codex or Hermes in a real terminal on
// their machine, and lets the Petals page show that terminal in a box. Nothing goes through Petals'
// server: the page talks to this helper on 127.0.0.1, and the agent talks to its own provider.
//
//   node petal.mjs terminal [claude|codex|hermes] [--port 7466] [--allow-origin <origin>]...
//
// What keeps it the person's:
//   - it listens on 127.0.0.1 only, and answers only Host 127.0.0.1 or localhost on its port, so a
//     page that renames itself to this address (DNS rebinding) is refused;
//   - it answers only the Petals site's origin, plus any the person names with --allow-origin;
//   - every session needs a code printed here, in the person's own terminal, which they type into the
//     page: so they see and approve each one. A code is single use, lasts 10 minutes, and five wrong
//     tries retire it. A reloaded page asks for the next code; there is no token to reuse;
//   - it runs only the agent named when it started; the page sends keystrokes and a size, nothing else;
//   - one session at a time, and closing the box ends it.
//
// The terminal itself is Python's pty module, which macOS and Linux ship, so this file stays plain
// JavaScript with no native parts. Windows isn't covered yet.
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { randomInt, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { createServer, type Server } from 'node:http';
import type { Writable } from 'node:stream';
import { type RawData, WebSocket, WebSocketServer } from 'ws';

export const DEFAULT_PORT = 7466;
export const AGENTS = { claude: 'Claude Code', codex: 'Codex', hermes: 'Hermes' } as const;
export type Agent = keyof typeof AGENTS;

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_MS = 10 * 60_000;
const CODE_TRIES = 5;
const MAX_FRAME = 1024 * 1024;

/** The pty: fork the agent on a terminal, copy bytes both ways, resize on a line from fd 3. */
const PTY_PY = `
import os, sys, pty, select, signal, struct, fcntl, termios
cols, rows = int(sys.argv[1]), int(sys.argv[2])
argv = sys.argv[3:]
pid, fd = pty.fork()
if pid == 0:
    try:
        os.execvp(argv[0], argv)
    except Exception as e:
        os.write(2, ("cannot start %s: %s\\r\\n" % (argv[0], e)).encode())
        os._exit(127)
def size(c, r):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", r, c, 0, 0))
    try: os.kill(pid, signal.SIGWINCH)
    except OSError: pass
size(cols, rows)
def write_all(f, data):
    while data:
        n = os.write(f, data)
        data = data[n:]
def end_agent(*_):
    # the agent and anything it started: it's the leader of its own session on this terminal
    for sig in (signal.SIGHUP, signal.SIGTERM):
        try: os.killpg(pid, sig)
        except OSError: pass
        for _ in range(30):
            done, status = os.waitpid(pid, os.WNOHANG)
            if done: os._exit(os.waitstatus_to_exitcode(status) if hasattr(os, "waitstatus_to_exitcode") else 0)
            select.select([], [], [], 0.1)
    try: os.killpg(pid, signal.SIGKILL)
    except OSError: pass
    os._exit(1)
signal.signal(signal.SIGTERM, end_agent)
signal.signal(signal.SIGHUP, end_agent)
ctl = b""
watch = [fd, 0, 3]
while True:
    r, _, _ = select.select(watch, [], [])
    if fd in r:
        try: data = os.read(fd, 65536)
        except OSError: data = b""
        if not data: break
        write_all(1, data)
    if 0 in r:
        data = os.read(0, 65536)
        if not data: break
        write_all(fd, data)
    if 3 in r:
        data = os.read(3, 1024)
        if not data:
            watch.remove(3)
        else:
            ctl += data
            while b"\\n" in ctl:
                line, ctl = ctl.split(b"\\n", 1)
                try:
                    c, rr = (int(x) for x in line.split())
                    if 1 <= c <= 1000 and 1 <= rr <= 1000: size(c, rr)
                except ValueError: pass
end_agent()
`;

export interface TerminalOptions {
  agent: Agent;
  /** the command line the agent runs as; default its own name */
  command?: string[];
  port?: number;
  /** origins allowed to pair: the site's, plus any the person names */
  origins: string[];
  /** where the agent starts */
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** what the person sees in this terminal */
  say?: (line: string) => void;
  python?: string;
}

export interface TerminalHelper {
  server: Server;
  /** the current pairing code, for tests */
  code(): string;
  close(): Promise<void>;
}

const newCode = () =>
  Array.from(
    { length: 8 },
    (_, i) => (i === 4 ? '-' : '') + CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
  ).join('');
const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const clampSize = (n: unknown, fallback: number) =>
  typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 1000 ? n : fallback;

/** Python 3 with its pty module, or null: the terminal needs it. */
export function findPython(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const p of [env.PETALS_PYTHON, 'python3'].filter(Boolean) as string[]) {
    const r = spawnSync(p, ['-c', 'import pty, termios, fcntl'], { stdio: 'ignore' });
    if (r.status === 0) return p;
  }
  return null;
}

export function startTerminal(o: TerminalOptions): Promise<TerminalHelper> {
  const say = o.say ?? ((line: string) => void process.stderr.write(`${line}\n`));
  const port = o.port ?? DEFAULT_PORT;
  const origins = new Set(o.origins.map((s) => s.replace(/\/+$/, '')));
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const python = o.python ?? findPython(o.env);
  if (!python) {
    return Promise.reject(
      new Error(
        'The terminal needs Python 3, which macOS and Linux usually have. Install it, then try again.',
      ),
    );
  }
  const command = o.command ?? [o.agent];

  let code = newCode();
  let codeUntil = Date.now() + CODE_MS;
  let tries = 0;
  let active: { ws: WebSocket; child: ChildProcess } | null = null;

  const announce = () =>
    say(`Pairing code: ${code}  (type it into the Petals page; one use, 10 minutes)`);
  const retire = (why: string) => {
    code = newCode();
    codeUntil = Date.now() + CODE_MS;
    tries = 0;
    say(why);
    announce();
  };

  const server = createServer((_req, res) => {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Petals terminal: WebSocket only.\n');
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME });

  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    const path = (req.url ?? '').split('?')[0];
    const origin = req.headers.origin ?? '';
    const host = req.headers.host ?? '';
    const refuse = (status: number, why: string) => {
      say(`Refused a connection: ${why}.`);
      socket.write(`HTTP/1.1 ${status} ${why}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    if (path !== '/pty') return refuse(404, 'not /pty');
    if (!hosts.has(host)) return refuse(403, `Host ${host || '(none)'} isn't this machine`);
    if (!origins.has(origin)) return refuse(403, `Origin ${origin || '(none)'} isn't allowed`);
    if (active) return refuse(409, 'a session is already open');
    wss.handleUpgrade(req, socket, head, (ws) => greet(ws, origin));
  });

  function greet(ws: WebSocket, origin: string) {
    const first = setTimeout(() => ws.close(4408, 'no pairing'), 30_000);
    ws.once('message', (raw: RawData, isBinary: boolean) => {
      clearTimeout(first);
      let msg: { pair?: unknown; cols?: unknown; rows?: unknown } = {};
      try {
        msg = isBinary ? {} : JSON.parse(raw.toString());
      } catch {
        // not JSON
      }
      let paired = false;
      if (typeof msg.pair === 'string') {
        const given = msg.pair.trim().toUpperCase();
        if (Date.now() > codeUntil) {
          retire('The pairing code ran out; here is a new one.');
        } else if (same(given, code)) {
          paired = true;
          code = newCode(); // single use
          codeUntil = Date.now() + CODE_MS;
          tries = 0;
          say(`Paired with ${origin}. The next code, if you need one, is ${code}.`);
        } else if (++tries >= CODE_TRIES) {
          retire('Five wrong codes: that code is retired.');
        }
      }
      if (!paired) {
        ws.send(JSON.stringify({ error: 'That code isn’t right.' }));
        ws.close(4401, 'not paired');
        return;
      }
      if (active) {
        ws.send(JSON.stringify({ error: 'A session is already open.' }));
        ws.close(4409, 'busy');
        return;
      }
      ws.send(JSON.stringify({ paired: true, agent: o.agent }));
      run(ws, origin, clampSize(msg.cols, 100), clampSize(msg.rows, 30));
    });
  }

  function run(ws: WebSocket, origin: string, cols: number, rows: number) {
    const child = spawn(python as string, ['-c', PTY_PY, String(cols), String(rows), ...command], {
      cwd: o.cwd,
      env: { ...(o.env ?? process.env), TERM: 'xterm-256color', COLORTERM: 'truecolor' },
      stdio: ['pipe', 'pipe', 'inherit', 'pipe'],
    });
    active = { ws, child };
    const control = child.stdio[3] as Writable;
    say(`${AGENTS[o.agent]} is running in the Petals page (${origin}). Closing that box ends it.`);

    child.stdout?.on('data', (chunk: Buffer) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(chunk, { binary: true });
    });
    ws.on('message', (raw: RawData, isBinary: boolean) => {
      const text = raw.toString();
      if (!isBinary && text.startsWith('{"resize"')) {
        try {
          const { resize } = JSON.parse(text) as { resize?: { cols?: unknown; rows?: unknown } };
          if (resize) {
            control.write(`${clampSize(resize.cols, cols)} ${clampSize(resize.rows, rows)}\n`);
            return;
          }
        } catch {
          // not a resize: keystrokes after all
        }
      }
      child.stdin?.write(isBinary ? (raw as Buffer) : text);
    });
    // The box closed: end of input, so the pty ends the agent; a stop if it doesn't go quietly.
    const end = () => {
      if (child.exitCode !== null) return;
      child.stdin?.end();
      setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGTERM');
      }, 3000).unref();
    };
    ws.on('close', end);
    ws.on('error', end);
    child.on('exit', (exitCode) => {
      active = null;
      say(
        `${AGENTS[o.agent]} ended${exitCode ? ` (exit ${exitCode})` : ''}. To start it again from the page, the code is ${code}.`,
      );
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ exit: exitCode ?? 0 }));
        ws.close(1000, 'ended');
      }
    });
  }

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      say(
        `Petals terminal on 127.0.0.1:${port}, for ${[...origins].join(', ')}. It runs ${AGENTS[o.agent]} here, in ${o.cwd ?? process.cwd()}.`,
      );
      announce();
      say('Ctrl-C here stops it.');
      resolve({
        server,
        code: () => code,
        close: () =>
          new Promise<void>((done) => {
            const child = active?.child;
            for (const c of wss.clients) c.terminate();
            const finish = () => server.close(() => done());
            if (!child || child.exitCode !== null) return finish();
            child.once('exit', finish);
            child.kill('SIGTERM');
          }),
      });
    });
  });
}

/** `petal terminal [agent] [--port n] [--allow-origin o]...`: the arguments, or an error to show. */
export function parseTerminalArgs(
  argv: string[],
): { agent: Agent; port: number; extra: string[] } | { error: string } {
  let agent: Agent = 'claude';
  let port = DEFAULT_PORT;
  const extra: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === '--port') {
      port = Number(argv[++i]);
      if (!Number.isInteger(port) || port < 1024 || port > 65535)
        return { error: '--port takes a port number from 1024 to 65535' };
    } else if (a === '--allow-origin') {
      const o = argv[++i];
      if (!o || !/^https?:\/\/[^/]+$/.test(o))
        return { error: '--allow-origin takes an origin, such as http://127.0.0.1:3195' };
      extra.push(o);
    } else if (a in AGENTS) {
      agent = a as Agent;
    } else {
      return { error: `unknown: ${a}. Use claude, codex or hermes, --port, --allow-origin` };
    }
  }
  return { agent, port, extra };
}
