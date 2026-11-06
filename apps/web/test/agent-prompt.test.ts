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
    expect(p.length).toBeLessThan(600);
  });
});

describe('hostedSkill', () => {
  const md = hostedSkill(SKILL, ORIGIN);

  test('has this site address and needs no clone', () => {
    expect(md).toContain(`API="${ORIGIN}"`);
    expect(md).not.toContain('localhost:8787');
    expect(md).not.toContain('petal render @spec.json');
    expect(md).not.toMatch(/^name: petal/m);
  });

  test('keeps the rules every agent shares, and says how to hand over a link', () => {
    expect(md).toContain('## Talk first');
    expect(md).toContain('## Calling the tools over HTTP');
    expect(md).toContain(`Hand the person \`${ORIGIN}\` followed by that path`);
    expect(md).toContain(`${ORIGIN}/mcp`);
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
