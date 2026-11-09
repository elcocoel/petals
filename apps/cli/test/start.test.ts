// The whole start in one call, and a note from a heredoc (Elco, 9 Nov: setup took three minutes).
// The browser opener is off in every test.
import type { Tool, ToolContext } from '@petal/tools';
import { describe, expect, test } from 'vitest';
import { main } from '../src/main.ts';

interface Call {
  name: string;
  input: Record<string, unknown>;
}

function registry(calls: Call[]): Tool<unknown, unknown>[] {
  const tool = (name: string, out: (i: Record<string, unknown>) => unknown) =>
    ({
      name,
      input: { type: 'object', properties: {} },
      output: { type: 'object' },
      run: async (input: Record<string, unknown>) => {
        calls.push({ name, input });
        return out(input);
      },
    }) as unknown as Tool<unknown, unknown>;
  return [
    tool('start_exploration', () => ({
      exploration: 'exp_1',
      link: { url: 'https://petals.example/s/token' },
      open_url: 'https://petals.example/make?elsewhere=token',
    })),
    tool('add_note', (i) => ({ note: { seq: 0, text: i.text } })),
  ];
}

async function run(argv: string[], stdin = '') {
  const calls: Call[] = [];
  let stdout = '';
  const code = await main(argv, {
    registry: registry(calls),
    createContext: (cfg) => ({ config: cfg }) as unknown as ToolContext,
    serveStdio: async () => {},
    env: { PETALS_NO_OPEN: '1' },
    cwd: '/work',
    root: '/repo',
    stdout: (t) => {
      stdout += t;
    },
    stderr: () => {},
    readStdin: async () => stdin,
  });
  return { code, calls, out: JSON.parse(stdout || 'null') as Record<string, unknown> };
}

describe('start', () => {
  test('starts the page, with the client and the question, and says what next', async () => {
    const r = await run(['start', '--client', 'Claude Code', '--question', 'Who holds NEAR?']);
    expect(r.code).toBe(0);
    expect(r.calls).toEqual([
      { name: 'start_exploration', input: { question: 'Who holds NEAR?', client: 'Claude Code' } },
    ]);
    expect(r.out.open_url).toBe('https://petals.example/make?elsewhere=token');
    expect(r.out.exploration).toBe('https://petals.example/s/token');
    expect(r.out.opened).toBe(false);
    expect(r.out.next).toMatch(/note/);
  });

  test('with no question, the plain one; with --note, the opening goes up in the same call', async () => {
    const r = await run(['start', '--client', 'Codex', '--note', 'Hello from Codex']);
    expect(r.calls.map((c) => c.name)).toEqual(['start_exploration', 'add_note']);
    expect(r.calls[0]?.input.question).toBe('A conversation about who holds power');
    expect(r.calls[1]?.input).toEqual({ text: 'Hello from Codex' });
  });
});

describe('note', () => {
  test('takes its text from a heredoc, so nothing needs escaping', async () => {
    const text = 'Who\'s behind "pool-1"?\n\nThree pools hold a third.';
    const r = await run(['note'], `${text}\n`);
    expect(r.code).toBe(0);
    expect(r.calls).toEqual([{ name: 'add_note', input: { text } }]);
  });

  test('or from words, and an empty one is refused', async () => {
    expect((await run(['note', 'short', 'reply'])).calls[0]?.input).toEqual({
      text: 'short reply',
    });
    expect((await run(['note'])).code).toBe(2);
  });
});
