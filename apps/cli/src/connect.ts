// `petal connect <claude|codex>` (T163): one command that gives someone's own agent Petal's skill
// and tools. A door, like `mcp` and `api`: no tool logic here. Servers are added and removed only
// through the agent's own CLI; the one file written directly is the skill.
//
// What the real CLIs do (Claude Code 2.1.318, Codex 0.166.0), and why this file looks first:
//   claude mcp add                 refuses a name that already exists in that scope
//   codex mcp add                  silently replaces one
//   claude mcp remove -s project   leaves {"mcpServers":{}} behind in .mcp.json
//   Codex's skills                 $HOME/.agents/skills (its docs); it also reads $CODEX_HOME/skills
import { spawnSync } from 'node:child_process';
import {
  accessSync,
  constants,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  type Stats,
  writeFileSync,
} from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { kebab, tokenize, UsageError } from './args.ts';
import type { Env } from './config.ts';

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}
/** Runs one command and waits. A command that can't be found gives code 127. */
export type RunCommand = (command: string, args: string[], cwd: string) => CommandResult;

/** Everything connect touches outside its own files, so tests never reach real config. */
export interface ConnectSystem {
  env: Env;
  /** the folder the person is in; `--project` installs here */
  cwd: string;
  /** the Petal repo the MCP server runs from */
  root: string;
  home: string;
  /** the folder of the node running this command */
  nodeBin: string;
  nodeVersion: string;
  runCommand: RunCommand;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export const spawnCommand =
  (env: Env): RunCommand =>
  (command, args, cwd) => {
    const r = spawnSync(command, args, {
      cwd,
      env: env as NodeJS.ProcessEnv,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r.error) return { code: 127, stdout: '', stderr: r.error.message };
    return { code: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
  };

/** The MCP server's name, as every door says it; the skill keeps its own name, petal. */
const SERVER = 'petals';
const SKILL_NAME = 'petal';
/** The repo's own command, which runs the server: pnpm petal mcp. */
const CLI = 'petal';
const QUESTION = "who stands behind NEAR's validators?";
const SKILL_MARK = '<!-- petal:shared:begin -->';
const BOOLEANS = new Set(['dry_run', 'remove', 'project', 'help']);
const DONE: Record<string, string> = {
  run: 'ran',
  write: 'wrote',
  update: 'updated',
  delete: 'deleted',
};

export const CONNECT_HELP = `petal connect <agent> [--project] [--dry-run] [--remove] [--root <dir>]

Gives your own agent Petals' skill and tools, so it can run the search instead of Petals' chat.

Agents:
  claude      Claude Code: the skill in ~/.claude/skills/petal, the server with claude mcp add
  codex       Codex: the skill in ~/.agents/skills/petal, the server with codex mcp add

  --project   Claude Code only: this folder instead of every folder (.mcp.json, .claude/skills).
              From outside the repo: pnpm -s --dir <repo> petal connect claude --project
  --dry-run   print exactly what it would change, and change nothing
  --remove    undo it

Safe to run twice. It never overwrites a skill or a server that isn't Petals': it stops and says so.
For any other agent, run petal connect <name> for the MCP command and the skill's path.
`;

/** Something in the way: a plain message on stderr, exit code 1, nothing changed. */
class Stop extends Error {}

const quote = (arg: string) =>
  /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`;
const shell = (parts: string[]) => parts.map(quote).join(' ');

/** An MCP server as an agent has it registered. */
interface Server {
  command: string;
  args: string[];
  path?: string;
}

/** One agent, in one scope: where things go, and how its own CLI adds and removes a server. */
interface Agent {
  id: string;
  label: string;
  where: string;
  skillDir: string;
  /** folders of ours to remove along with the skill, when nothing else is in them */
  tidyDirs: string[];
  /** a config file connect made Claude create, which `--remove` must not leave empty */
  tidyConfig?: string;
  read(): Server | null;
  add(server: Server): string[];
  remove: string[];
  next: string[];
}

interface Step {
  verb: string;
  text: string;
  apply(): void;
}

interface Plan {
  steps: Step[];
  kept: string[];
  conflicts: string[];
}

function readConfig(file: string): Record<string, unknown> | null {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Stop(`${file} isn't valid JSON, so I can't tell what is registered there. Fix it.`);
  }
}

function toServer(raw: Record<string, unknown>): Server {
  const env = raw.env as Record<string, unknown> | null | undefined;
  return {
    command: String(raw.command ?? raw.url ?? ''),
    args: Array.isArray(raw.args) ? raw.args.map(String) : [],
    ...(typeof env?.PATH === 'string' ? { path: env.PATH } : {}),
  };
}

function claude(sys: ConnectSystem, project: boolean): Agent {
  const scope = project ? 'project' : 'user';
  const configDir = sys.env.CLAUDE_CONFIG_DIR;
  const configFile = project
    ? join(sys.cwd, '.mcp.json')
    : join(configDir ?? sys.home, '.claude.json');
  const skills = project
    ? join(sys.cwd, '.claude', 'skills')
    : join(configDir ?? join(sys.home, '.claude'), 'skills');
  return {
    id: 'claude',
    label: 'Claude Code',
    where: project ? `only in ${sys.cwd}` : 'in every folder',
    skillDir: join(skills, SKILL_NAME),
    tidyDirs: project ? [skills, join(sys.cwd, '.claude')] : [],
    ...(project ? { tidyConfig: configFile } : {}),
    read() {
      const servers = readConfig(configFile)?.mcpServers as Record<string, unknown> | undefined;
      const raw = servers?.[SERVER] as Record<string, unknown> | undefined;
      return raw ? toServer(raw) : null;
    },
    add: (s) => [
      'mcp',
      'add',
      '-s',
      scope,
      SERVER,
      '-e',
      `PATH=${s.path}`,
      '--',
      s.command,
      ...s.args,
    ],
    remove: ['mcp', 'remove', '-s', scope, SERVER],
    next: [
      `Next: start a new Claude Code session ${project ? 'in this folder' : 'in any folder'} and ask:`,
      `  claude "${QUESTION}"`,
      'It asks before using each tool. To run without asking, and still get a local flower file:',
      `  claude -p "..." --allowedTools mcp__petals "Bash(pnpm *)" "Bash(grep *)" Write`,
      ...(project
        ? [
            'The first time, Claude Code asks you to approve the petal server.',
            ".mcp.json holds this machine's paths, so keep it out of git.",
          ]
        : []),
    ],
  };
}

function codex(sys: ConnectSystem): Agent {
  const skills = sys.env.CODEX_HOME
    ? join(sys.env.CODEX_HOME, 'skills')
    : join(sys.home, '.agents', 'skills');
  return {
    id: 'codex',
    label: 'Codex',
    where: 'in every folder',
    skillDir: join(skills, SKILL_NAME),
    tidyDirs: [],
    read() {
      const r = sys.runCommand('codex', ['mcp', 'get', SERVER, '--json'], sys.cwd);
      if (r.code !== 0) {
        if (/No MCP server named/i.test(r.stderr + r.stdout)) return null;
        throw new Stop(`codex mcp get ${SERVER} failed: ${(r.stderr || r.stdout).trim()}`);
      }
      try {
        const answer = JSON.parse(r.stdout) as { transport?: Record<string, unknown> };
        return toServer(answer.transport ?? {});
      } catch {
        throw new Stop(
          `codex mcp get ${SERVER} --json didn't answer with JSON: ${r.stdout.trim()}`,
        );
      }
    },
    add: (s) => ['mcp', 'add', SERVER, '--env', `PATH=${s.path}`, '--', s.command, ...s.args],
    remove: ['mcp', 'remove', SERVER],
    next: [
      'Next: start a new Codex session in any folder and ask:',
      `  codex "${QUESTION}"`,
      'It asks before using each tool, as your Codex approval settings say.',
    ],
  };
}

