// The door with nothing to install: the prompt a person copies, and the skill this site serves.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import * as hosted from '../src/hosted.ts';
import { agentPrompt, hostedSkill, originFrom } from '../src/hosted.ts';

const SKILL = readFileSync(join(import.meta.dirname, '../../../skill/petal/SKILL.md'), 'utf8');
const ORIGIN = 'https://petal.example';

describe('agentPrompt', () => {
  test('says what Petal is, where its instructions are, and what to do without a shell', () => {
    const p = agentPrompt(ORIGIN);
    expect(p).toContain(`${ORIGIN}/skill.md`);
    expect(p).toMatch(/read-only/);
    expect(p).toMatch(/no account or key/);
    expect(p).toMatch(/without asking me to choose/);
    expect(p).toMatch(/I want to watch this conversation/);
    expect(p).toMatch(/word for word/);
    expect(p.length).toBeLessThan(1200);
  });

  test('says which apps can run the tools, before anything else is tried', () => {
    const p = agentPrompt(ORIGIN);
    const apps = p.indexOf(
      'Claude Code (in a terminal, or under Code in the Claude desktop app), Codex or Hermes',
    );
    expect(apps).toBeGreaterThan(-1);
    expect(apps).toBeLessThan(p.indexOf('/skill.md'));
    expect(p).toMatch(/The Claude app's chat runs in the cloud and can't/);
    expect(p).toMatch(
      /If you can't run commands on my computer, don't try: tell me so in one line/,
    );
  });

  test('asks for a permission, rather than choices', () => {
    expect(agentPrompt(ORIGIN)).toMatch(
      /If your app needs my permission for something, ask me for it/,
    );
  });

  test("no longer sends anyone to an agent on the site: there's none for visitors", () => {
    expect(agentPrompt(ORIGIN)).not.toMatch(/Petal's own agent/);
  });
});

describe('agentPrompt on this machine', () => {
  test('says so, for a web tool that refuses a local address, and only there', () => {
    expect(agentPrompt('http://127.0.0.1:3090')).toMatch(/on this machine.*use curl/);
    expect(agentPrompt('http://localhost:3080')).toMatch(/on this machine.*use curl/);
    expect(agentPrompt(ORIGIN)).not.toMatch(/on this machine/);
  });
});

describe('terminalCommand', () => {
  test('fetches the file from this site, then starts the terminal helper for the agent', () => {
    const { terminalCommand } = hosted;
    expect(terminalCommand(ORIGIN)).toBe(
      `curl -fsSL ${ORIGIN}/petal.mjs --create-dirs -o ~/.petals/petal.mjs && node ~/.petals/petal.mjs terminal`,
    );
    expect(terminalCommand(ORIGIN, 'codex').endsWith('terminal codex')).toBe(true);
  });
});

describe('hostedSkill', () => {
  const md = hostedSkill(SKILL, ORIGIN);
  const part = (title: string) => {
    const at = md.indexOf(`## ${title}\n`);
    expect(at).toBeGreaterThan(-1);
    const next = md.indexOf('\n## ', at + 1);
    return md.slice(at, next === -1 ? undefined : next);
  };

  test('sets the agent up with the file from this site, first, with no choice to make', () => {
    const setup = part('Set yourself up first');
    expect(md.indexOf('## Set yourself up first')).toBeLessThan(md.indexOf('## Talk first'));
    expect(setup).toContain(`curl -fsSL ${ORIGIN}/petal.mjs --create-dirs -o ~/.petals/petal.mjs`);
    expect(setup).toContain('node ~/.petals/petal.mjs help');
    expect(setup).toMatch(/don't ask them to choose/);
    expect(setup).toMatch(/Node 22\.13/);
  });

  test("keeps the file as MCP tools only when asked, with each agent's own command", () => {
    const setup = part('Set yourself up first');
    expect(setup).toMatch(/If they ask to keep Petal/);
    expect(setup).toContain(
      'claude mcp add petals -- "$(command -v node)" "$HOME/.petals/petal.mjs" mcp',
    );
    expect(setup).toContain(
      'codex mcp add petals -- "$(command -v node)" "$HOME/.petals/petal.mjs" mcp',
    );
    expect(setup).toContain("printf 'Y\\n' | hermes mcp add petals");
  });

  test('one try, then the permission the app can grant, asked for, not worked around', () => {
    const setup = part('Set yourself up first');
    expect(setup).toMatch(/A permission isn't a choice: when your app needs one, ask for it/);
    expect(setup).toMatch(
      /Try that once\. If it works, go on\. If it doesn't, don't test other ways in/,
    );
    expect(setup).toMatch(/A sandbox's refusal isn't the person's no/);
    expect(setup).toContain('dangerouslyDisableSandbox');
    expect(setup).toMatch(/Codex: run it again with escalated permissions/);
    expect(setup).toContain('reaching `petal.example`');
  });

  test('the first run asking for permission is expected, and the skill says what to ask', () => {
    const setup = part('Set yourself up first');
    expect(setup).toMatch(/holds the file back the first time/);
    expect(setup).toContain('Bash(node ~/.petals/petal.mjs:*)');
    expect(setup).toMatch(/The file installs nothing and changes nothing in your app/);
    expect(agentPrompt(ORIGIN)).toMatch(
      /the first time it runs Petal's file, it may, because the file comes from this site/,
    );
  });

  test('a cloud sandbox, or an app with no shell, says so at once and names the apps that can', () => {
    const setup = part('Set yourself up first');
    expect(setup).toMatch(/cloud or remote sandbox/);
    expect(setup).toMatch(/as in the Claude app's chat: say so in one line, at once/);
    expect(setup).toMatch(
      /Claude Code \(in a terminal, or under Code in the Claude desktop app\), Codex or Hermes/,
    );
  });

  test('teaches no route that reads for them: the site no longer does', () => {
    expect(md).not.toContain('## Calling the tools over HTTP');
    expect(md).not.toMatch(
      /\/api\/v1\/(find|look-up|read-chain|read-page|web-search|snapshots|figures|render)/,
    );
    expect(md).not.toContain(`${ORIGIN}/mcp`);
    expect(md).not.toContain('localhost:8787');
    expect(md).not.toContain('petal render @spec.json --out');
    expect(md).not.toMatch(/^name: petal/m);
  });

  test('says how to let the person watch, and never mentions claiming', () => {
    const watch = part('Let them watch');
    expect(watch).toMatch(/start-exploration --client/);
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
    expect(md).toMatch(/Publishing to Petal's shared map isn't in these tools yet/);
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
