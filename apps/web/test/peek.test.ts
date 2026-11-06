// row.peek on a fake clock. Elco: "They need to come collapsed, not all open, and they could open on hover.
// And if you hover off, they stay open for a bit and then they close softly, so that if a user slides
// through, it doesn't just jump a bunch of shit around."
import { v2 } from '@petal/tokens';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { peekRows } from '../app/versions/peek.ts';

const { restMs, stayMs } = v2.script.peek;

function rows() {
  const open = new Map<string, boolean>();
  const log: string[] = [];
  const peek = peekRows<string>({
    isOpen: (row) => open.get(row) ?? false,
    setOpen(row, value) {
      open.set(row, value);
      log.push(`${value ? 'open' : 'close'} ${row}`);
    },
  });
  return { peek, open: (row: string) => open.get(row) ?? false, log };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a pointer', () => {
  test('sliding through opens nothing', () => {
    const { peek, log } = rows();
    for (const row of ['a', 'b', 'c', 'd', 'e', 'f']) {
      peek.enter(row);
      vi.advanceTimersByTime(restMs / 4);
      peek.leave(row);
    }
    vi.advanceTimersByTime(stayMs * 3);
    expect(log).toEqual([]);
  });

  test('sliding through slowly opens nothing either, until it really stops', () => {
    const { peek, open } = rows();
    peek.enter('a');
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(restMs - 1);
      peek.moved('a');
    }
    expect(open('a')).toBe(false);
    vi.advanceTimersByTime(restMs);
    expect(open('a')).toBe(true);
  });

  test('moving on a row that is already open changes nothing', () => {
    const { peek, log } = rows();
    peek.enter('a');
    vi.advanceTimersByTime(restMs);
    peek.moved('a');
    vi.advanceTimersByTime(restMs * 3);
    expect(log).toEqual(['open a']);
  });

  test('at rest opens one, once it has rested', () => {
    const { peek, open } = rows();
    peek.enter('a');
    vi.advanceTimersByTime(restMs - 1);
    expect(open('a')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(open('a')).toBe(true);
  });

  test('leaving, it stays open a while, then closes', () => {
    const { peek, open } = rows();
    peek.enter('a');
    vi.advanceTimersByTime(restMs);
    peek.leave('a');
    vi.advanceTimersByTime(stayMs - 1);
    expect(open('a')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(open('a')).toBe(false);
  });

  test('coming back in time keeps it open', () => {
    const { peek, open } = rows();
    peek.enter('a');
    vi.advanceTimersByTime(restMs);
    peek.leave('a');
    vi.advanceTimersByTime(stayMs / 2);
    peek.enter('a');
    vi.advanceTimersByTime(stayMs * 3);
    expect(open('a')).toBe(true);
  });

  test('moving to another starts the same clock on the one it left', () => {
    const { peek, log } = rows();
    peek.enter('a');
    vi.advanceTimersByTime(restMs);
    peek.leave('a');
    peek.enter('b');
    vi.advanceTimersByTime(stayMs);
    expect(log).toEqual(['open a', 'open b', 'close a']);
  });
});

describe('a click, a tap or Enter', () => {
  test('opens a folded row and pins it, whatever the pointer does', () => {
    const { peek, open } = rows();
    peek.press('a');
    expect(open('a')).toBe(true);
    peek.leave('a');
    vi.advanceTimersByTime(stayMs * 3);
    expect(open('a')).toBe(true);
  });

  test("pins one the pointer opened, rather than taking it away from under the person's hand", () => {
    const { peek, open } = rows();
    peek.enter('a');
    vi.advanceTimersByTime(restMs);
    peek.press('a');
    expect(open('a')).toBe(true);
    peek.leave('a');
    vi.advanceTimersByTime(stayMs * 3);
    expect(open('a')).toBe(true);
  });

  test('folds a pinned one, which stays shut until the pointer has left', () => {
    const { peek, open } = rows();
    peek.enter('a');
    peek.press('a');
    peek.press('a');
    expect(open('a')).toBe(false);
    peek.enter('a');
    vi.advanceTimersByTime(restMs * 3);
    expect(open('a')).toBe(false);
    peek.leave('a');
    peek.enter('a');
    vi.advanceTimersByTime(restMs);
    expect(open('a')).toBe(true);
  });

  test('a click before the rest is up leaves no timer to undo it', () => {
    const { peek, log } = rows();
    peek.enter('a');
    vi.advanceTimersByTime(restMs / 2);
    peek.press('a');
    vi.advanceTimersByTime(restMs * 3);
    expect(log).toEqual(['open a']);
  });

  test('a touch has no pointer to rest: a tap opens and the next one folds', () => {
    const { peek, open } = rows();
    peek.press('a');
    expect(open('a')).toBe(true);
    peek.press('a');
    expect(open('a')).toBe(false);
    peek.press('a');
    expect(open('a')).toBe(true);
  });
});

test('stopping leaves nothing running', () => {
  const { peek, log } = rows();
  peek.enter('a');
  peek.stop();
  vi.advanceTimersByTime(stayMs * 3);
  expect(log).toEqual([]);
});
