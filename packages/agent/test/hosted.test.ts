// The door with nothing to install: the prompt a person copies, and the skill this site serves.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { hostedSkill, originFrom } from '../src/hosted.ts';

const SKILL = readFileSync(join(import.meta.dirname, '../../../skill/petal/SKILL.md'), 'utf8');
const ORIGIN = 'https://petal.example';

describe('hostedSkill', () => {
  const md = hostedSkill(SKILL, ORIGIN);
  const part = (title: string) => {
    const at = md.indexOf(`## ${title}\n`);
    expect(at).toBeGreaterThan(-1);
    const next = md.indexOf('\n## ', at + 1);
    return md.slice(at, next === -1 ? undefined : next);
  };

  test('sets the agent up with two commands from this site, first, with no choice to make', () => {
    const setup = part('Set yourself up first');
    expect(md.indexOf('## Set yourself up first')).toBeLessThan(md.indexOf('## Talk first'));
    expect(setup).toContain(`curl -fsSL ${ORIGIN}/petal.mjs --create-dirs -o ~/.petals/petal.mjs`);
    expect(setup).toContain('node ~/.petals/petal.mjs start --client');
    expect(setup).toMatch(/Don't ask them to choose anything/);
    expect(setup).toMatch(/Node 22\.13/);
  });

  test("keeps the file as MCP tools only when asked, with each agent's own command", () => {
    const setup = part('Set yourself up first');
    // the connect chapters' words (brain/connecting/connect-*.md), generated into the skill
    expect(setup).toMatch(/Only when they ask, add the file as an MCP server/);
    expect(setup).toContain(
      'claude mcp add -s user petals -- "$(command -v node)" "$HOME/.petals/petal.mjs" mcp',
    );
    expect(setup).toContain(
      'codex mcp add petals -- "$(command -v node)" "$HOME/.petals/petal.mjs" mcp',
    );
    expect(setup).toContain("printf 'Y\\n' | hermes mcp add petals");
  });

  test('the permission the app can grant, asked for, not worked around', () => {
    const setup = part('Set yourself up first');
    expect(setup).toMatch(/A permission isn't a choice: when your app needs one, ask for it/);
    expect(setup).toMatch(/run these two commands as written, and nothing else first/);
    expect(setup).toMatch(/A sandbox's refusal isn't the person's no/);
    expect(setup).toMatch(/run the same command again outside the sandbox/);
    expect(setup).toMatch(/escalated/);
    expect(setup).toContain('reaching `petal.example`');
  });

  test("fetches the file every session, and checks start's site against this one", () => {
    const setup = part('Set yourself up first');
    expect(setup).toMatch(
      /run it every session, since it takes a second and keeps the file current and from this site/,
    );
    expect(setup).toContain(`its \`site\` must be \`${ORIGIN}\``);
    expect(setup).not.toMatch(/skip it if/);
    expect(part('Let them watch')).toMatch(
      /help <command>` lists any command's flags and what it answers with/,
    );
  });

  test('says what the file is, so an agent can trust it without reading it', () => {
    const withSha = hostedSkill(SKILL, ORIGIN, 'a'.repeat(64));
    expect(withSha).toContain(`sha256 \`${'a'.repeat(64)}\``);
    expect(withSha).toMatch(/What the file is, so you needn't audit it/);
    expect(withSha).toMatch(/It has no WebAssembly and no install step/);
  });

  test('the first run asking for permission is expected, and the skill gives the question', () => {
    const setup = part('Set yourself up first');
    expect(setup).toMatch(/Claude Code holds the file back once/);
    expect(setup).toContain(
      '"May I run Petals\' tool? It\'s a file from petal.example that reads public chain data and keeps its notes in ~/.petals."',
    );
    expect(setup).toContain('Bash(node ~/.petals/petal.mjs:*)');
    expect(setup).toMatch(/The file changes nothing in your app/);
  });

  test('a cloud sandbox, or an app with no shell, says so at once and names the apps that can', () => {
    const setup = part('Set yourself up first');
    expect(setup).toMatch(/Claude Code on the web\*\* runs in a cloud sandbox/);
    // a cloud app connects to Petals' server instead, as a connector (connect-cloud)
    expect(setup).toContain(`${ORIGIN}/mcp`);
    expect(setup).toMatch(
      /in a terminal \(`claude`\), or under \*\*Code\*\* in the Claude desktop app/,
    );
  });

  test("each app's steps come from its chapter, without repeating the setup the general block has", () => {
    const setup = part('Set yourself up first');
    expect(setup).toContain('### A cloud app');
    expect(setup).not.toContain('#### Set up, every session');
    expect(setup).toContain("(the Bash tool's dangerouslyDisableSandbox)");
    expect(setup.split('--create-dirs -o ~/.petals/petal.mjs').length - 1).toBe(1);
  });

  test('teaches no route that reads for them: the site no longer does', () => {
    expect(md).not.toContain('## Calling the tools over HTTP');
    expect(md).not.toMatch(
      /\/api\/v1\/(find|look-up|read-chain|read-page|web-search|snapshots|figures|render)/,
    );
    // ${ORIGIN}/mcp is a cloud app's connector now (connect-cloud): it makes no fresh reads
    expect(md).not.toContain('localhost:8787');
    expect(md).not.toContain('petal render @spec.json --out');
    expect(md).not.toMatch(/^name: petal/m);
  });

  test('says how to let the person watch, and never mentions claiming', () => {
    const watch = part('Let them watch');
    expect(watch).toContain('node ~/.petals/petal.mjs start');
    expect(watch).toContain("node ~/.petals/petal.mjs note <<'PETALS'");
    expect(watch).toMatch(/open_url/);
    expect(watch).toMatch(/word for word/);
    expect(watch).toMatch(/render_flower` itself/);
    expect(watch).not.toMatch(/claim/i);
  });

  test('keeps the rules every agent shares, the commands, and how to hand over a link', () => {
    expect(md).toContain('## Talk first');
    expect(part('Calling the tools as commands')).toContain('`render @spec.json`');
    expect(md).toMatch(/Hand the person `short_url`/);
    expect(md).not.toContain('## Publishing');
    expect(md).toMatch(/Publishing to Petals' shared map isn't in these tools yet/);
  });

  test('fails loudly if the skill is reorganised, rather than serving local instructions', () => {
    expect(() => hostedSkill('# no sections here', ORIGIN)).toThrow(/no section/);
  });
});

describe('originFrom', () => {
  test('uses what the visitor reached, also behind a tunnel', () => {
    expect(originFrom(new Headers({ host: 'localhost:3080' }))).toBe('http://localhost:3080');
    expect(originFrom(new Headers({ host: '127.0.0.1:3080' }))).toBe('http://127.0.0.1:3080');
    expect(
      originFrom(
        new Headers({ host: 'x', 'x-forwarded-host': 'a.dev', 'x-forwarded-proto': 'https' }),
      ),
    ).toBe('https://a.dev');
    expect(originFrom(new Headers())).toBe('http://localhost:3080');
  });
});

describe('the brain version at every door', () => {
  test('/skill.md names the brain version it was served with, and where to start reading', () => {
    const skill = readFileSync(
      join(import.meta.dirname, '..', '..', '..', 'skill', 'petal', 'SKILL.md'),
      'utf8',
    );
    const md = hostedSkill(
      skill,
      'https://petals.example',
      undefined,
      '0123456789abcdef@abcdef012345',
    );
    expect(md).toContain("Petals' brain here is version `0123456789abcdef@abcdef012345`");
    expect(md).toContain('https://petals.example/api/v1/brain/context?q=');
    expect(hostedSkill(skill, 'https://petals.example')).not.toContain("Petals' brain here");
  });
});
