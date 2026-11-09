// The brain's index (specs/005-mapping-brain/brain.md): made from its files, never by hand, and
// naming only tools, chapters and recipes that exist.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECIPES } from '@petal/inputs';
import { describe, expect, test } from 'vitest';
import { brainProblems, buildBrainIndex } from '../src/brain.ts';
import { registry } from '../src/registry.ts';

const BRAIN = fileURLToPath(new URL('../../../brain/', import.meta.url));
const tools = registry.map((t) => t.name);

describe('the brain', () => {
  test('its index is what its files make (run node scripts/brain-index.ts when it is not)', () => {
    const committed = JSON.parse(readFileSync(join(BRAIN, 'index.json'), 'utf8'));
    expect(committed).toEqual(buildBrainIndex(BRAIN));
  });

  test('it names only tools, chapters and recipes that exist, and the doctrine names no path', () => {
    const index = buildBrainIndex(BRAIN);
    expect(brainProblems(index, tools, readFileSync(join(BRAIN, 'doctrine.md'), 'utf8'))).toEqual(
      [],
    );
    const recipes = index.entries.filter((e) => e.kind === 'recipe').map((e) => e.id);
    expect(recipes).toEqual(RECIPES.map((r) => r.id).sort());
    expect(index.entries.filter((e) => e.kind === 'chapter').map((e) => e.id)).toEqual([
      'a-new-system',
      'connect-claude-code',
      'connect-cloud',
      'connect-codex',
      'connect-hermes',
      'contributing',
      'going-deeper',
      'open-source-leads',
      'over-time',
      'start-from-an-address',
      'where-power-lives',
    ]);
  });

  test('the checks catch what they are for', () => {
    const index = buildBrainIndex(BRAIN);
    const broken = {
      ...index,
      entries: index.entries.map((e) =>
        e.id === 'going-deeper'
          ? { ...e, tools: [...e.tools, 'teleport'], continues: ['nowhere'] }
          : e,
      ),
    };
    expect(brainProblems(broken, tools, '- see packages/tools/src/x.ts')).toEqual([
      'chapters/going-deeper.md: no tool teleport',
      'chapters/going-deeper.md: no chapter nowhere to continue to',
      'doctrine.md: it names a path, and the doctrine names none',
    ]);
  });
});
