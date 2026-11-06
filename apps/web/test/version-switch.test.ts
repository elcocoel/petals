// The inline script: ?v= and ?off= set the attributes before the first paint and are remembered for the
// session, the key `v` flips, and typing a v in a field doesn't.
import { describe, expect, test } from 'vitest';
import { SWITCH_SCRIPT } from '../app/versions/switch.ts';

interface Page {
  html: { dataset: Record<string, string | undefined>; style: { visibility: string } };
  storage: Map<string, string>;
  press: (key: string, target?: unknown, extra?: object) => void;
}

function run(search: string, storage = new Map<string, string>()): Page {
  const html = {
    dataset: { version: '2' } as Record<string, string | undefined>,
    style: { visibility: '' },
  };
  let handler: ((e: unknown) => void) | null = null;
  const fn = new Function(
    'document',
    'location',
    'sessionStorage',
    'addEventListener',
    'setTimeout',
    SWITCH_SCRIPT,
  );
  fn(
    { documentElement: html },
    { search },
    {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
    },
    (_: string, h: (e: unknown) => void) => {
      handler = h;
    },
    () => 0,
  );
  return {
    html,
    storage,
    press: (key, target = {}, extra = {}) => handler?.({ key, target, ...extra }),
  };
}

describe('the switch', () => {
  test('the default on this branch stands', () => {
    expect(run('').html.dataset.version).toBe('2');
  });

  test('?v=1 sets the attribute and asks for no joy', () => {
    const { html } = run('?v=1');
    expect(html.dataset.version).toBe('1');
    expect(html.dataset.joy).toBeUndefined();
  });

  test('the choice is remembered for the session', () => {
    const storage = new Map<string, string>();
    run('?v=1', storage);
    expect(run('', storage).html.dataset.version).toBe('1');
    expect(run('?v=2', storage).html.dataset.version).toBe('2');
    expect(run('', storage).html.dataset.version).toBe('2');
  });

  test('the key v flips, there and back', () => {
    const page = run('');
    page.press('v');
    expect(page.html.dataset.version).toBe('1');
    page.press('v');
    expect(page.html.dataset.version).toBe('2');
    expect(page.storage.get('petals.v')).toBe('2');
  });

  test('typing or a shortcut does not flip', () => {
    const page = run('');
    page.press('v', { closest: () => ({}) });
    page.press('v', {}, { metaKey: true });
    page.press('x');
    expect(page.html.dataset.version).toBe('2');
  });

  test('an alternative is a letter on its version', () => {
    const page = run('?v=2a');
    expect(page.html.dataset.version).toBe('2');
    expect(page.html.dataset.alt).toBe('a');
    page.press('v');
    expect(page.html.dataset.alt).toBeUndefined();
    page.press('v');
    expect(page.html.dataset.alt).toBe('a');
  });

  test('?off= is passed on and remembered, and hides the page until it has been stripped', () => {
    const storage = new Map<string, string>();
    const { html } = run('?off=field,box', storage);
    expect(html.dataset.off).toBe('field,box');
    expect(html.style.visibility).toBe('hidden');
    expect(run('', storage).html.dataset.off).toBe('field,box');
    expect(run('?off=', storage).html.dataset.off).toBeUndefined();
  });

  test('nothing hides at version 1', () => {
    const { html } = run('?v=1&off=box');
    expect(html.style.visibility).toBe('');
  });
});
