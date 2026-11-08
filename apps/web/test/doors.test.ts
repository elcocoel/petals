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

  test("the commands fetch the file from this site and add it as the agent's own tools", () => {
    const copy = (id: string) => all.find((d) => d.id === id)?.copy;
    const get = `mkdir -p ~/.petals && curl -fsSL ${ORIGIN}/petal.mjs -o ~/.petals/petal.mjs && `;
    const run = '"$(command -v node)" "$HOME/.petals/petal.mjs" mcp';
    expect(copy('claude-code')).toBe(`${get}claude mcp add petals -- ${run}`);
    expect(copy('codex')).toBe(`${get}codex mcp add petals -- ${run}`);
    expect(copy('hermes')).toBe(
      `${get}printf 'Y\\n' | hermes mcp add petals --command "$(command -v node)" --args "$HOME/.petals/petal.mjs" mcp`,
    );
  });
});
