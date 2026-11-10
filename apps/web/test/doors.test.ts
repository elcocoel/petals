// Many doors, one tool universe: every door leads to this site, and none needs a repo. One way to connect
// (Elco's fix 1, 10 Nov): the first door is the menu's one prompt, and the rest say what the chapters say.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { connectPage, doors } from '../lib/doors.ts';

const ORIGIN = 'https://petal.example';

describe('doors', () => {
  const all = doors(ORIGIN);

  test('each one that gives something to copy points it at this site', () => {
    for (const d of all.filter((x) => x.copy)) expect(d.copy, d.id).toContain(ORIGIN);
  });

  test('the cloud apps connect as a connector at this site’s /mcp, and name the app for new readings', () => {
    // the address is connect-cloud's, generated from the brain (scripts/brain-connect.ts)
    for (const id of ['claude-app', 'chatgpt']) {
      const d = all.find((x) => x.id === id);
      expect(d?.copy, id).toBe(`${ORIGIN}/mcp`);
      expect(d?.how, id).toMatch(/It reads and draws what Petals already holds/);
    }
    expect(all.find((x) => x.id === 'claude-app')?.how).toMatch(/use Claude Code/);
    expect(all.find((x) => x.id === 'chatgpt')?.how).toMatch(/use Codex/);
    // any app that takes an MCP server's address (connect-cloud), with the same address
    const other = all.find((x) => x.id === 'anything-else');
    expect(other?.copy).toBe(`${ORIGIN}/mcp`);
    expect(other?.how).toMatch(/such as Cursor/);
  });

  test('the first run asks once, and keeping Petals says what it changes', () => {
    expect(all[0]?.how).toMatch(
      /The first time, an agent on your computer asks you once to let Petals’ tools run/,
    );
    for (const id of ['claude-code', 'codex', 'hermes']) {
      expect(all.find((x) => x.id === id)?.how, id).toMatch(/for next time.*It adds Petals to/);
    }
  });

  test('the prompt goes to any agent, on this computer or in the cloud, and joins the account', () => {
    const how = all[0]?.how ?? '';
    expect(how).toMatch(/Claude Code, Codex, Hermes, the Claude app or ChatGPT/);
    expect(how).toMatch(/shows under Your agents and takes your jobs/);
  });

  test('the page never says every agent runs on your computer', () => {
    expect(connectPage.lead).not.toMatch(/runs them on your computer/);
    expect(connectPage.lead).toMatch(
      /The Claude app and ChatGPT reach Petals through its connector/,
    );
  });

  test("each other door is its connect chapter's words, the one source", () => {
    const dir = join(import.meta.dirname, '..', '..', '..', 'brain', 'chapters');
    const chapters = readdirSync(dir)
      .filter((f) => f.startsWith('connect-'))
      .map((f) => readFileSync(join(dir, f), 'utf8').replaceAll('{site}', ORIGIN))
      .join('\n');
    for (const d of all.slice(1)) expect(chapters, d.id).toContain(`- **${d.title}:** ${d.how}`);
  });

  test('none needs a clone', () => {
    for (const d of all) {
      expect(`${d.how} ${d.copy ?? ''}`).not.toMatch(/pnpm|git clone|npm install/);
    }
  });

  test('the first door is the one prompt, which the page copies with a fresh agent key', () => {
    expect(all[0]?.id).toBe('prompt');
    expect(all[0]?.agentKey).toBe(true);
    expect(all[0]?.copy).toBeUndefined();
  });

  test("the commands fetch the file from this site and add it as the agent's own tools", () => {
    const copy = (id: string) => all.find((d) => d.id === id)?.copy;
    const get = `curl -fsSL ${ORIGIN}/petal.mjs --create-dirs -o ~/.petals/petal.mjs && `;
    const run = '"$(command -v node)" "$HOME/.petals/petal.mjs" mcp';
    // as connect-claude-code says it: for every folder
    expect(copy('claude-code')).toBe(`${get}claude mcp add -s user petals -- ${run}`);
    expect(copy('codex')).toBe(`${get}codex mcp add petals -- ${run}`);
    expect(copy('hermes')).toBe(
      `${get}printf 'Y\\n' | hermes mcp add petals --command "$(command -v node)" --args "$HOME/.petals/petal.mjs" mcp`,
    );
  });
});
