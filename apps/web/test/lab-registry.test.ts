// T176: the lab can't fall behind components/. Every capitalised export is registered exactly once,
// or named on the short list with a reason, and every state renders from its fixtures.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { NOT_IN_LAB, registry } from '../lab/registry.tsx';

const app = join(import.meta.dirname, '..');
const repo = join(app, '..', '..');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(join(dir, d.name)) : [join(dir, d.name)],
  );
}

/** Capitalised runtime exports. Types and interfaces aren't components. */
export function capitalisedExports(text: string): string[] {
  const direct = [
    ...text.matchAll(
      /^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class)\s+([A-Z]\w*)/gm,
    ),
  ].map((m) => m[1] as string);
  const listed = [...text.matchAll(/^export\s*\{([^}]*)\}/gm)].flatMap((m) =>
    (m[1] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('type '))
      .map((s) => s.split(/\s+as\s+/).pop() as string)
      .filter((s) => /^[A-Z]/.test(s)),
  );
  return [...direct, ...listed];
}

const exported = files(join(app, 'components'))
  .filter((p) => /\.tsx?$/.test(p))
  .flatMap((p) =>
    capitalisedExports(readFileSync(p, 'utf8')).map((name) => ({
      name,
      file: relative(repo, p),
    })),
  );

describe('the registry', () => {
  test('reads the exports the way they are written', () => {
    const text = [
      'export function A() {}',
      'export default async function B() {}',
      'export const C = 1;',
      'export type D = string;',
      'export interface E {}',
      'export function lower() {}',
      'export { F, type G, h, I as J };',
    ].join('\n');
    expect(capitalisedExports(text)).toEqual(['A', 'B', 'C', 'F', 'J']);
  });

  test('holds every exported component exactly once', () => {
    const ids = registry.map((e) => e.id);
    const missing = exported
      .map((e) => e.name)
      .filter((name) => !ids.includes(name) && !(name in NOT_IN_LAB));
    expect(missing).toEqual([]);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  test('names nothing that is no longer exported', () => {
    const names = exported.map((e) => e.name);
    expect(registry.map((e) => e.id).filter((id) => !names.includes(id))).toEqual([]);
    expect(Object.keys(NOT_IN_LAB).filter((n) => !names.includes(n))).toEqual([]);
    for (const name of Object.keys(NOT_IN_LAB))
      expect(registry.map((e) => e.id)).not.toContain(name);
  });

  test.each(registry)('$id points at its source and its Figma node', (entry) => {
    expect(existsSync(join(repo, entry.source)), entry.source).toBe(true);
    const inFile = exported.find((e) => e.name === entry.id)?.file;
    expect(inFile).toBe(entry.source);
    if (entry.figmaNode !== null) {
      expect(entry.figmaNode).toMatch(/^\d+:\d+$/);
      expect(entry.figmaName).toMatch(/^Petals \/ /);
    } else {
      expect(entry.figmaName).toBeNull();
    }
    expect(entry.states.length).toBeGreaterThan(0);
  });

  test.each(
    registry.flatMap((entry) =>
      entry.states.map((state) => ({ id: entry.id, name: state.name, render: state.render })),
    ),
  )('$id renders: $name', ({ render }) => {
    const html = renderToStaticMarkup(createElement(Fragment, null, render()));
    expect(typeof html).toBe('string');
  });
});
