// A version adds and never changes: its tokens are scoped to its own attribute, its paints hold the
// contrast gate, and an alternative is one small file that writes only what it changes.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { behaviours, parentOf, parents } from '../behaviours.ts';
import { emitVersions, loadVersions, VERSIONS_OUTPUT, versionContrastFailures } from '../emit.ts';
import { surfaces } from '../source.ts';
import v2 from '../versions/v2.ts';
import {
  emitVersion,
  flatten,
  inherit,
  rootSelector,
  springEasing,
  stackContrast,
} from '../versions/version.ts';

const repo = join(import.meta.dirname, '..', '..', '..');

const declarationsOutsideTheRoot = (css: string) =>
  [...css.matchAll(/(^|\n)([^\s@/}][^{}]*)\{/g)]
    .flatMap((m) => (m[2] ?? '').split(','))
    .map((selector) => selector.trim())
    .filter((selector) => !selector.startsWith(':root[data-version="2"]'));

describe('v2 tokens', () => {
  test('the committed file is what the versions emit', async () => {
    expect(readFileSync(VERSIONS_OUTPUT, 'utf8')).toBe(emitVersions(await loadVersions()));
  });

  test('every selector is under the version, so without it nothing applies', () => {
    expect(declarationsOutsideTheRoot(emitVersion(v2))).toEqual([]);
  });

  test('it adds names, and redefines no v1 token', () => {
    const declared = [...emitVersion(v2).matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(50);
    for (const name of declared) expect(name).toMatch(/^--joy-/);
  });

  test('every token group the brief asks for exists', () => {
    for (const group of ['radius', 'shadow', 'gradient', 'glass', 'texture', 'dur', 'ease']) {
      expect(Object.keys(v2.groups), group).toContain(group);
    }
  });

  test('reduced motion takes every duration to nothing', () => {
    const css = emitVersion(v2);
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    for (const name of Object.keys(v2.groups.dur ?? {})) {
      expect(reduced).toContain(`--joy-dur-${name}: 0s;`);
    }
    for (const name of ['lift', 'rise', 'tilt', 'stagger']) {
      expect(reduced).toMatch(new RegExp(`--joy-move-${name}: 0`));
    }
  });

  test('every token is emitted for ground, and a flipping one for every surface', () => {
    for (const values of Object.values(v2.groups)) {
      for (const value of Object.values(values)) {
        if (typeof value !== 'string') {
          expect(Object.keys(value).sort()).toEqual(Object.keys(surfaces).sort());
        }
      }
    }
  });

  test('the spring is a valid linear() that overshoots and lands', () => {
    const points = springEasing().slice('linear('.length, -1).split(', ').map(Number);
    expect(points[0]).toBe(0);
    expect(points.at(-1)).toBe(1);
    expect(Math.max(...points)).toBeGreaterThan(1);
    expect(Math.max(...points)).toBeLessThan(1.2);
  });
});

describe('the contrast gate on v2', () => {
  test('every case holds', () => {
    expect(versionContrastFailures([v2])).toEqual([]);
    expect(v2.contrast.length).toBeGreaterThan(10);
  });

  test('it composites everything behind the text, so a weak paint is caught', () => {
    const weak = inherit(v2, 'weak', {});
    const failing = {
      ...weak,
      contrast: [
        { name: 'too much glow', text: 'Mint', over: ['Ink', { of: 'Mint', alpha: 0.6 }] },
      ],
    } as typeof v2;
    expect(versionContrastFailures([failing])).toMatchObject([{ name: 'too much glow' }]);
  });

  test('known values', () => {
    expect(stackContrast({ name: '', text: 'Ink', over: ['Ground'] })).toBeCloseTo(17.93, 1);
    expect(flatten(['Ground', { of: 'Ink', alpha: 1 }])).toEqual([23, 23, 23]);
  });
});

describe('an alternative', () => {
  const alt = inherit(v2, 'a', {
    groups: { radius: { sm: '4px' } },
    script: { magnet: 0 },
  });

  test('sits over its parent, and v2 stylesheet still applies because data-version is still 2', () => {
    expect(rootSelector(alt)).toBe(':root[data-version="2"][data-alt="a"]');
    expect(alt.id).toBe('2');
    expect(alt.inherits).toBe('v2');
  });

  test('writes only what it changes', () => {
    const css = emitVersion(alt);
    expect(css).toContain('--joy-radius-sm: 4px;');
    expect(css).not.toContain('--joy-radius-md');
    expect(alt.script.magnet).toBe(0);
    expect(alt.script.follow).toBe(v2.script.follow);
  });
});

describe('v1 is untouched', () => {
  const atTag = (path: string) => {
    try {
      return execFileSync('git', ['show', `system-v1:${path}`], { cwd: repo, encoding: 'utf8' });
    } catch {
      return null;
    }
  };

  test.each([
    'packages/tokens/source.ts',
    'apps/web/app/tokens.generated.css',
    'apps/web/app/globals.css',
  ])('%s has no diff against the tag', (path) => {
    const before = atTag(path);
    if (before === null) return; // No tag here: a shallow checkout, or a deployed copy.
    expect(readFileSync(join(repo, path), 'utf8')).toBe(before);
  });
});

describe('the table', () => {
  test('every child names a parent and says what it is for', () => {
    const names = behaviours.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
    for (const { name, purpose } of behaviours) {
      expect(Object.keys(parents)).toContain(parentOf(name));
      expect(purpose.length).toBeGreaterThan(8);
    }
  });

  test('every parent has at least one child', () => {
    for (const parent of Object.keys(parents)) {
      expect(
        behaviours.some((b) => parentOf(b.name) === parent),
        parent,
      ).toBe(true);
    }
  });
});
