// The petal CLI (W7, T070): thin. One subcommand per registry tool, generated from the registry,
// called in process; the tool's JSON goes to stdout as it is. Plus two doors: `mcp` (stdio,
// serveStdio) and `api` (petalApp on :8787). No door adds logic of its own (packages.md).
//
// The only thing the CLI adds is a shorthand: a network id where a tool wants a sha256 or a spec
// first calls get_snapshot and, for a spec or a missing measure, propose_spec with the default
// convention. So `petal figures near-validators` prints the figures the default flower quotes.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { TOOLS_VERSION } from '@petal/core';
import type { ToolError } from '@petal/core/types';
import type { Config, JSONSchema, Tool, ToolContext } from '@petal/tools';
import {
  coerce,
  type FlagValue,
  fields,
  type Io,
  kebab,
  readJson,
  tokenize,
  typesOf,
  UsageError,
} from './args.ts';
import { commandName, positionalFields } from './commands.ts';
import { callerCwd, configFromEnv, type Env, findRoot } from './config.ts';
import { CONNECT_HELP, connect, type RunCommand, spawnCommand } from './connect.ts';

/** Any registry tool, called with an input built from argv. */
export type AnyTool = Tool<never, unknown>;

/** What `api` serves: Hono's fetch. */
export interface FetchApp {
  fetch(request: Request): Response | Promise<Response>;
}
export type Serve = (
  options: {
    fetch: (request: Request) => Response | Promise<Response>;
    port: number;
    hostname?: string;
  },
  onListen?: (info: { port: number }) => void,
) => unknown;

/** Everything the CLI touches, so tests can pass fakes. Defaults are the real packages. */
export interface CliDeps {
  registry?: readonly AnyTool[];
  createContext?: (cfg: Config) => ToolContext;
  serveStdio?: (ctx: ToolContext) => Promise<void>;
  petalApp?: (cfg: Config) => FetchApp;
  serve?: Serve;
  env?: Env;
  cwd?: string;
  /** repo root; default PETAL_ROOT, else found above this file */
  root?: string;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  readStdin?: () => Promise<string>;
  readFile?: (path: string) => string;
  writeFile?: (path: string, data: string) => void;
  /** `petal connect`: the home folder, the agents' CLIs, and the node to put on the PATH */
  home?: string;
  runCommand?: RunCommand;
  nodeBin?: string;
  nodeVersion?: string;
  /** Petal as one file (file.ts): no repo, so no `api` or `connect`, and help says how it's run */
  asFile?: boolean;
}

const SHA256 = /^[0-9a-f]{64}$/i;
const DEFAULT_PORT = 8787;
/** Flags of the CLI itself, for every command. */
const CLI_BOOLEAN = new Set(['fake', 'quiet', 'help']);
const CLI_VALUE = new Set(['input', 'out', 'root']);

/** A tool returned an error: print it as the answer, exit code 1. */
class ToolFailure extends Error {
  readonly output: unknown;
  constructor(output: unknown) {
    super('tool error');
    this.output = output;
  }
}

