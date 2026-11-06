// The door with nothing to install: the prompt a person copies, and the skill this site serves.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { agentPrompt, hostedSkill, originFrom } from '../lib/agent-prompt.ts';

const SKILL = readFileSync(join(import.meta.dirname, '../../../skill/petal/SKILL.md'), 'utf8');
const ORIGIN = 'https://petal.example';

describe('agentPrompt', () => {
  test('says what Petal is, where its instructions are, and what to do without web access', () => {
    const p = agentPrompt(ORIGIN);
    expect(p).toContain(`${ORIGIN}/skill.md`);
    expect(p).toMatch(/read-only/);
    expect(p).toMatch(/no account or key/);
    expect(p).toMatch(/If you can't open that link/);
    expect(p).toMatch(/without asking me to choose/);
    expect(p).toMatch(/I want to watch this conversation/);
    expect(p).toMatch(/word for word/);
    expect(p.length).toBeLessThan(800);
  });
});

describe('agentPrompt on this machine', () => {
  test('says so, for a web tool that refuses a local address, and only there', () => {
    expect(agentPrompt('http://127.0.0.1:3090')).toMatch(/on this machine.*use curl/);
    expect(agentPrompt('http://localhost:3080')).toMatch(/on this machine.*use curl/);
    expect(agentPrompt(ORIGIN)).not.toMatch(/on this machine/);
  });
});

describe('hostedSkill', () => {
  const md = hostedSkill(SKILL, ORIGIN);

  test('says how to let the person watch, on either door, and never mentions claiming', () => {
    const at = md.indexOf('## Let them watch');
    expect(at).toBeGreaterThan(-1);
    const watch = md.slice(at, md.indexOf('\n## ', at + 1));
    expect(watch).toContain(`POST ${ORIGIN}/api/v1/explorations/<token>/notes`);
    expect(watch).toMatch(/open_url/);
    expect(watch).toMatch(/word for word/);
    expect(watch).not.toMatch(/claim/i);
  });

  test('has this site address and needs no clone', () => {
    expect(md).toContain(`API="${ORIGIN}"`);
    expect(md).not.toContain('localhost:8787');
    expect(md).not.toContain('petal render @spec.json');
    expect(md).not.toMatch(/^name: petal/m);
  });

  test('keeps the rules every agent shares, and says how to hand over a link', () => {
    expect(md).toContain('## Talk first');
    expect(md).toContain('## Calling the tools over HTTP');
    expect(md).toContain(`put \`${ORIGIN}\` in front of it`);
    expect(md).toContain(`${ORIGIN}/mcp`);
  });

  test('tells an agent how to set itself up, first, with nothing to install', () => {
    expect(md.indexOf('## Set yourself up first')).toBeLessThan(md.indexOf('## Quick Start'));
    expect(md).toMatch(/don't ask them to choose/);
    expect(md).toContain(`claude mcp add --transport http petal ${ORIGIN}/mcp`);
    expect(md).toContain(`codex mcp add petal --url ${ORIGIN}/mcp`);
  });

  test('prefers the link that fits on a line', () => {
    expect(md).toMatch(/Hand the person `short_url`/);
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