const AGENTS: Record<string, { label: string; make(s: ConnectSystem, project: boolean): Agent }> = {
  claude: { label: 'Claude Code', make: claude },
  codex: { label: 'Codex', make: codex },
};

function isExecutable(file: string): boolean {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The server's PATH: Node 24 first, because pnpm runs whichever node comes first and the repo
 * refuses any other. Then pnpm's folder, when it isn't beside node. pnpm's script runner puts its
 * own folders on the PATH, and those aren't a place to find pnpm next time.
 */
function serverPath(sys: ConnectSystem): string {
  const major = Number(/^v?(\d+)/.exec(sys.nodeVersion)?.[1]);
  if (major !== 24) {
    throw new Stop(
      `petal connect needs Node 24 to write it into the server's PATH, and this is ${sys.nodeVersion}. Run \`nvm use 24\`, then run this again.`,
    );
  }
  const onPath = (sys.env.PATH ?? '').split(delimiter);
  const pnpmDir = [sys.nodeBin, ...onPath].find(
    (dir) =>
      dir !== '' &&
      !dir.includes('node_modules') &&
      !dir.includes('node-gyp-bin') &&
      isExecutable(join(dir, 'pnpm')),
  );
  if (!pnpmDir) throw new Stop('pnpm is not on your PATH. Install pnpm 10, then run this again.');
  return [...new Set([sys.nodeBin, pnpmDir, '/usr/bin', '/bin'])].join(delimiter);
}

const wantedServer = (sys: ConnectSystem, root: string): Server => ({
  command: 'pnpm',
  args: ['-s', '--dir', root, CLI, 'mcp'],
  path: serverPath(sys),
});

/** Any clone's server counts as Petal's; an HTTP one or a different command does not. */
const isPetalServer = (s: Server) =>
  s.command === 'pnpm' && s.args.slice(-2).join(' ') === `${CLI} mcp`;

const sameServer = (a: Server, b: Server) =>
  a.command === b.command && a.args.join('\0') === b.args.join('\0') && a.path === b.path;

const isPetalSkill = (text: string) =>
  /^---\s[\s\S]*?^name:\s*petal\s*$/m.test(text) && text.includes(SKILL_MARK);

function lstatOrNull(path: string): Stats | null {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

type Skill = { kind: 'none' } | { kind: 'foreign'; why: string } | { kind: 'petal'; text: string };

/** What sits at a skill's folder. A symlink could lead anywhere, so it is never written through. */
function skillAt(dir: string): Skill {
  const file = join(dir, 'SKILL.md');
  for (const path of [dir, file]) {
    if (lstatOrNull(path)?.isSymbolicLink()) {
      return { kind: 'foreign', why: `${path} is a symlink` };
    }
  }
  const folder = lstatOrNull(dir);
  if (folder && !folder.isDirectory()) return { kind: 'foreign', why: `${dir} isn't a folder` };
  if (!lstatOrNull(file)) return { kind: 'none' };
  const text = readFileSync(file, 'utf8');
  return isPetalSkill(text)
    ? { kind: 'petal', text }
    : { kind: 'foreign', why: `${file} isn't Petals' skill` };
}

/** The skill as an agent gets it: with the real path of the repo where the text says <repo>. */
function skillText(root: string): string {
  const source = join(root, 'skill', 'petal', 'SKILL.md');
  let text: string;
  try {
    text = readFileSync(source, 'utf8');
  } catch {
    throw new Stop(`There's no skill at ${source}. Is ${root} a clone of the Petals repo?`);
  }
  return text.replaceAll('<repo>', root);
}

function runStep(sys: ConnectSystem, cli: string, args: string[]): Step {
  return {
    verb: 'run',
    text: shell([cli, ...args]),
    apply() {
      const r = sys.runCommand(cli, args, sys.cwd);
      if (r.code !== 0) {
        throw new Stop(`${shell([cli, ...args])} failed: ${(r.stderr || r.stdout).trim()}`);
      }
    },
  };
}

function planConnect(sys: ConnectSystem, agent: Agent, want: Server, text: string): Plan {
  const plan: Plan = { steps: [], kept: [], conflicts: [] };
  const have = agent.read();
  const add = runStep(sys, agent.id, agent.add(want));
  if (!have) plan.steps.push(add);
  else if (!isPetalServer(have)) {
    plan.conflicts.push(
      `${agent.label} already has an MCP server named ${SERVER} that isn't Petals': ${shell([have.command, ...have.args])}. Remove or rename it yourself, then run this again.`,
    );
  } else if (sameServer(have, want)) plan.kept.push(`MCP server ${SERVER}, already this one`);
  else plan.steps.push(runStep(sys, agent.id, agent.remove), add);

  const file = join(agent.skillDir, 'SKILL.md');
  const skill = skillAt(agent.skillDir);
  const write = (verb: string): Step => ({
    verb,
    text: file,
    apply() {
      mkdirSync(agent.skillDir, { recursive: true });
      writeFileSync(file, text);
    },
  });
  if (skill.kind === 'none') plan.steps.push(write('write'));
  else if (skill.kind === 'foreign') {
    plan.conflicts.push(`${skill.why}. Move it yourself, then run this again.`);
  } else if (skill.text === text) plan.kept.push(`${file}, already this one`);
  else plan.steps.push(write('update'));
  return plan;
}

/** After the server goes, is the config file empty? Then `.mcp.json` should go too. */
function holdsOnlyPetal(file: string): boolean {
  const config = readConfig(file);
  if (!config || Object.keys(config).length !== 1) return false;
  const servers = config.mcpServers;
  if (typeof servers !== 'object' || servers === null) return false;
  return Object.keys(servers).join() === SERVER;
}

function removeIfEmpty(dir: string): void {
  if (lstatOrNull(dir)?.isDirectory() && readdirSync(dir).length === 0) rmdirSync(dir);
}

function planRemove(sys: ConnectSystem, agent: Agent): Plan {
  const plan: Plan = { steps: [], kept: [], conflicts: [] };
  const have = agent.read();
  if (have && !isPetalServer(have)) {
    plan.kept.push(`MCP server ${SERVER}, left alone: it isn't Petals'`);
  } else if (have) {
    const emptiesConfig = agent.tidyConfig !== undefined && holdsOnlyPetal(agent.tidyConfig);
    plan.steps.push(runStep(sys, agent.id, agent.remove));
    if (emptiesConfig && agent.tidyConfig !== undefined) {
      const config = agent.tidyConfig;
      plan.steps.push({ verb: 'delete', text: config, apply: () => rmSync(config) });
    }
  }

  const file = join(agent.skillDir, 'SKILL.md');
  const skill = skillAt(agent.skillDir);
  if (skill.kind === 'foreign') plan.kept.push(`${skill.why}, left alone`);
  if (skill.kind === 'petal') {
    plan.steps.push({
      verb: 'delete',
      text: file,
      apply() {
        rmSync(file);
        for (const dir of [agent.skillDir, ...agent.tidyDirs]) removeIfEmpty(dir);
      },
    });
  }
  return plan;
}

/** The two generic pieces, for an agent this command can't set up itself. */
function pieces(root: string, server: Server): string {
  return [
    'For any other agent, give it these two pieces:',
    '',
    '  The MCP stdio command:',
    `    ${shell([server.command, ...server.args])}`,
    "  with this PATH in the server's environment (Node 24 first, or the server fails):",
    `    ${server.path}`,
    '',
    '  The skill:',
    `    ${join(root, 'skill', 'petal', 'SKILL.md')}`,
    `  (where it says <repo>, it means ${root})`,
    '',
  ].join('\n');
}

const supported = () =>
  Object.entries(AGENTS)
    .map(([id, a]) => `${id} (${a.label})`)
    .join(', ');

function parse(argv: string[]) {
  const { positionals, flags } = tokenize(argv, (n) => BOOLEANS.has(n));
  const on = new Set<string>();
  let root: string | undefined;
  for (const [name, value] of flags) {
    if (name === 'root' && typeof value === 'string') root = value;
    else if (!BOOLEANS.has(name)) {
      throw new UsageError(`unknown flag --${kebab(name)} for petal connect`, CONNECT_HELP);
    } else if (typeof value !== 'boolean') {
      throw new UsageError(`--${kebab(name)} takes no value`);
    } else if (value) on.add(name);
    else on.delete(name);
  }
  if (positionals.length > 1) {
    throw new UsageError('petal connect takes one agent', `Supported: ${supported()}.`);
  }
  return { agent: positionals[0], on, root };
}

export function connect(argv: string[], sys: ConnectSystem): number {
  const { agent: name, on, root: rootFlag } = parse(argv);
  if (on.has('help')) {
    sys.stdout(CONNECT_HELP);
    return 0;
  }
  const root = rootFlag ? resolve(sys.cwd, rootFlag) : sys.root;
  try {
    const want = wantedServer(sys, root);
    const entry = name === undefined || !Object.hasOwn(AGENTS, name) ? undefined : AGENTS[name];
    if (!entry) {
      const what = name === undefined ? 'Which agent?' : `It can't set up ${name} by itself.`;
      sys.stdout(`petal connect: ${what} Supported: ${supported()}.\n\n`);
      sys.stdout(pieces(root, want));
      return 2;
    }
    if (on.has('project') && name !== 'claude') {
      throw new UsageError(
        `--project works only for claude: ${entry.label}'s mcp add has no project scope`,
      );
    }
    const id = name as string;
    if (sys.runCommand(id, ['--version'], sys.cwd).code === 127) {
      throw new Stop(`${id} isn't on your PATH. Install ${entry.label}.\n\n${pieces(root, want)}`);
    }

    const agent = entry.make(sys, on.has('project'));
    const removing = on.has('remove');
    const plan = removing ? planRemove(sys, agent) : planConnect(sys, agent, want, skillText(root));
    if (plan.conflicts.length > 0) {
      sys.stderr(`petal connect ${id}: stopped, nothing changed.\n`);
      for (const c of plan.conflicts) sys.stderr(`  ${c}\n`);
      return 1;
    }

    const scope = on.has('project') ? ['--project'] : [];
    const command = shell(['pnpm', '-s', '--dir', root, CLI, 'connect', id, ...scope]);
    const line = (verb: string, text: string) => sys.stdout(`  ${verb.padEnd(8)}${text}\n`);
    const nothing = plan.steps.length === 0;
    if (on.has('dry_run')) {
      sys.stdout(
        `Dry run, nothing changed. petal connect ${id}${removing ? ' --remove' : ''} would:\n`,
      );
      for (const s of plan.steps) line(s.verb, s.text);
      for (const k of plan.kept) line('keep', k);
      if (nothing && plan.kept.length === 0) line('do', 'nothing: Petals is not installed here');
      return 0;
    }

    for (const s of plan.steps) s.apply();
    if (removing) {
      sys.stdout(
        nothing
          ? `Nothing of Petals' to remove from ${agent.label} (${agent.where}).\n`
          : `Removed Petals from ${agent.label} (${agent.where}).\n`,
      );
    } else {
      sys.stdout(
        nothing
          ? `${agent.label} already has Petals' skill and tools (${agent.where}). Nothing changed.\n`
          : `${agent.label} now has Petals' skill and tools (${agent.where}).\n`,
      );
    }
    for (const s of plan.steps) line(DONE[s.verb] ?? s.verb, s.text);
    for (const k of plan.kept) line('kept', k);
    if (!removing) {
      sys.stdout(`\n${agent.next.join('\n')}\nUndo: ${command} --remove\n`);
    }
    return 0;
  } catch (e) {
    if (e instanceof Stop) {
      sys.stderr(`petal connect: ${e.message}\n`);
      return 1;
    }
    throw e;
  }
}
