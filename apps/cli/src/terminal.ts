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
import { spawn, spawnSync } from 'node:child_process';
import { randomInt, timingSafeEqual } from 'node:crypto';
import {
  accessSync,
  constants,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Writable } from 'node:stream';
import { type RawData, WebSocket, WebSocketServer } from 'ws';
import { acpAgent, type ChatAgent, fromPage, type McpServer, type ToPage } from './chat.ts';
import { CLAUDE_FLAGS, claudeAgent } from './claude.ts';

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
        for _ in range(10):
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
  /**
   * Opens the person's browser at the page, with the pairing code in the address's fragment, so the
   * page connects by itself: one paste, then nothing. The fragment never reaches any server. Default:
   * the system's opener; false to only print the code.
   */
  openPage?: ((url: string) => void) | false;
  /** where the agent is; default findAgent */
  find?: (name: string) => string | null;
  /** start the agent already in Petals: its tools, its instructions and the page's conversation */
  petals?: PetalsSetup;
  /** the site's skill, for the session's notes; default fetched from the site */
  skill?: (site: string) => Promise<string>;
  /** the first pairing code, made up by the page and handed over in a petals:// link */
  code?: string;
  /** started from a link: end with the session, or after two minutes with no pairing */
  once?: boolean;
  /** called when a helper started with `once` is done */
  onDone?: () => void;
}

/** The site's own skill, or a pointer to it when the site can't be reached. */
async function fetchSkill(site: string): Promise<string> {
  try {
    const res = await fetch(`${site}/skill.md`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) return await res.text();
  } catch {
    // below
  }
  return `Petal's instructions are at ${site}/skill.md: read them first.`;
}

/** The page that shows the box, with the code where only the browser sees it. */
export function pageUrl(origin: string, code: string, port: number): string {
  const extra = port === DEFAULT_PORT ? '' : `&port=${port}`;
  return `${origin.replace(/\/+$/, '')}/make?terminal=1#pair=${code}${extra}`;
}

/** The system's own way to open an address in the default browser. */
export function systemOpener(url: string): void {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  try {
    spawn(cmd as string, args as string[], { stdio: 'ignore', detached: true }).unref();
  } catch {
    // no opener: the code is printed anyway
  }
}

/** How to install each agent, said in the box when it can't be found. */
export const INSTALL: Record<Agent, string> = {
  claude: 'Install it with: curl -fsSL https://claude.ai/install.sh | bash',
  codex: 'Install it with: npm install -g @openai/codex',
  hermes: "Install it from Nous Research's Hermes Agent guide",
};

/** What starts the agent already in Petals: this file as its tools, and the site it shows on. */
export interface PetalsSetup {
  /** the Node running this file, and the file, to start Petals' tools as an MCP server */
  node: string;
  file: string;
  site: string;
  /** PETALS_HOME: the agent works in its work folder, not the person's home */
  home: string;
}