export function isToolError(x: unknown): x is ToolError {
  if (typeof x !== 'object' || x === null || !('error' in x)) return false;
  const e = (x as { error: unknown }).error;
  return typeof e === 'object' && e !== null && 'code' in e;
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const errorJson = (code: string, message: string, hint?: string) =>
  json({ error: { code, message, ...(hint ? { hint } : {}) }, tools_version: TOOLS_VERSION });

async function readAll(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString('utf8');
}

export async function main(argv: string[], deps: CliDeps = {}): Promise<number> {
  const stdout = deps.stdout ?? ((t: string) => void process.stdout.write(t));
  const stderr = deps.stderr ?? ((t: string) => void process.stderr.write(t));
  const env = deps.env ?? process.env;
  const cwd = deps.cwd ?? callerCwd(env, process.cwd());
  const io: Io = {
    readFile: deps.readFile ?? ((p: string) => readFileSync(resolve(cwd, p), 'utf8')),
    readStdin: deps.readStdin ?? (() => readAll(process.stdin)),
  };
  const writeFile = deps.writeFile ?? ((p: string, d: string) => writeFileSync(resolve(cwd, p), d));

  try {
    const [command = 'help', ...rest] = argv;
    if (deps.asFile && (command === 'connect' || command === 'api')) {
      throw new UsageError(
        `petal ${command} needs a copy of the repo; this file runs the tools and mcp`,
        'Run `node petal.mjs help` for the commands.',
      );
    }
    if (command === 'terminal') return await terminal(rest, env, cwd, stderr, deps.asFile === true);
    if (command === 'connect') {
      return connect(rest, {
        env,
        cwd,
        root: deps.root ?? findRoot(env, import.meta.dirname),
        home: deps.home ?? homedir(),
        nodeBin: deps.nodeBin ?? dirname(process.execPath),
        nodeVersion: deps.nodeVersion ?? process.version,
        runCommand: deps.runCommand ?? spawnCommand(env),
        stdout,
        stderr,
      });
    }
    const tools = await loadTools(deps);
    const cli = new Cli(tools, {
      env,
      cwd,
      root: deps.root,
      io,
      stdout,
      stderr,
      writeFile,
      asFile: deps.asFile === true,
    });
    if (command === 'help' || command === '--help' || command === '-h') return cli.help(rest[0]);
    if (command === 'start') return await cli.start(rest);
    if (command === 'note') return await cli.note(rest);
    if (command === 'mcp') return await cli.mcp(rest);
    if (command === 'api') return await cli.api(rest, deps);
    const tool = cli.find(command);
    if (!tool) {
      const hint =
        tools.registry.length === 0
          ? 'The tool registry is empty: @petal/tools has not registered its tools yet.'
          : 'Run `petal help` for the commands.';
      throw new UsageError(`unknown command: ${command}`, hint);
    }
    return await cli.run(tool, rest);
  } catch (e) {
    if (e instanceof UsageError) {
      stderr(errorJson('bad_input', e.message, e.hint));
      return 2;
    }
    if (e instanceof ToolFailure) {
      stdout(json(e.output));
      return 1;
    }
    const err = e as { code?: unknown; message?: unknown };
    const code = typeof err.code === 'string' ? err.code : 'internal';
    stderr(errorJson(code, String(err.message ?? e)));
    return 1;
  }
}

/**
 * `petal terminal [claude|codex|hermes]`: the person's own agent, in a box on the Petals page, through
 * this machine only (terminal.ts). The site the file came from may pair; anything else needs naming.
 */
async function terminal(
  argv: string[],
  env: Env,
  cwd: string,
  stderr: (t: string) => void,
  asFile: boolean,
): Promise<number> {
  const { parseTerminalArgs, startTerminal } = await import('./terminal.ts');
  const { parseLink, writeHelperApp } = await import('./helper-app.ts');
  const say = (line: string) => stderr(`${line}\n`);
  const args = parseTerminalArgs(argv);
  if ('error' in args)
    throw new UsageError(
      args.error,
      'petal terminal [claude|codex|hermes] [--port 7466] [--allow-origin <origin>] [--no-open] [--no-app]',
    );
  // From the page's Start button, through Petals Helper.app: the agent, the port and the page's own code.
  const link = args.link ? parseLink(args.link) : null;
  if (args.link && !link) throw new UsageError(`not a Petals link: ${args.link}`);
  const agent = link?.agent ?? args.agent;
  const port = link?.port ?? args.port;
  const site = env.PETAL_API?.trim().replace(/\/+$/, '');
  const origins = [...(site ? [site] : []), ...args.extra];
  if (origins.length === 0) {
    throw new UsageError('no site may pair: name one with --allow-origin, or set PETAL_API');
  }
  const home = env.PETALS_HOME?.trim() || join(homedir(), '.petals');
  const petals = {
    node: process.execPath,
    file: resolve(process.argv[1] ?? ''),
    site: (site ?? origins[0]) as string,
    home,
  };
  // One helper at a time: a link replaces the one running, which a pid file names.
  const pidFile = join(home, 'helper.pid');
  if (link) await stopRunningHelper(pidFile, port);
  // The first paste also writes Petals Helper.app, so next time the page's button is one click.
  if (asFile && !link && args.app !== false && process.platform === 'darwin') {
    try {
      const made = writeHelperApp({
        dir: join(homedir(), 'Applications'),
        node: petals.node,
        file: petals.file,
        home,
      });
      if (made.registered) {
        say(
          'Next time, the Start button on the Petals page opens this helper by itself (Petals Helper, in your Applications folder).',
        );
      }
    } catch (e) {
      say(
        `Petals Helper.app wasn't written (${(e as Error).message}); pasting the line still works.`,
      );
    }
  }
  let finish: () => void = () => {};
  const finished = new Promise<void>((done) => {
    finish = done;
  });
  const helper = await startTerminal({
    agent,
    port,
    origins,
    cwd,
    env,
    petals,
    ...(link ? { code: link.code, once: true, onDone: () => finish() } : {}),
    ...(link || args.open === false || env.PETALS_NO_OPEN === '1'
      ? { openPage: false as const }
      : {}),
    say,
  });
  mkdirSync(home, { recursive: true });
  writeFileSync(pidFile, `${process.pid}\n`);
  await new Promise<void>((done) => {
    const stop = () => void helper.close().then(done);
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    void finished.then(stop);
  });
  try {
    if (readFileSync(pidFile, 'utf8').trim() === String(process.pid)) rmSync(pidFile);
  } catch {
    // already gone
  }
  return 0;
}

/** Stops the helper a pid file names, and waits for its port to be free. */
async function stopRunningHelper(pidFile: string, port: number): Promise<void> {
  let pid = 0;
  try {
    pid = Number(readFileSync(pidFile, 'utf8').trim());
  } catch {
    return;
  }
  if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return; // not running
  }
  const { createServer } = await import('node:net');
  for (let i = 0; i < 50; i++) {
    const free = await new Promise<boolean>((ok) => {
      const probe = createServer()
        .once('error', () => ok(false))
        .once('listening', () => probe.close(() => ok(true)))
        .listen(port, '127.0.0.1');
    });
    if (free) return;
    await new Promise((r) => setTimeout(r, 100));
  }
}

