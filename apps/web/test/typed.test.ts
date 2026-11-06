// field.type on a fake clock: the lines type in and out in the copy doc's order, loop, and stop whole.
import { v2 } from '@petal/tokens';
import { describe, expect, test } from 'vitest';
import { typeLines } from '../app/versions/typed.ts';

const { typeMs, eraseMs, holdMs, gapMs } = v2.script.typed;

function run(lines: readonly string[]) {
  const shown: string[] = [];
  const waits: number[] = [];
  let next: (() => void) | null = null;
  const typing = typeLines(
    lines,
    (text) => shown.push(text),
    (ms, then) => {
      waits.push(ms);
      next = then;
    },
  );
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      const go = next;
      next = null;
      go?.();
    }
  };
  return { shown, waits, step, typing, pending: () => next !== null };
}

describe('field.type', () => {
  test('it starts by holding the line the page already shows, and writes nothing', () => {
    const { shown, waits } = run(['ab', 'cd']);
    expect(shown).toEqual([]);
    expect(waits).toEqual([holdMs]);
  });

  test('it deletes a line, types the next, holds it, and loops back to the first', () => {
    const { shown, waits, step } = run(['ab', 'cd']);
    step(10);
    expect(shown).toEqual(['a', '', 'c', 'cd', 'c', '', 'a', 'ab', 'a', '']);
    expect(waits.slice(0, 6)).toEqual([holdMs, eraseMs, gapMs, typeMs, holdMs, eraseMs]);
  });

  test('stopping ends on the whole line, even mid-word, and nothing more happens', () => {
    const { shown, step, typing } = run(['abc', 'def']);
    step(2);
    expect(shown.at(-1)).toBe('a');
    typing.stop();
    expect(shown.at(-1)).toBe('abc');
    const after = shown.length;
    step(5);
    expect(shown.length).toBe(after);
  });
});
