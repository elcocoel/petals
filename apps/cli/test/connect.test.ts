// T163: `petal connect`. These tests never touch real config: every test gets a throwaway home and
// a fake runner. The fake behaves as the real CLIs did when probed (Claude Code 2.1.318, Codex
// 0.166.0): `claude mcp add` refuses an existing name, `codex mcp add` replaces it, and
// `claude mcp remove -s project` leaves {"mcpServers":{}} behind.
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { callerCwd } from '../src/config.ts';
import type { RunCommand } from '../src/connect.ts';
import { run } from './fake-registry.ts';

const ROOT = join(import.meta.dirname, '../../..');
const SKILL = readFileSync(join(ROOT, 'skill/petal/SKILL.md'), 'utf8');

interface Call {
  command: string;
  args: string[];
  cwd: string;
}

interface StdioServer {
  type?: string;
  command?: string;
  url?: string;
  args?: string[];
  env?: Record<string, string> | null;
}

interface World {
  base: string;
  home: string;
  work: string;
  repo: string;
  bin: string;
  serverPath: string;
  env: Record<string, string | undefined>;
  calls: Call[];
  /** the agents whose CLI "is installed" */
  installed: Set<string>;
  /** what Codex's config holds */
  codex: Map<string, StdioServer>;
}

function world(): World {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'w7-connect-test-')));
  const w: World = {
    base,
    home: join(base, 'home'),
    work: join(base, 'work folder'),
    repo: join(base, 'my repo'),
    bin: join(base, 'node24', 'bin'),
    serverPath: '',
    env: {},
    calls: [],
    installed: new Set(['claude', 'codex']),
    codex: new Map(),
  };
  for (const dir of [w.home, w.work, w.bin, join(w.repo, 'skill/petal')]) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(join(w.repo, 'skill/petal/SKILL.md'), SKILL);
  writeFileSync(join(w.bin, 'pnpm'), '#!/bin/sh\n');
  chmodSync(join(w.bin, 'pnpm'), 0o755);
  w.serverPath = `${w.bin}:/usr/bin:/bin`;
  return w;
}

const ok = (stdout = '') => ({ code: 0, stdout, stderr: '' });
const fail = (stderr: string) => ({ code: 1, stdout: '', stderr });

function readJson(file: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function fakeClaude(w: World, args: string[], cwd: string) {
  const at = (flag: string) => args[args.indexOf(flag) + 1] as string;
  const scope = at('-s');
  const file =
    scope === 'project'
      ? join(cwd, '.mcp.json')
      : join(w.env.CLAUDE_CONFIG_DIR ?? w.home, '.claude.json');
  const config = readJson(file);
  const servers = (config.mcpServers ?? {}) as Record<string, StdioServer>;
  const save = () => writeFileSync(file, JSON.stringify({ ...config, mcpServers: servers }));
  if (args[1] === 'add') {
    if (args[4] !== 'petal' || args[5] !== '-e' || args[7] !== '--') return fail('bad add form');
    if (servers.petal) return fail(`MCP server petal already exists in ${scope} config`);
    const [command, ...rest] = args.slice(8);
    const path = (args[6] as string).replace(/^PATH=/, '');
    servers.petal = { type: 'stdio', command, args: rest, env: { PATH: path } };
    save();
    return ok();
  }
  if (args[1] === 'remove') {
    if (!servers.petal) return fail(`No MCP server named "petal" in ${scope} scope`);
    delete servers.petal;
    save();
    return ok();
  }
  return fail(`unexpected: claude ${args.join(' ')}`);
}

function fakeCodex(w: World, args: string[]) {
  if (args[1] === 'get') {
    const server = w.codex.get('petal');
    if (!server) return fail("Error: No MCP server named 'petal' found.");
    return ok(JSON.stringify({ name: 'petal', enabled: true, transport: server }));
  }
  if (args[1] === 'add') {
    if (args[2] !== 'petal' || args[3] !== '--env' || args[5] !== '--') return fail('bad add form');
    const [command, ...rest] = args.slice(6);
    const path = (args[4] as string).replace(/^PATH=/, '');
    w.codex.set('petal', { type: 'stdio', command, args: rest, env: { PATH: path } });
    return ok();
  }
  if (args[1] === 'remove') {
    w.codex.delete('petal');
    return ok();
  }
  return fail(`unexpected: codex ${args.join(' ')}`);
}

const fakeRunner =
  (w: World): RunCommand =>
  (command, args, cwd) => {
    w.calls.push({ command, args, cwd });
    if (!w.installed.has(command)) return { code: 127, stdout: '', stderr: 'ENOENT' };
    if (args[0] === '--version') return ok('1.0.0');
    return command === 'claude' ? fakeClaude(w, args, cwd) : fakeCodex(w, args);
  };

const connect = (w: World, argv: string[], deps: Record<string, unknown> = {}) =>
  run(['connect', ...argv], {
    deps: {
      env: w.env,
      cwd: w.work,
      root: w.repo,
      home: w.home,
      nodeBin: w.bin,
      nodeVersion: 'v24.14.0',
      runCommand: fakeRunner(w),
      ...deps,
    },
  });

/** Every file under a folder with its content, to compare before and after. */
function tree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    const path = join(entry.parentPath, entry.name);
    out[path] = entry.isDirectory() ? '<dir>' : readFileSync(path, 'utf8');
  }
  return out;
}