interface Tools {
  registry: readonly AnyTool[];
  createContext: (cfg: Config) => ToolContext;
  serveStdio: (ctx: ToolContext) => Promise<void>;
}

async function loadTools(deps: CliDeps): Promise<Tools> {
  if (deps.registry && deps.createContext && deps.serveStdio) {
    return {
      registry: deps.registry,
      createContext: deps.createContext,
      serveStdio: deps.serveStdio,
    };
  }
  const real = await import('@petal/tools');
  return {
    registry: deps.registry ?? (real.registry as readonly AnyTool[]),
    createContext: deps.createContext ?? real.createContext,
    serveStdio: deps.serveStdio ?? real.serveStdio,
  };
}

/** The process around the CLI: environment, files and output. */
interface System {
  env: Env;
  cwd: string;
  root: string | undefined;
  io: Io;
  stdout: (t: string) => void;
  stderr: (t: string) => void;
  writeFile: (p: string, d: string) => void;
  asFile?: boolean;
}

class Cli {
  readonly tools: Tools;
  readonly sys: System;
  constructor(tools: Tools, sys: System) {
    this.tools = tools;
    this.sys = sys;
  }

  find(command: string): AnyTool | undefined {
    return this.tools.registry.find((t) => commandName(t.name) === command || t.name === command);
  }

  tool(name: string): AnyTool {
    const t = this.tools.registry.find((x) => x.name === name);
    if (!t) throw new UsageError(`the network shorthand needs ${name}, which the registry lacks`);
    return t;
  }

  config(flags: Map<string, FlagValue>): Config {
    const rootFlag = flags.get('root');
    const root =
      typeof rootFlag === 'string'
        ? resolve(this.sys.cwd, rootFlag)
        : (this.sys.root ?? findRoot(this.sys.env, import.meta.dirname));
    return configFromEnv(this.sys.env, root, { fake: flags.get('fake') === true });
  }

