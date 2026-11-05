// Many doors, one tool universe: every door leads to this site, and none needs a repo.
import { describe, expect, test } from 'vitest';
import { doors } from '../lib/doors.ts';

const ORIGIN = 'https://petal.example';

describe('doors', () => {
  const all = doors(ORIGIN);

  test('each one gives something to copy that points at this site', () => {
    for (const d of all) expect(d.copy, d.id).toContain(ORIGIN);
  });

  test('none needs a clone', () => {
    for (const d of all) {
      expect(`${d.how} ${d.copy}`).not.toMatch(/pnpm|git clone|npm install/);
    }
  });

  test('the first door is the one that works anywhere', () => {
    expect(all[0]?.id).toBe('prompt');
    expect(all[0]?.copy).toContain(`${ORIGIN}/skill.md`);
  });

  test('the commands are what the agents accept', () => {
    const copy = (id: string) => all.find((d) => d.id === id)?.copy;
    expect(copy('claude-code')).toBe(`claude mcp add --transport http petal ${ORIGIN}/mcp`);
    expect(copy('codex')).toBe(`codex mcp add petal --url ${ORIGIN}/mcp`);
    expect(copy('hermes')).toBe(`hermes mcp add petal --url ${ORIGIN}/mcp`);
  });
});