/** A continue link on the site: the only form a page may hand in. */
const LINK = /^https?:\/\/[^\s"'`<>]+\/s\/[A-Za-z0-9_-]{43}$/;
/** A conversation's id on the site (an exploration), which its saved sessions are kept under. */
const CONVERSATION = /^exp_[A-Za-z0-9]{8,64}$/;
/** Each conversation's agent sessions, on the person's machine, in PETALS_HOME. */
export const CHATS = 'chats.json';

/** conversation id -> agent -> that agent's own session id */
export function savedChats(file: string): Record<string, Partial<Record<Agent, string>>> {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function saveChat(file: string, conversation: string, agent: Agent, session: string): void {
  const all = savedChats(file);
  all[conversation] = { ...all[conversation], [agent]: session };
  writeFileSync(file, `${JSON.stringify(all, null, 2)}\n`);
}

export const FIRST_MESSAGE =
  "Read AGENTS.md in this folder: it's how you work with Petal here. Then tell me in a line or two what you can do, and ask what I'm curious about.";

/** Petal's instructions for this session, written as AGENTS.md (and CLAUDE.md) in the work folder. */
export function sessionNotes(
  agent: Agent,
  site: string,
  skill: string,
  exploration?: string,
  box: 'terminal' | 'chat' = 'terminal',
): string {
  const tools =
    agent === 'hermes'
      ? 'as commands in your shell: `node ~/.petals/petal.mjs <command>`, JSON out (`node ~/.petals/petal.mjs help`)'
      : 'as the `petals` MCP server, already loaded for this session';
  const page = exploration
    ? `This conversation's page is already open in their browser: don't start or open another. Its link is ${exploration}: pass it as \`exploration\` when a tool asks. \`render_flower\` saves each flower there by itself.`
    : `Before your first reply, start this conversation's page with \`start_exploration\` (client: "${AGENTS[agent]}"), and give them \`open_url\` in one line.`;
  return [
    '# Petal, in this session',
    '',
    `You're running in a box on Petal's page (${site}), where the person sees ${box === 'chat' ? 'your replies as a chat, and your tool calls as short lines' : 'this terminal'}. Petal maps who holds power in crypto networks and draws it as flowers. Its instructions are below. Follow them, with these differences:`,
    '',
    `- Its tools are already here, ${tools}. Don't download or install anything.`,
    `- ${page}`,
    "- Before you finish each reply, post the person's words and then your reply, word for word, with `add_note`. The first message, which asks you to read this file, comes from Petal, not the person: post only your reply to it.",
    "- With your first reply to the person, and again when the subject changes, give `add_note` a `title` too: the conversation's name in their list, 3 to 6 plain words, the subject, not the request.",
    '',
    '---',
    '',
    skill,
  ].join('\n');
}

const toml = (v: string) => JSON.stringify(v);

/**
 * How each agent starts already in Petals, for this session only: flags and a first message, and
 * nothing written to the person's own settings. Claude Code and Codex get the file as their MCP tools;
 * Hermes has no per-session MCP flag, so it runs the same tools as commands.
 */
export function inPetals(
  agent: Agent,
  setup: PetalsSetup,
  exploration?: string,
): { args: string[]; env: Record<string, string> } {
  const env: Record<string, string> = {
    PETALS_HOME: setup.home,
    PETALS_SITE: setup.site,
    ...(exploration ? { PETALS_EXPLORATION: exploration } : {}),
  };
  if (agent === 'claude') {
    const mcp = { mcpServers: { petals: { command: setup.node, args: [setup.file, 'mcp'], env } } };
    return {
      args: [FIRST_MESSAGE, '--mcp-config', JSON.stringify(mcp), '--allowedTools', 'mcp__petals'],
      env,
    };
  }
  if (agent === 'codex') {
    const table = `{${Object.entries(env)
      .map(([k, v]) => `${k}=${toml(v)}`)
      .join(',')}}`;
    return {
      args: [
        '-c',
        `mcp_servers.petals.command=${toml(setup.node)}`,
        '-c',
        `mcp_servers.petals.args=[${toml(setup.file)},"mcp"]`,
        '-c',
        `mcp_servers.petals.env=${table}`,
        '-c',
        'mcp_servers.petals.default_tools_approval_mode="approve"',
        FIRST_MESSAGE,
      ],
      env,
    };
  }
  return { args: ['chat', '-q', FIRST_MESSAGE], env };
}

const executable = (path: string) => {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

/**
 * Where the person's agent is, found the way their own shell would find it: this PATH, then their
 * login shell (which knows nvm, aliases and their profile), then the usual places installers use.
 * Elco, 9 Nov: Terminal ran Homebrew's Node with no nvm on its PATH, and claude lived only under nvm.
 */
export function findAgent(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string | null {
  const onPath = (env.PATH ?? '')
    .split(':')
    .filter(Boolean)
    .map((d) => join(d, name));
  for (const p of onPath) if (executable(p)) return p;

  // Started from an app, there's no SHELL: macOS's default login shell stands in.
  const given = env.SHELL ?? (process.platform === 'darwin' ? '/bin/zsh' : undefined);
  const shell = given && /^\/[\w/.-]+$/.test(given) ? given : null;
  if (shell) {
    const r = spawnSync(shell, ['-lic', `command -v ${name}`], {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...env, TERM: 'dumb' },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    for (const line of (r.stdout ?? '').split('\n').reverse()) {
      const t = line.trim();
      // an alias, as Claude Code's local install makes: alias claude='/Users/x/.claude/local/claude'
      const alias =
        /^alias \S+=['"]?([^'"\s]+)['"]?$/.exec(t)?.[1] ?? /^\S+: aliased to (\S+)$/.exec(t)?.[1];
      const path = (alias ?? t).replace(/^~(?=\/)/, home);
      if (path.startsWith('/') && executable(path)) return path;
    }
  }

  const nvm = join(home, '.nvm/versions/node');
  let nvmBins: string[] = [];
  try {
    nvmBins = readdirSync(nvm)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map((v) => join(nvm, v, 'bin'));
  } catch {
    // no nvm
  }
  let npmBin: string[] = [];
  const npm = spawnSync('/bin/sh', ['-c', 'npm prefix -g'], {
    encoding: 'utf8',
    timeout: 5000,
    env,
  });
  if (npm.status === 0 && npm.stdout.trim()) npmBin = [join(npm.stdout.trim(), 'bin')];
  const places = [
    ...(name === 'claude' ? [join(home, '.claude/local')] : []),
    join(home, '.local/bin'),
    ...nvmBins,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    ...npmBin,
    join(home, '.npm-global/bin'),
    join(home, '.bun/bin'),
    join(home, '.volta/bin'),
  ];
  for (const dir of places) {
    const p = join(dir, name);
    if (executable(p)) return p;
  }
  return null;
}

export interface TerminalHelper {
  server: Server;
  /** the port it listens on: the one asked for, or the one the system gave for 0 (tests) */
  port: number;
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
  // 0 asks the system for a free port (tests, which run side by side); the Host check follows it
  let port = o.port ?? DEFAULT_PORT;
  const origins = new Set(o.origins.map((s) => s.replace(/\/+$/, '')));
  let hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  // Python's pty runs the terminal box; the chat box needs none
  const python = o.python ?? findPython(o.env);
  const noPython =
    'The terminal needs Python 3, which macOS and Linux usually have. Install it, then try again.';
  const find = o.find ?? ((name: string) => findAgent(name, o.env ?? process.env));
  // The agent, found now to say so early, and again at each session, in case it's installed meanwhile.
  const locate = (): string[] | null => {
    if (o.command) return o.command;
    const found = find(o.agent);
    return found ? [found] : null;
  };
  const missing = `${AGENTS[o.agent]} isn't installed here, or can't be found. ${INSTALL[o.agent]}, then start this again.`;
  if (!locate()) say(missing);

  let code = o.code ?? newCode();
  let codeUntil = Date.now() + CODE_MS;
  let tries = 0;
  /** the open session: its socket, how to end it now, and when it has ended */
  let active: { ws: WebSocket; stop: () => void; ended: Promise<void> } | null = null;

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
    if (path !== '/pty' && path !== '/chat') return refuse(404, 'not /pty or /chat');
    if (!hosts.has(host)) return refuse(403, `Host ${host || '(none)'} isn't this machine`);
    if (!origins.has(origin)) return refuse(403, `Origin ${origin || '(none)'} isn't allowed`);
    if (active) return refuse(409, 'a session is already open');
    wss.handleUpgrade(req, socket, head, (ws) => greet(ws, origin, path));
  });

  function greet(ws: WebSocket, origin: string, path: string) {
    const first = setTimeout(() => ws.close(4408, 'no pairing'), 30_000);
    ws.once('message', (raw: RawData, isBinary: boolean) => {
      clearTimeout(first);
      let msg: {
        pair?: unknown;
        cols?: unknown;
        rows?: unknown;
        exploration?: unknown;
        conversation?: unknown;
      } = {};
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
      const exploration =
        typeof msg.exploration === 'string' && LINK.test(msg.exploration)
          ? msg.exploration
          : undefined;
      const conversation =
        typeof msg.conversation === 'string' && CONVERSATION.test(msg.conversation)
          ? msg.conversation
          : undefined;
      if (path === '/chat') void chat(ws, origin, exploration, conversation);
      else void run(ws, origin, clampSize(msg.cols, 100), clampSize(msg.rows, 30), exploration);
    });
  }

  /** In Petals from the first line: the session's notes in its own folder, and its tools' settings. */
  async function prepare(
    exploration: string | undefined,
    box: 'terminal' | 'chat',
  ): Promise<{ cwd: string; env: Record<string, string> } | null> {
    if (!o.petals) return null;
    const work = join(o.petals.home, 'work');
    mkdirSync(work, { recursive: true });
    const skill = await (o.skill ?? fetchSkill)(o.petals.site);
    const notes = sessionNotes(o.agent, o.petals.site, skill, exploration, box);
    writeFileSync(join(work, 'AGENTS.md'), notes);
    writeFileSync(join(work, 'CLAUDE.md'), notes);
    return { cwd: work, env: inPetals(o.agent, o.petals, exploration).env };
  }

  /**
   * The chat box: the agent in its structured mode, its events to the page as JSON frames, and the
   * page's prompts, approvals and choices back (chat.ts). Claude Code runs in stream-json; Hermes
   * speaks ACP. Codex stays in the terminal box for now.
   */
  async function chat(ws: WebSocket, origin: string, exploration?: string, conversation?: string) {
    const send = (e: ToPage) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(e));
    };
    const fail = (message: string, code: number) => {
      say(message);
      send({ t: 'error', message });
      send({ t: 'exit', code });
      ws.close(1000, 'not started');
    };
    const found = locate();
    if (!found) return fail(missing, 127);
    if (o.agent === 'codex') return fail('Codex runs in the terminal box for now.', 2);
    const inside = await prepare(exploration, 'chat');
    const env: NodeJS.ProcessEnv = { ...(o.env ?? process.env), ...(inside?.env ?? {}) };
    if ((found[0] as string).startsWith('/')) {
      env.PATH = [dirname(found[0] as string), env.PATH].filter(Boolean).join(':');
    }
    const cwd = inside?.cwd ?? o.cwd ?? process.cwd();
    const tools: McpServer[] =
      o.petals && inside
        ? [
            {
              name: 'petals',
              command: o.petals.node,
              args: [o.petals.file, 'mcp'],
              env: inside.env,
            },
          ]
        : [];
    let ended!: () => void;
    const over = new Promise<void>((done) => {
      ended = done;
    });
    const onEvent = (e: ToPage) => {
      send(e);
      if (e.t !== 'exit') return;
      active = null;
      ended();
      if (o.once) setImmediate(() => o.onDone?.());
      say(
        `${AGENTS[o.agent]} ended${e.code ? ` (exit ${e.code})` : ''}. To start it again from the page, the code is ${code}.`,
      );
      if (ws.readyState === WebSocket.OPEN) ws.close(1000, 'ended');
    };
    // a conversation the page reopens comes back in the agent's own saved session (Elco, 9 Nov)
    const sessions = o.petals && conversation ? join(o.petals.home, CHATS) : null;
    const resume =
      sessions && conversation ? savedChats(sessions)[conversation]?.[o.agent] : undefined;
    const launch = {
      cwd,
      env,
      mcp: tools,
      send: onEvent,
      agent: AGENTS[o.agent],
      ...(resume ? { resume } : {}),
      ...(sessions && conversation
        ? { onSession: (id: string) => saveChat(sessions, conversation, o.agent, id) }
        : {}),
    };
    const petalsFlags = tools.length
      ? [
          '--mcp-config',
          JSON.stringify({
            mcpServers: Object.fromEntries(
              tools.map((t) => [t.name, { command: t.command, args: t.args, env: t.env }]),
            ),
          }),
          '--allowedTools',
          'mcp__petals',
        ]
      : [];
    const agent: ChatAgent =
      o.agent === 'claude'
        ? claudeAgent({ ...launch, command: [...found, ...CLAUDE_FLAGS, ...petalsFlags] })
        : // Hermes has no per-session MCP servers yet: its notes give it the same tools as commands
          acpAgent({ ...launch, command: [...found, 'acp'], mcp: [] });
    active = { ws, stop: () => agent.close(true), ended: over };
    say(
      `${AGENTS[o.agent]} is running in the Petals page's chat (${origin}). Closing that box ends it.`,
    );
    ws.on('message', (raw: RawData, isBinary: boolean) => {
      if (isBinary) return;
      const m = fromPage(raw.toString());
      if (!m) return;
      if (m.t === 'prompt') agent.prompt(m.text);
      else if (m.t === 'cancel') agent.cancel();
      else if (m.t === 'permission') agent.answer(m.id, m.optionId);
      else if (m.t === 'mode') agent.setMode(m.id);
      else agent.setModel(m.id);
    });
    ws.on('close', () => agent.close());
    ws.on('error', () => agent.close());
    await agent.start(FIRST_MESSAGE);
  }

  async function run(
    ws: WebSocket,
    origin: string,
    cols: number,
    rows: number,
    exploration?: string,
  ) {
    const found = locate();
    let command = found;
    let extraEnv: Record<string, string> = {};
    let cwd = o.cwd;
    if (found && o.petals && !o.command) {
      // In Petals from the first line: the tools for this session, the notes in its own folder.
      const work = join(o.petals.home, 'work');
      mkdirSync(work, { recursive: true });
      const notes = sessionNotes(
        o.agent,
        o.petals.site,
        await (o.skill ?? fetchSkill)(o.petals.site),
        exploration,
      );
      writeFileSync(join(work, 'AGENTS.md'), notes);
      writeFileSync(join(work, 'CLAUDE.md'), notes);
      const launch = inPetals(o.agent, o.petals, exploration);
      command = [...found, ...launch.args];
      extraEnv = launch.env;
      cwd = work;
    }
    if (!python) {
      say(noPython);
      ws.send(Buffer.from(`${noPython}\r\n`), { binary: true });
      ws.send(JSON.stringify({ exit: 127, error: noPython }));
      ws.close(1000, 'no python');
      return;
    }
    if (!command) {
      say(missing);
      ws.send(Buffer.from(`${missing}\r\n`), { binary: true });
      ws.send(JSON.stringify({ exit: 127, error: missing }));
      ws.close(1000, 'not installed');
      return;
    }
    // The agent's own folder first, so a script's `#!/usr/bin/env node` finds the Node it came with.
    const env = { ...(o.env ?? process.env), ...extraEnv };
    if ((command[0] as string).startsWith('/')) {
      env.PATH = [dirname(command[0] as string), env.PATH].filter(Boolean).join(':');
    }
    const child = spawn(python as string, ['-c', PTY_PY, String(cols), String(rows), ...command], {
      cwd,
      env: { ...env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
      stdio: ['pipe', 'pipe', 'inherit', 'pipe'],
    });
    active = {
      ws,
      stop: () => child.kill('SIGTERM'),
      ended: new Promise((done) => child.once('exit', () => done())),
    };
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
      }, 2000).unref();
    };
    ws.on('close', end);
    ws.on('error', end);
    child.on('exit', (exitCode) => {
      active = null;
      if (o.once) setImmediate(() => o.onDone?.());
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
      port = (server.address() as AddressInfo).port;
      hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
      say(
        `Petals terminal on 127.0.0.1:${port}, for ${[...origins].join(', ')}. It runs ${AGENTS[o.agent]} here, in ${o.petals && !o.command ? join(o.petals.home, 'work') : (o.cwd ?? process.cwd())}.`,
      );
      announce();
      const opener = o.openPage === undefined ? systemOpener : o.openPage;
      const first = [...origins][0];
      if (opener && first) {
        say(`Opening ${first} in your browser: it connects by itself.`);
        opener(pageUrl(first, code, port));
      }
      if (o.once) {
        // started from the page's button: nobody waits at a terminal, so it ends on its own
        setTimeout(() => {
          if (!active) o.onDone?.();
        }, 120_000).unref();
      } else {
        say('Ctrl-C here stops it.');
      }
      resolve({
        server,
        port,
        code: () => code,
        close: () =>
          new Promise<void>((done) => {
            const open = active;
            for (const c of wss.clients) c.terminate();
            const finish = () => server.close(() => done());
            if (!open) return finish();
            void open.ended.then(finish);
            open.stop();
          }),
      });
    });
  });
}

/** `petal terminal [agent] [--port n] [--allow-origin o]...`: the arguments, or an error to show. */
export function parseTerminalArgs(
  argv: string[],
):
  | { agent: Agent; port: number; extra: string[]; open?: false; link?: string; app?: false }
  | { error: string } {
  let agent: Agent = 'claude';
  let open: false | undefined;
  let link: string | undefined;
  let app: false | undefined;
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
    } else if (a === '--no-open') {
      open = false;
    } else if (a === '--no-app') {
      app = false;
    } else if (a === '--link') {
      link = argv[++i];
      if (!link) return { error: '--link takes a petals:// link' };
    } else if (a in AGENTS) {
      agent = a as Agent;
    } else {
      return {
        error: `unknown: ${a}. Use claude, codex or hermes, --port, --allow-origin, --no-open`,
      };
    }
  }
  return {
    agent,
    port,
    extra,
    ...(open === false ? { open } : {}),
    ...(link ? { link } : {}),
    ...(app === false ? { app } : {}),
  };
}