  /**
   * `petal start --client <app> [--question <q>] [--note <text>] [--no-open]`: the whole start of a
   * conversation in one call (Elco, 9 Nov: setup took three minutes). It starts this conversation's
   * page, opens it in the browser, and posts an opening note if one is given.
   */
  async start(argv: string[]): Promise<number> {
    const flags = new Map(tokenize(argv, (n) => n === 'no-open' || CLI_BOOLEAN.has(n)).flags);
    const str = (k: string) =>
      typeof flags.get(k) === 'string' ? (flags.get(k) as string) : undefined;
    const question = str('question') ?? 'A conversation about who holds power';
    const client = str('client');
    const ctx: ToolContext = {
      ...this.tools.createContext(this.config(new Map())),
      caller: { door: 'cli' },
    };
    const started = (await this.tool('start_exploration').run(
      { question, ...(client ? { client } : {}) } as never,
      ctx,
    )) as Record<string, unknown>;
    if (isToolError(started)) {
      this.sys.stdout(json(started));
      return 1;
    }
    const openUrl = typeof started.open_url === 'string' ? started.open_url : null;
    let opened = false;
    if (openUrl && flags.get('no-open') !== true && this.sys.env.PETALS_NO_OPEN !== '1') {
      const { systemOpener } = await import('./terminal.ts');
      systemOpener(openUrl);
      opened = true;
    }
    const note = str('note');
    if (note) {
      const posted = await this.tool('add_note').run({ text: note } as never, ctx);
      if (isToolError(posted)) {
        this.sys.stdout(json(posted));
        return 1;
      }
    }
    const link = (started.link as { url?: string } | undefined)?.url;
    this.sys.stdout(
      json({
        open_url: openUrl,
        opened,
        // the site this file belongs to: if it isn't the one in the instructions, fetch the file again
        site: this.sys.env.PETAL_API ?? null,
        ...(link ? { exploration: link } : {}),
        next: opened
          ? 'The page is open in their browser: tell them in one line. Each reply: `note`, with their words and then yours.'
          : 'Give them open_url in one line. Each reply: `note`, with their words and then yours.',
      }),
    );
    return 0;
  }

  /** `petal note [text]`: a note on this conversation's page, from the words given, or from stdin. */
  async note(argv: string[]): Promise<number> {
    const parsed = tokenize(argv, (n) => CLI_BOOLEAN.has(n));
    const positionals = parsed.positionals;
    const flags = new Map(parsed.flags);
    const exploration =
      typeof flags.get('exploration') === 'string' ? flags.get('exploration') : undefined;
    const text =
      positionals.length > 0 ? positionals.join(' ') : (await this.sys.io.readStdin()).trim();
    if (!text) throw new UsageError('note needs text: as words, or on stdin (a heredoc)');
    const ctx: ToolContext = {
      ...this.tools.createContext(this.config(new Map())),
      caller: { door: 'cli' },
    };
    const out = await this.tool('add_note').run(
      { text, ...(exploration ? { exploration } : {}) } as never,
      ctx,
    );
    this.sys.stdout(json(out));
    return isToolError(out) ? 1 : 0;
  }

  /** `petal mcp`: MCP over stdio. Nothing may reach stdout but the protocol. */
  async mcp(argv: string[]): Promise<number> {
    const flags = this.cliFlags(argv, new Set(), 'mcp');
    if (flags.get('help')) return this.help('mcp');
    const ctx = this.tools.createContext(this.config(flags));
    await this.tools.serveStdio(ctx);
    return 0;
  }

