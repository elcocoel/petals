// T068, T069: the skill door. SKILL.md is in the Agent Skills format (as near/agent-skills),
// names the tools and routes of the contracts, and keeps the rules in the shared block that
// skill/build.ts syncs with packages/agent/src/prompt.md. The CLI and the skill are W7's two
// doors; this file lives with the CLI's tests because skill/ has no test project.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const ROOT = join(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const SKILL = read('skill/petal/SKILL.md');
const README = read('skill/petal/README.md');
const TOOLS = read('specs/001-petal-core/contracts/tools.md');
const HTTP = read('specs/001-petal-core/contracts/http-api.md');
const BEGIN = '<!-- petal:shared:begin -->';
const END = '<!-- petal:shared:end -->';
const shared = SKILL.slice(SKILL.indexOf(BEGIN), SKILL.indexOf(END));

describe('SKILL.md: the Agent Skills format', () => {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(SKILL);
  const front = Object.fromEntries(
    (match?.[1] ?? '')
      .split('\n')
      .filter((l) => /^[a-z]+:/.test(l))
      .map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]),
  );

  test('frontmatter with name and description, then instructions', () => {
    expect(match).not.toBeNull();
    expect(front.name).toBe('petal'); // the folder's name, lowercase
    expect(front.description?.length).toBeGreaterThan(50);
    expect(front.description?.length).toBeLessThanOrEqual(1024);
    expect(front.description).toMatch(/Use when /);
    expect(Object.keys(front).sort()).toEqual(['description', 'metadata', 'name']);
    expect(front.metadata).toMatch(/^\{ author: ".+", version: "\d+\.\d+\.\d+" \}$/);
    expect(SKILL.slice(match?.[0].length)).toMatch(/^\n# Petals\n/);
  });

  test('every Phase A tool of tools.md is named', () => {
    const phaseA = [...TOOLS.matchAll(/^\| `([a-z_]+)` \| A/gm)].map((m) => m[1] as string);
    expect(phaseA).toHaveLength(13);
    for (const tool of phaseA) expect(SKILL).toContain(`\`${tool}\``);
  });

  test('the six steps, in the order of tools.md', () => {
    const order = [
      'list_networks',
      'get_snapshot',
      'describe_snapshot',
      'compute_figures',
      'propose_spec',
      'validate_spec',
      'render_flower',
      'prepare_publish',
      'sign_url',
    ];
    const at = order.map((name) => shared.indexOf(`\`${name}\``));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  test('every route in the skill is a route of http-api.md', () => {
    const routes = new Set(
      [...HTTP.matchAll(/^\| `(GET|POST) ([^`?]+)/gm)].map((m) => `${m[1]} ${m[2]}`),
    );
    const used = [...SKILL.matchAll(/`(GET|POST) (\/api\/v1\/[^`?\s]*)/g)].map(
      (m) => `${m[1]} ${m[2]}`,
    );
    expect(used.length).toBeGreaterThanOrEqual(12);
    for (const r of used) expect(routes).toContain(r);
    for (const [, method, path] of SKILL.matchAll(/curl -s (?:-X (POST) )?"\$API(\/[^"?]*)/g)) {
      const route = `${method ?? 'GET'} ${path?.replace(/\$SHA/, ':sha256')}`;
      expect(routes).toContain(route);
    }
  });

  test('curl to PETAL_API, MCP names where configured', () => {
    // the shell default, written without a JS placeholder
    expect(SKILL).toContain(['API="$', '{PETAL_API:-http://localhost:8787}"'].join(''));
    expect(SKILL).toMatch(/MCP server is configured, call the same tools by name/);
    expect(SKILL).toContain('"include_svg": false');
  });

  test('publish only through prepare_publish and sign_url; never ask for a key', () => {
    expect(shared).toMatch(/`prepare_publish` with the entry, then give the person the `sign_url`/);
    expect(shared).toMatch(/Never ask anyone for a key, a seed phrase or a signature/);
    expect(shared).toMatch(/never sign or call `publish_flower` yourself/);
  });

  test('one shared block, marked for skill/build.ts', () => {
    expect(SKILL.split(BEGIN)).toHaveLength(2);
    expect(SKILL.split(END)).toHaveLength(2);
    expect(SKILL.indexOf(BEGIN)).toBeLessThan(SKILL.indexOf(END));
    expect(SKILL).toMatch(/coordinator syncs the wording at merge/);
  });

  test('says how to get the flower when no Petals site is running', () => {
    const own = SKILL.slice(SKILL.indexOf(END));
    expect(own).toContain('## When no Petals site is running');
    expect(own).toContain(
      `pnpm -s --dir "<repo>" petal render @spec.json --out flower.svg | grep '"spec_sha256"'`,
    );
    expect(own).toContain('"include_svg": true');
    expect(own).toMatch(/its full path takes the place of the link/);
    expect(shared).not.toContain('<repo>'); // the shared block is Petal's own prompt too
    // a real `claude -p` run with Bash(pnpm *) allowed was stopped at a redirect, so none here
    expect(own).not.toMatch(/petal render[^\n]*> /);
  });

  test('nothing local or out of bounds', () => {
    for (const text of [SKILL, README]) {
      expect(text).not.toMatch(/\/Users\/|file:\/\/|\.secrets/);
    }
  });
});

describe('README.md: install in Claude Code, Codex and IronClaw', () => {
  test.each([
    'claude mcp add petals -- pnpm -s --dir <repo> petal mcp',
    'pnpm petal connect claude',
    '~/.claude/skills/petal',
    '~/.agents/skills/petal',
    '~/.ironclaw/skills/petal',
    'claude mcp add --transport http petals http://localhost:8787/mcp',
    'pnpm api',
  ])('%s', (text) => {
    expect(README).toContain(text);
  });

  test('says Node 24 must be on the PATH the MCP client spawns', () => {
    expect(README).toMatch(/Node 24 must be first on the PATH that Claude Code gives the server/);
    expect(README).toContain('-e PATH=');
  });
});

describe('skill/build.ts', () => {
  const build = (args: string[]) =>
    spawnSync(process.execPath, [join(ROOT, 'skill/build.ts'), ...args], { encoding: 'utf8' });

  test('--check passes in the repo', () => {
    const r = build(['--check']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  test('copies the shared block from prompt.md, and --check sees a difference', () => {
    const dir = mkdtempSync(join(tmpdir(), 'petal-skill-'));
    const prompt = join(dir, 'prompt.md');
    const skill = join(dir, 'SKILL.md');
    writeFileSync(skill, `---\nname: petal\n---\n\nbefore\n${BEGIN}\nold rules\n${END}\nafter\n`);
    writeFileSync(prompt, `You are Petal's agent.\n${BEGIN}\nnew rules\n${END}\ntail\n`);
    const paths = ['--prompt', prompt, '--skill', skill];

    expect(build(['--check', ...paths]).status).toBe(1);
    expect(build(paths).status).toBe(0);
    expect(readFileSync(skill, 'utf8')).toBe(
      `---\nname: petal\n---\n\nbefore\n${BEGIN}\nnew rules\n${END}\nafter\n`,
    );
    expect(build(['--check', ...paths]).status).toBe(0);

    writeFileSync(prompt, 'a prompt without markers\n');
    const none = build(['--check', ...paths]);
    expect(none.status).toBe(0);
    expect(none.stdout).toMatch(/has no petal:shared markers yet/);
  });
});