const changes = (w: World) => w.calls.filter((c) => /add|remove/.test(c.args[1] ?? ''));
const mcpArgs = (w: World) => ['-s', '--dir', w.repo, 'petal', 'mcp'];

describe('petal connect claude', () => {
  test('user scope by default: the server through claude mcp add, the skill in ~/.claude', async () => {
    const w = world();
    const r = await connect(w, ['claude']);
    expect(r.code, r.stderr).toBe(0);
    expect(changes(w)).toEqual([
      {
        command: 'claude',
        args: [
          'mcp',
          'add',
          '-s',
          'user',
          'petal',
          '-e',
          `PATH=${w.serverPath}`,
          '--',
          'pnpm',
          ...mcpArgs(w),
        ],
        cwd: w.work,
      },
    ]);
    const servers = readJson(join(w.home, '.claude.json')).mcpServers as Record<
      string,
      StdioServer
    >;
    expect(servers.petal?.env?.PATH?.split(':')[0]).toBe(w.bin); // Node 24 first
    const skill = readFileSync(join(w.home, '.claude/skills/petal/SKILL.md'), 'utf8');
    expect(skill).toContain(`pnpm -s --dir "${w.repo}" petal render @spec.json`);
    expect(skill).not.toContain('<repo>');
    expect(tree(w.work)).toEqual({});
  });

  test('says what it did and what to try next', async () => {
    const w = world();
    const r = await connect(w, ['claude']);
    expect(r.stdout).toContain("Claude Code now has Petal's skill and tools (in every folder).");
    expect(r.stdout).toContain(join(w.home, '.claude/skills/petal/SKILL.md'));
    expect(r.stdout).toContain(`claude "who stands behind NEAR's validators?"`);
    expect(r.stdout).toContain(
      `claude -p "..." --allowedTools mcp__petal "Bash(pnpm *)" "Bash(grep *)" Write`,
    );
    expect(r.stdout).toContain(`Undo: pnpm -s --dir '${w.repo}' petal connect claude --remove`);
  });

  test('twice is fine: the second run changes nothing', async () => {
    const w = world();
    await connect(w, ['claude']);
    const before = tree(w.home);
    w.calls.length = 0;
    const r = await connect(w, ['claude']);
    expect(r.code).toBe(0);
    expect(changes(w)).toEqual([]);
    expect(tree(w.home)).toEqual(before);
    expect(r.stdout).toContain('already has Petal');
    expect(r.stdout).toContain('Nothing changed.');
  });

  test('--dry-run prints exactly what it would change, and changes nothing', async () => {
    const w = world();
    const home = tree(w.home);
    const r = await connect(w, ['claude', '--dry-run']);
    expect(r.code).toBe(0);
    expect(tree(w.home)).toEqual(home);
    expect(tree(w.work)).toEqual({});
    expect(changes(w)).toEqual([]);
    expect(r.stdout).toContain('Dry run, nothing changed.');
    expect(r.stdout).toContain(
      `claude mcp add -s user petal -e PATH=${w.serverPath} -- pnpm -s --dir '${w.repo}' petal mcp`,
    );
    expect(r.stdout).toContain(join(w.home, '.claude/skills/petal/SKILL.md'));
  });

  test('--remove undoes it, and a second --remove finds nothing', async () => {
    const w = world();
    writeFileSync(join(w.home, '.claude.json'), JSON.stringify({ theirs: 1 }));
    await connect(w, ['claude']);
    const r = await connect(w, ['claude', '--remove']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain('Removed Petal from Claude Code');
    expect(readJson(join(w.home, '.claude.json'))).toEqual({ theirs: 1, mcpServers: {} });
    expect(Object.keys(tree(w.home))).not.toContain(join(w.home, '.claude/skills/petal'));

    w.calls.length = 0;
    const again = await connect(w, ['claude', '--remove']);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain("Nothing of Petal's to remove");
    expect(changes(w)).toEqual([]);
  });

  test('--remove --dry-run lists the removal and keeps everything', async () => {
    const w = world();
    await connect(w, ['claude']);
    const before = tree(w.home);
    w.calls.length = 0;
    const r = await connect(w, ['claude', '--remove', '--dry-run']);
    expect(r.code).toBe(0);
    expect(tree(w.home)).toEqual(before);
    expect(changes(w)).toEqual([]);
    expect(r.stdout).toContain('claude mcp remove -s user petal');
    expect(r.stdout).toContain(join(w.home, '.claude/skills/petal/SKILL.md'));
  });

  test('--project: this folder only, and --remove leaves the folder as it was', async () => {
    const w = world();
    const home = tree(w.home);
    const r = await connect(w, ['claude', '--project']);
    expect(r.code, r.stderr).toBe(0);
    expect(tree(w.home)).toEqual(home);
    expect(changes(w)[0]).toMatchObject({ cwd: w.work });
    expect(changes(w)[0]?.args.slice(0, 4)).toEqual(['mcp', 'add', '-s', 'project']);
    const servers = readJson(join(w.work, '.mcp.json')).mcpServers as Record<string, StdioServer>;
    expect(servers.petal?.command).toBe('pnpm');
    expect(readFileSync(join(w.work, '.claude/skills/petal/SKILL.md'), 'utf8')).toContain(w.repo);
    expect(r.stdout).toContain('asks you to approve the petal server');
    expect(r.stdout).toContain('keep it out of git');
    expect(r.stdout).toContain('connect claude --project --remove');

    const gone = await connect(w, ['claude', '--project', '--remove']);
    expect(gone.code, gone.stderr).toBe(0);
    expect(tree(w.work)).toEqual({});
  });

  test('--project --remove keeps what else is in .mcp.json and .claude', async () => {
    const w = world();
    mkdirSync(join(w.work, '.claude'));
    writeFileSync(join(w.work, '.claude/settings.json'), '{}');
    writeFileSync(
      join(w.work, '.mcp.json'),
      JSON.stringify({ mcpServers: { other: { command: 'x' } } }),
    );
    await connect(w, ['claude', '--project']);
    await connect(w, ['claude', '--project', '--remove']);
    expect(readJson(join(w.work, '.mcp.json'))).toEqual({
      mcpServers: { other: { command: 'x' } },
    });
    expect(readdirSync(join(w.work, '.claude'))).toEqual(['settings.json']);
  });

  test('CLAUDE_CONFIG_DIR moves both the skill and the user config', async () => {
    const w = world();
    const dir = join(w.base, 'throwaway');
    mkdirSync(dir);
    w.env.CLAUDE_CONFIG_DIR = dir;
    const home = tree(w.home);
    const r = await connect(w, ['claude']);
    expect(r.code, r.stderr).toBe(0);
    expect(tree(w.home)).toEqual(home);
    expect(readJson(join(dir, '.claude.json')).mcpServers).toHaveProperty('petal');
    expect(readFileSync(join(dir, 'skills/petal/SKILL.md'), 'utf8')).toContain('# Petal');
    // it reads the same file claude writes, so a second run is a no-op
    expect((await connect(w, ['claude'])).stdout).toContain('Nothing changed.');
  });
});

describe('what is not Petal stays untouched', () => {
  const mine = '---\nname: petal\ndescription: my own notes\n---\n\nnot the Petal skill\n';

  test('a skill of the same name stops it, before anything changes', async () => {
    const w = world();
    const file = join(w.home, '.claude/skills/petal/SKILL.md');
    mkdirSync(join(w.home, '.claude/skills/petal'), { recursive: true });
    writeFileSync(file, mine);
    const before = tree(w.home);
    const r = await connect(w, ['claude']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('stopped, nothing changed');
    expect(r.stderr).toContain(`${file} isn't Petal's skill`);
    expect(changes(w)).toEqual([]);
    expect(tree(w.home)).toEqual(before);
  });

  test('--remove leaves that skill alone', async () => {
    const w = world();
    mkdirSync(join(w.home, '.claude/skills/petal'), { recursive: true });
    writeFileSync(join(w.home, '.claude/skills/petal/SKILL.md'), mine);
    const before = tree(w.home);
    const r = await connect(w, ['claude', '--remove']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('left alone');
    expect(tree(w.home)).toEqual(before);
  });

  test('a claude server named petal that is something else stops it', async () => {
    const w = world();
    const config = { mcpServers: { petal: { command: 'npx', args: ['flowers', 'mcp'] } } };
    writeFileSync(join(w.home, '.claude.json'), JSON.stringify(config));
    const before = tree(w.home);
    const r = await connect(w, ['claude']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("isn't Petal's: npx flowers mcp");
    expect(changes(w)).toEqual([]);
    expect(tree(w.home)).toEqual(before);
    const gone = await connect(w, ['claude', '--remove']);
    expect(gone.stdout).toContain("left alone: it isn't Petal's");
    expect(changes(w)).toEqual([]);
  });

  test('codex: a server named petal is not replaced, though codex mcp add would', async () => {
    const w = world();
    const theirs = { type: 'stdio', command: 'npx', args: ['flowers', 'mcp'], env: null };
    w.codex.set('petal', theirs);
    const r = await connect(w, ['codex']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("isn't Petal's");
    expect(w.codex.get('petal')).toEqual(theirs);
    expect(changes(w)).toEqual([]);
  });

  test('a server whose name only ends in petal is not Petal', async () => {
    const w = world();
    w.codex.set('petal', { type: 'stdio', command: 'pnpm', args: ['evil-petal', 'mcp'] });
    expect((await connect(w, ['codex'])).code).toBe(1);
  });

  test('an HTTP server named petal is not replaced', async () => {
    const w = world();
    const config = { mcpServers: { petal: { type: 'http', url: 'http://localhost:8787/mcp' } } };
    writeFileSync(join(w.home, '.claude.json'), JSON.stringify(config));
    expect((await connect(w, ['claude'])).code).toBe(1);
  });

  test('a symlinked skill is never written through', async () => {
    const w = world();
    const target = join(w.base, 'elsewhere');
    mkdirSync(target);
    writeFileSync(join(target, 'SKILL.md'), SKILL);
    mkdirSync(join(w.home, '.claude/skills'), { recursive: true });
    symlinkSync(target, join(w.home, '.claude/skills/petal'));
    const r = await connect(w, ['claude']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('is a symlink');
    expect(readFileSync(join(target, 'SKILL.md'), 'utf8')).toBe(SKILL);
    const gone = await connect(w, ['claude', '--remove']);
    expect(gone.stdout).toContain('is a symlink, left alone');
    expect(readFileSync(join(target, 'SKILL.md'), 'utf8')).toBe(SKILL);
  });

  test('unreadable JSON stops it rather than guessing', async () => {
    const w = world();
    writeFileSync(join(w.home, '.claude.json'), '{ not json');
    const r = await connect(w, ['claude']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("isn't valid JSON");
    expect(changes(w)).toEqual([]);
  });

  test("a Petal server or skill from another clone is Petal's: it's brought up to date", async () => {
    const w = world();
    const old = {
      type: 'stdio',
      command: 'pnpm',
      args: ['-s', '--dir', '/old/clone', 'petal', 'mcp'],
      env: { PATH: '/old/node/bin:/usr/bin:/bin' },
    };
    writeFileSync(join(w.home, '.claude.json'), JSON.stringify({ mcpServers: { petal: old } }));
    mkdirSync(join(w.home, '.claude/skills/petal'), { recursive: true });
    writeFileSync(join(w.home, '.claude/skills/petal/SKILL.md'), SKILL);
    const r = await connect(w, ['claude']);
    expect(r.code, r.stderr).toBe(0);
    expect(changes(w).map((c) => c.args[1])).toEqual(['remove', 'add']);
    const servers = readJson(join(w.home, '.claude.json')).mcpServers as Record<
      string,
      StdioServer
    >;
    expect(servers.petal?.args).toEqual(mcpArgs(w));
    expect(r.stdout).toContain('updated');
  });

  test('other files beside the skill stay, and so does their folder', async () => {
    const w = world();
    await connect(w, ['claude']);
    const notes = join(w.home, '.claude/skills/petal/notes.md');
    writeFileSync(notes, 'mine');
    await connect(w, ['claude', '--remove']);
    expect(readFileSync(notes, 'utf8')).toBe('mine');
    expect(readdirSync(join(w.home, '.claude/skills/petal'))).toEqual(['notes.md']);
  });
});

describe('petal connect codex', () => {
  test('the server through codex mcp add, the skill where its docs say', async () => {
    const w = world();
    const r = await connect(w, ['codex']);
    expect(r.code, r.stderr).toBe(0);
    expect(changes(w).map((c) => c.args)).toEqual([
      ['mcp', 'add', 'petal', '--env', `PATH=${w.serverPath}`, '--', 'pnpm', ...mcpArgs(w)],
    ]);
    const skill = readFileSync(join(w.home, '.agents/skills/petal/SKILL.md'), 'utf8');
    expect(skill).toContain(`pnpm -s --dir "${w.repo}" petal render`);
    expect(r.stdout).toContain(`codex "who stands behind NEAR's validators?"`);
    expect(r.stdout).toContain(`petal connect codex --remove`);
  });

  test('never touches AGENTS.md', async () => {
    const w = world();
    mkdirSync(join(w.home, '.codex'));
    writeFileSync(join(w.home, '.codex/AGENTS.md'), 'my rules');
    writeFileSync(join(w.work, 'AGENTS.md'), 'project rules');
    await connect(w, ['codex']);
    await connect(w, ['codex', '--remove']);
    expect(readFileSync(join(w.home, '.codex/AGENTS.md'), 'utf8')).toBe('my rules');
    expect(readFileSync(join(w.work, 'AGENTS.md'), 'utf8')).toBe('project rules');
  });

  test('twice is fine, --dry-run changes nothing, --remove undoes it', async () => {
    const w = world();
    const empty = tree(w.home);
    const dry = await connect(w, ['codex', '--dry-run']);
    expect(dry.code).toBe(0);
    expect(tree(w.home)).toEqual(empty);
    expect(w.codex.size).toBe(0);
    expect(dry.stdout).toContain(
      `codex mcp add petal --env PATH=${w.serverPath} -- pnpm -s --dir '${w.repo}' petal mcp`,
    );

    await connect(w, ['codex']);
    w.calls.length = 0;
    expect((await connect(w, ['codex'])).stdout).toContain('Nothing changed.');
    expect(changes(w)).toEqual([]);

    expect((await connect(w, ['codex', '--remove'])).code).toBe(0);
    expect(w.codex.size).toBe(0);
    expect(Object.keys(tree(w.home))).not.toContain(join(w.home, '.agents/skills/petal'));
  });

  test('CODEX_HOME keeps the skill in that home too, which Codex also reads', async () => {
    const w = world();
    const dir = join(w.base, 'codex-home');
    w.env.CODEX_HOME = dir;
    const home = tree(w.home);
    expect((await connect(w, ['codex'])).code).toBe(0);
    expect(tree(w.home)).toEqual(home);
    expect(readFileSync(join(dir, 'skills/petal/SKILL.md'), 'utf8')).toContain('# Petal');
  });

  test('a failing codex mcp get stops it, because mcp add would overwrite blindly', async () => {
    const w = world();
    const r = await connect(w, ['codex'], {
      runCommand: (command: string, args: string[], cwd: string) => {
        w.calls.push({ command, args, cwd });
        return args[0] === '--version' ? ok('1') : fail('config.toml: parse error');
      },
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('config.toml: parse error');
    expect(changes(w)).toEqual([]);
  });

  test('--project is Claude Code only', async () => {
    const w = world();
    const r = await connect(w, ['codex', '--project']);
    expect(r.code).toBe(2);
    expect(JSON.parse(r.stderr).error.message).toContain('--project works only for claude');
    expect(changes(w)).toEqual([]);
  });
});

describe('the rest of the command line', () => {
  test.each([['cursor'], ['constructor']])(
    'an agent it does not know (%s): what is supported, and the two generic pieces',
    async (name) => {
      const w = world();
      const r = await connect(w, [name]);
      expect(r.code).toBe(2);
      expect(r.stdout).toContain(`It can't set up ${name} by itself`);
      expect(r.stdout).toContain('claude (Claude Code), codex (Codex)');
      expect(r.stdout).toContain(`pnpm -s --dir '${w.repo}' petal mcp`);
      expect(r.stdout).toContain(w.serverPath);
      expect(r.stdout).toContain(join(w.repo, 'skill/petal/SKILL.md'));
      expect(r.stdout).toContain(`where it says <repo>, it means ${w.repo}`);
      expect(w.calls).toEqual([]);
      expect(tree(w.home)).toEqual({});
    },
  );

  test('no agent at all is the same list', async () => {
    const w = world();
    const r = await connect(w, []);
    expect(r.code).toBe(2);
    expect(r.stdout).toContain('Which agent?');
    expect(r.stdout).toContain('claude (Claude Code), codex (Codex)');
  });

  test('--help, and petal help connect', async () => {
    const w = world();
    expect((await connect(w, ['--help'])).stdout).toMatch(/^petal connect <agent>/);
    expect(w.calls).toEqual([]);
    expect((await run(['help', 'connect'])).stdout).toMatch(/^petal connect <agent>/);
    expect((await run(['help'])).stdout).toContain('connect <agent>');
  });

  test('an unknown flag, or two agents, is a usage error', async () => {
    const w = world();
    expect((await connect(w, ['claude', '--force'])).code).toBe(2);
    expect((await connect(w, ['claude', 'codex'])).code).toBe(2);
    expect((await connect(w, ['claude', '--dry-run=1'])).code).toBe(2);
    expect(w.calls).toEqual([]);
  });

  test('an agent that is not installed: says so, gives the pieces, changes nothing', async () => {
    const w = world();
    w.installed.clear();
    const r = await connect(w, ['claude']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("claude isn't on your PATH");
    expect(r.stderr).toContain('petal mcp');
    expect(tree(w.home)).toEqual({});
  });

  test('a repo without the skill stops it', async () => {
    const w = world();
    const r = await connect(w, ['claude', '--root', join(w.base, 'nowhere')]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("There's no skill at");
    expect(changes(w)).toEqual([]);
  });

  test('--root registers that clone', async () => {
    const w = world();
    const r = await connect(w, ['claude', '--root', w.repo]);
    expect(r.code, r.stderr).toBe(0);
    expect(changes(w)[0]?.args).toContain(w.repo);
  });

  test('a failed agent command is reported, and the skill is not left behind', async () => {
    const w = world();
    const r = await connect(w, ['claude'], {
      runCommand: () => ({ code: 1, stdout: '', stderr: 'claude says no' }),
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('claude says no');
    expect(tree(w.home)).toEqual({});
  });
});

describe("the server's PATH", () => {
  test('refuses any node but 24, since it would be written into the config', async () => {
    const w = world();
    const r = await connect(w, ['claude'], { nodeVersion: 'v22.22.3' });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('needs Node 24');
    expect(r.stderr).toContain('v22.22.3');
    expect(tree(w.home)).toEqual({});
    expect(w.calls).toEqual([]);
  });

  test("pnpm outside node's folder is on it too, after node", async () => {
    const w = world();
    const nodeOnly = join(w.base, 'node-only');
    mkdirSync(nodeOnly);
    const pnpmHome = join(w.base, 'pnpm-home');
    mkdirSync(pnpmHome);
    writeFileSync(join(pnpmHome, 'pnpm'), '#!/bin/sh\n');
    chmodSync(join(pnpmHome, 'pnpm'), 0o755);
    w.env.PATH = `${pnpmHome}:/usr/bin`;
    const r = await connect(w, ['codex'], { nodeBin: nodeOnly });
    expect(r.code, r.stderr).toBe(0);
    expect(w.codex.get('petal')?.env?.PATH).toBe(`${nodeOnly}:${pnpmHome}:/usr/bin:/bin`);
  });

  test("ignores the folders pnpm's script runner adds to the PATH", async () => {
    const w = world();
    const nodeOnly = join(w.base, 'node-only');
    const shim = join(w.base, 'x/node_modules/.bin');
    mkdirSync(nodeOnly);
    mkdirSync(shim, { recursive: true });
    writeFileSync(join(shim, 'pnpm'), '#!/bin/sh\n');
    chmodSync(join(shim, 'pnpm'), 0o755);
    w.env.PATH = shim;
    const r = await connect(w, ['codex'], { nodeBin: nodeOnly });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('pnpm is not on your PATH');
  });
});

describe('the folder the person is in', () => {
  test('our own pnpm script: INIT_CWD, because pnpm --dir moves the process into the repo', () => {
    const env = { npm_lifecycle_event: 'petal', INIT_CWD: '/caller' };
    expect(callerCwd(env, '/repo')).toBe('/caller');
  });

  test("someone else's script, or no script: the real working directory", () => {
    expect(callerCwd({ npm_lifecycle_event: 'test', INIT_CWD: '/caller' }, '/x')).toBe('/x');
    expect(callerCwd({}, '/x')).toBe('/x');
  });
});

describe('the agent page shows the command', () => {
  test('a plain section', () => {
    const page = readFileSync(join(ROOT, 'apps/web/components/AgentHome.tsx'), 'utf8');
    expect(page).toContain('Use your own agent');
    expect(page).toContain('pnpm petal connect claude');
    expect(page).toContain('pnpm petal connect codex');
  });
});