  /** `petal api`: petalApp on :8787 (Node, @hono/node-server). */
  async api(argv: string[], deps: CliDeps): Promise<number> {
    const flags = this.cliFlags(argv, new Set(['port', 'host']), 'api');
    if (flags.get('help')) return this.help('api');
    const rawPort = flags.get('port');
    const port = rawPort === undefined ? DEFAULT_PORT : Number(rawPort);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new UsageError(
        `--port must be a port number (0: any free port), got ${String(rawPort)}`,
      );
    }
    const host = flags.get('host');
    const petalApp = deps.petalApp ?? (await import('@petal/agent')).petalApp;
    const serve = deps.serve ?? ((await import('@hono/node-server')).serve as Serve);
    const app = petalApp(this.config(flags));
    const server = serve(
      {
        fetch: (request) => app.fetch(request),
        port,
        // Localhost unless told otherwise: a server holding a model key can be spent by whoever reaches it.
        hostname: typeof host === 'string' ? host : '127.0.0.1',
      },
      (info) => this.sys.stderr(`petal api on http://localhost:${info.port}\n`),
    ) as { on?: (event: 'error', listener: (e: Error & { code?: string }) => void) => void };
    // A busy port is the usual failure: say so as JSON instead of a stack trace.
    server?.on?.('error', (e) => {
      const hint = e.code === 'EADDRINUSE' ? 'Another server has the port; try --port.' : undefined;
      this.sys.stderr(errorJson('internal', `petal api: ${e.message}`, hint));
      process.exitCode = 1;
    });
    return 0;
  }

  /** Flags for the door commands: the CLI's own, plus `extra` value flags. */
  private cliFlags(argv: string[], extra: Set<string>, command: string): Map<string, FlagValue> {
    const { positionals, flags } = tokenize(argv, (n) => CLI_BOOLEAN.has(n));
    if (positionals.length > 0) throw new UsageError(`petal ${command} takes no arguments`);
    const out = new Map<string, FlagValue>();
    for (const [name, value] of flags) {
      if (!CLI_BOOLEAN.has(name) && name !== 'root' && !extra.has(name)) {
        throw new UsageError(`unknown flag --${kebab(name)} for petal ${command}`);
      }
      out.set(name, value);
    }
    return out;
  }

  /** One tool call from argv. */
  async run(tool: AnyTool, argv: string[]): Promise<number> {
    const own = fields(tool.input);
    const shorthand = 'sha256' in own || 'spec' in own;
    // Flags for the shorthand: the snapshot's (network, params, at, fresh) and, when a spec is
    // proposed, propose_spec's choices. Only those the tool doesn't take itself.
    const snapTool = shorthand
      ? this.tools.registry.find((t) => t.name === 'get_snapshot')
      : undefined;
    const proposeTool = shorthand
      ? this.tools.registry.find((t) => t.name === 'propose_spec')
      : undefined;
    const snapFields = without(snapTool ? fields(snapTool.input) : {}, own);
    const proposeFields = proposeTool ? fields(proposeTool.input) : {};
    const choiceSchema = proposeFields.choices;
    const choiceFields = without(
      'spec' in own && proposeTool && choiceSchema ? fields(choiceSchema, proposeTool.input) : {},
      own,
      snapFields,
    );
    const takesChoicesFlag = 'spec' in own && choiceSchema !== undefined && !('choices' in own);
    // propose_spec itself: choice flags fill its own `choices` field
    const ownChoiceSchema = own.choices;
    const ownChoices = without(
      ownChoiceSchema ? fields(ownChoiceSchema, tool.input) : {},
      own,
      snapFields,
    );

    const isBoolean = (name: string) => {
      if (CLI_BOOLEAN.has(name)) return true;
      const s = own[name] ?? snapFields[name] ?? choiceFields[name] ?? ownChoices[name];
      if (!s) return false;
      const root =
        name in own || name in ownChoices
          ? tool.input
          : name in snapFields
            ? snapTool?.input
            : proposeTool?.input;
      const types = typesOf(s, root ?? {});
      return types.size === 1 && types.has('boolean');
    };
    const { positionals, flags } = tokenize(argv, isBoolean);
    const cliFlags = new Map<string, FlagValue>();
    for (const [name, value] of flags) {
      if (CLI_BOOLEAN.has(name) || CLI_VALUE.has(name)) cliFlags.set(name, value);
    }
    if (cliFlags.get('help')) return this.help(commandName(tool.name));

    // 1. --input, the whole input as JSON
    let input: Record<string, unknown> = {};
    const base = cliFlags.get('input');
    if (base !== undefined) {
      const parsed = typeof base === 'string' ? await readJson(base, this.sys.io) : undefined;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new UsageError('--input must be a JSON object: inline, @file or - for stdin');
      }
      input = { ...(parsed as Record<string, unknown>) };
    }

    // 2. bare words fill the tool's positional fields
    const net: Record<string, unknown> = {};
    const slots = positionalFields(tool.name, tool.input);
    for (const [i, raw] of positionals.entries()) {
      const field = slots[i];
      if (!field) {
        throw new UsageError(
          `too many arguments for petal ${commandName(tool.name)}`,
          `It takes ${slots.map((s) => `<${s}>`).join(' ') || 'no bare arguments'}.`,
        );
      }
      if (field === 'sha256' && !SHA256.test(raw) && !('network' in own)) {
        net.network = raw;
        continue;
      }
      if (field === 'spec' || field === 'entry') {
        // inline JSON, @file or -; a bare path ending in .json is read as a file
        const value =
          (await readJson(raw, this.sys.io)) ??
          (raw.endsWith('.json') ? await readJson(`@${raw}`, this.sys.io) : undefined);
        if (value !== undefined) input[field] = value;
        else if (field === 'spec') net.network = raw;
        else throw new UsageError(`<${field}> must be JSON: inline, @file, a .json path or -`);
        continue;
      }
      input[field] = await coerce(raw, own[field], tool.input, this.sys.io, `<${field}>`);
    }

    // 3. flags: the tool's own fields, then the shorthand's
    const choices: Record<string, unknown> = {};
    const snapFlags: string[] = [];
    const choiceFlags: string[] = [];
    for (const [name, raw] of flags) {
      if (CLI_BOOLEAN.has(name) || CLI_VALUE.has(name)) continue;
      const label = `--${kebab(name)}`;
      if (name in own) {
        input[name] = await coerce(raw, own[name], tool.input, this.sys.io, label);
      } else if (name in snapFields && snapTool) {
        net[name] = await coerce(raw, snapFields[name], snapTool.input, this.sys.io, label);
        snapFlags.push(label);
      } else if (name in choiceFields && proposeTool) {
        const value = await coerce(raw, choiceFields[name], proposeTool.input, this.sys.io, label);
        choices[name] = value;
        choiceFlags.push(label);
      } else if (name === 'choices' && takesChoicesFlag && proposeTool) {
        const value = await coerce(raw, choiceSchema, proposeTool.input, this.sys.io, label);
        Object.assign(choices, value);
        choiceFlags.push(label);
      } else if (name in ownChoices) {
        const current = (input.choices ?? {}) as Record<string, unknown>;
        const value = await coerce(raw, ownChoices[name], tool.input, this.sys.io, label);
        input.choices = { ...current, [name]: value };
      } else {
        throw new UsageError(
          `unknown flag ${label} for petal ${commandName(tool.name)}`,
          `Run \`petal help ${commandName(tool.name)}\` for its flags.`,
        );
      }
    }

    // 4. --out: write the SVG to a file
    const out = cliFlags.get('out');
    if (out !== undefined) {
      if (typeof out !== 'string') throw new UsageError('--out needs a file name');
      if (!('include_svg' in own) && !('svg' in fields(tool.output))) {
        throw new UsageError(`--out works only for tools that return an SVG (render)`);
      }
      if ('include_svg' in own) input.include_svg = true;
    }

    // 5. the shorthand plan: a network id in place of a sha256 or a spec takes the snapshot;
    // a spec, or a measure the tool requires, takes the default proposal too
    const network = typeof input.network === 'string' ? input.network : net.network;
    const needs = (f: string) => f in own && input[f] === undefined;
    const required = Array.isArray(tool.input.required) ? tool.input.required : [];
    const wantSpec = needs('spec');
    const wantMeasure = required.includes('measure') && needs('measure');
    const doPropose = typeof network === 'string' && (wantSpec || wantMeasure);
    const doSnap = typeof network === 'string' && (needs('sha256') || doPropose);
    if (!doSnap && snapFlags.length > 0) {
      throw new UsageError(
        `${snapFlags.join(', ')}: only when a network id stands in for the sha256 or the spec`,
      );
    }
    if (!doPropose && choiceFlags.length > 0) {
      throw new UsageError(
        `${choiceFlags.join(', ')}: only when a network id stands in for the spec`,
      );
    }

    const cfg = this.config(cliFlags);
    const ctx: ToolContext = { ...this.tools.createContext(cfg), caller: { door: 'cli' } };
    if (cliFlags.get('quiet') !== true) {
      ctx.onProgress ??= (e) => {
        const count = e.total !== undefined ? ` (${e.done ?? 0}/${e.total})` : '';
        this.sys.stderr(`${e.stage}: ${e.message}${count}\n`);
      };
    }
    const call = async (name: string, i: Record<string, unknown>) => {
      const result = await this.tool(name).run(i as never, ctx);
      if (isToolError(result)) throw new ToolFailure(result);
      return result as Record<string, unknown>;
    };

    if (doSnap) {
      const { network: _, params: netParams, ...rest } = net;
      const params = input.params ?? netParams;
      const withParams = params !== undefined ? { params } : {};
      const snap = await call('get_snapshot', { network, ...withParams, ...rest });
      if (needs('sha256')) input.sha256 = snap.sha256;
      if (doPropose) {
        const withChoices = Object.keys(choices).length > 0 ? { choices } : {};
        const proposal = await call('propose_spec', {
          network,
          ...withParams,
          sha256: snap.sha256,
          ...withChoices,
        });
        const spec = proposal.spec as { selection?: { measure?: string; petals?: number } };
        if (wantSpec) input.spec = spec;
        if (wantMeasure && spec?.selection?.measure !== undefined) {
          input.measure = spec.selection.measure;
          if (needs('petals') && spec.selection.petals !== undefined) {
            input.petals = spec.selection.petals;
          }
        }
      }
    }

    // 6. the call itself; its JSON is the answer
    const result = await tool.run(input as never, ctx);
    if (isToolError(result)) {
      this.sys.stdout(json(result));
      return 1;
    }
    if (typeof out === 'string') {
      const svg = (result as { svg?: unknown }).svg;
      if (typeof svg !== 'string') {
        throw new UsageError(`${tool.name} returned no svg to write to ${out}`);
      }
      this.sys.writeFile(out, svg);
      const { svg: _, ...rest } = result as Record<string, unknown>;
      this.sys.stderr(`wrote ${out} (${Buffer.byteLength(svg)} bytes)\n`);
      this.sys.stdout(json(rest));
      return 0;
    }
    this.sys.stdout(json(result));
    return 0;
  }

  help(command?: string): number {
    const p = (t: string) => this.sys.stdout(t);
    const tool = command ? this.find(command) : undefined;
    if (command === 'mcp') {
      p('petal mcp [--fake] [--root <dir>]\n\n');
      p("MCP over stdio (serveStdio): the registry's tools for Claude Code and Codex.\n");
      if (this.sys.asFile) {
        p('  claude mcp add petals -- "$(command -v node)" "$HOME/.petals/petal.mjs" mcp\n');
        p('It takes effect in a new session, and changes nothing until the person asks for it.\n');
      } else {
        p('  claude mcp add petal -- pnpm -s --dir <repo> petal mcp\n');
        p('`petal connect claude` does this for you, with Node 24 on the PATH.\n');
      }
      return 0;
    }
    if (command === 'connect') {
      p(CONNECT_HELP);
      return 0;
    }
    if (command === 'api') {
      p(`petal api [--port ${DEFAULT_PORT}] [--host <host>] [--fake] [--root <dir>]\n\n`);
      p("Petal's HTTP API (petalApp): tool routes, agent routes and /mcp, on Node.\n");
      return 0;
    }
    if (tool) {
      p(this.toolHelp(tool));
      return 0;
    }
    if (command) throw new UsageError(`unknown command: ${command}`, 'Run `petal help`.');
    p("petal: Petal's tools from a terminal. Calls the tool registry in process, prints JSON.\n\n");
    p(
      this.sys.asFile
        ? 'Usage: node petal.mjs <command> [args] [--flags]\n\n'
        : 'Usage: petal <command> [args] [--flags]     (from the repo root: pnpm petal ...)\n\n',
    );
    p(`Tools (${TOOLS_VERSION}, one command per registry tool):\n`);
    if (this.tools.registry.length === 0)
      p('  (none: @petal/tools has not registered its tools yet)\n');
    for (const t of this.tools.registry) {
      const slots = positionalFields(t.name, t.input)
        .map((s) => `<${s}>`)
        .join(' ');
      p(`  ${commandName(t.name).padEnd(20)}${t.name.padEnd(20)}${slots}\n`);
    }
    p('\nDoors:\n');
    p('  mcp                 MCP over stdio (serveStdio), for Claude Code and Codex\n');
    p('  terminal [agent]    your own claude, codex or hermes, in a box on the Petals page\n');
    if (!this.sys.asFile) {
      p(`  api                 the HTTP API (petalApp) on http://localhost:${DEFAULT_PORT}\n`);
      p('  connect <agent>     give your own agent (claude, codex) the skill and the tools\n');
    }
    p('  help [command]      this text, or one command and its flags\n');
    p('\nShorthand: a network id in place of a sha256 or a spec first takes the snapshot\n');
    p(
      '(get_snapshot), then, for a spec or a missing measure, the default proposal (propose_spec).\n',
    );
    p('  petal figures near-validators\n');
    p('  petal render near-validators --segments backers --out flower.svg\n');
    p(
      '\nEvery command: --input <json|@file|-> (the whole input), --fake, --root <dir>, --quiet.\n',
    );
    p('Exit codes: 0 done, 1 the tool returned an error (JSON on stdout), 2 bad command line.\n');
    return 0;
  }

  private toolHelp(tool: AnyTool): string {
    const own = fields(tool.input);
    const required = new Set(Array.isArray(tool.input.required) ? tool.input.required : []);
    const slots = positionalFields(tool.name, tool.input);
    const describe = (s: JSONSchema | undefined, root: JSONSchema) => {
      const types = [...typesOf(s, root)].filter((t) => t !== 'null' && t !== 'integer');
      const values = Array.isArray(s?.enum) ? ` (${s.enum.join(', ')})` : '';
      const text = typeof s?.description === 'string' ? `  ${s.description}` : '';
      return `${types.join('|') || 'json'}${values}${text}`;
    };
    const lines = [
      `petal ${commandName(tool.name)} ${slots.map((s) => `<${s}>`).join(' ')}   (tool ${tool.name})`,
    ];
    if (typeof tool.input.description === 'string') lines.push('', tool.input.description);
    lines.push('', 'Flags (the tool input; kebab-case for snake_case fields):');
    for (const [name, s] of Object.entries(own)) {
      const req = required.has(name) ? ' required' : '';
      lines.push(`  --${kebab(name).padEnd(20)}${describe(s, tool.input)}${req}`);
      // An object, or a list of them: its own fields, so nobody has to read the source for them.
      const inner = fields(s, tool.input);
      const item =
        s?.items && typeof s.items === 'object' ? fields(s.items as JSONSchema, tool.input) : {};
      for (const [k, v] of Object.entries(Object.keys(inner).length ? inner : item)) {
        lines.push(`      .${k.padEnd(18)}${describe(v, tool.input)}`);
      }
    }
    if ('sha256' in own || 'spec' in own) {
      lines.push('', 'A network id in place of the sha256 or spec first takes the snapshot (--at,');
      lines.push('--params, --fresh); for a spec or a missing measure, the default proposal.');
      if ('spec' in own)
        lines.push('Choice flags (--segments, --width, ...) or --choices <json> go to it.');
    }
    if ('choices' in own) lines.push('', 'Choice flags (--segments, --width, ...) fill --choices.');
    if ('include_svg' in own) lines.push('', '--out <file> writes the SVG to a file.');
    const out = fields(tool.output);
    if (Object.keys(out).length) {
      lines.push(
        '',
        'Answers with (JSON on stdout; an error is { error: { code, message, hint } }):',
      );
      for (const [name, s] of Object.entries(out)) {
        lines.push(`  ${name.padEnd(22)}${describe(s, tool.output)}`);
      }
    }
    if (this.sys.asFile && tool.name === 'render_flower') {
      lines.push(
        '',
        "In this file, render also saves the flower to this conversation's page, with the reading it",
        'came from, and its short_url is the link to give. save-step is not needed after it.',
      );
    }
    if (this.sys.asFile && tool.name === 'save_step') {
      lines.push(
        '',
        'render already does this for each flower it draws: use it only for a spec drawn elsewhere.',
      );
    }
    return `${lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')}\n`;
  }
}

function without(
  a: Record<string, JSONSchema>,
  ...others: Record<string, JSONSchema>[]
): Record<string, JSONSchema> {
  return Object.fromEntries(Object.entries(a).filter(([k]) => !others.some((o) => k in o)));
}
