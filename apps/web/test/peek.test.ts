// row.peek. Elco, 13 Nov: opening a new question "closes the open one first" (otherwise it's "jarring"), and
// "drop the automation and keep it to clicks, which is simpler": a click opens and folds, one at a time.
import { describe, expect, test } from 'vitest';
import { peekRows } from '../app/versions/peek.ts';

function rows(names: string[]) {
  const open = new Map<string, boolean>();
  const log: string[] = [];
  const peek = peekRows<string>({
    isOpen: (row) => open.get(row) ?? false,
    setOpen(row, value) {
      open.set(row, value);
      log.push(`${value ? 'open' : 'close'} ${row}`);
    },
    rows: () => names,
  });
  return { peek, open: (row: string) => open.get(row) ?? false, log };
}

describe('a click, a tap or Enter', () => {
  test('opens a folded row', () => {
    const r = rows(['a', 'b']);
    r.peek.press('a');
    expect(r.open('a')).toBe(true);
    expect(r.log).toEqual(['open a']);
  });

  test('on another row folds the open one first, so one is open at a time', () => {
    const r = rows(['a', 'b', 'c']);
    r.peek.press('a');
    r.peek.press('c');
    expect([r.open('a'), r.open('b'), r.open('c')]).toEqual([false, false, true]);
    expect(r.log).toEqual(['open a', 'close a', 'open c']);
  });

  test('on the open row folds it', () => {
    const r = rows(['a', 'b']);
    r.peek.press('b');
    r.peek.press('b');
    expect(r.open('b')).toBe(false);
    expect(r.log).toEqual(['open b', 'close b']);
  });
});
