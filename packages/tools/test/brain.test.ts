// The brain's index (specs/005-mapping-brain/brain.md): made from its files, never by hand, and
// naming only tools, chapters and recipes that exist.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECIPES } from '@petal/inputs';
import { describe, expect, test } from 'vitest';
import { BRAIN_DEPARTMENTS, brainProblems, buildBrainIndex, routeBrain } from '../src/brain.ts';
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
      'from-proposal-to-action',
      'going-deeper',
      'open-calls',
      'open-source-leads',
      'over-time',
      'payouts',
      'setup',
      'stake-behind-the-network',
      'start-from-an-address',
      'value',
      'vesting',
      'voting-blocs-over-time',
      'watch-open-calls',
      'what-kind-of-thing-it-is',
      'where-power-lives',
      'who-can-move-money-or-change-rules',
      'who-gets-a-vote',
    ]);
  });

  test('every chapter and recipe is in one of the seven departments Elco named; the doctrine is in none', () => {
    const index = buildBrainIndex(BRAIN);
    expect(index.petal).toBe('brain-index/v2');
    expect([...BRAIN_DEPARTMENTS]).toEqual([
      'connecting',
      'gathering',
      'governance',
      'money',
      'investigation',
      'services',
      'stewardship',
    ]);
    const by = (d: string) =>
      index.entries.filter((e) => e.department === d && e.kind !== 'department').map((e) => e.id);
    expect(index.entries.find((e) => e.kind === 'doctrine')?.department).toBeNull();
    expect(by('connecting')).toEqual([
      'connect-claude-code',
      'connect-cloud',
      'connect-codex',
      'connect-hermes',
      'setup',
    ]);
    expect(by('gathering')).toEqual([
      'a-new-system',
      'open-calls',
      'open-source-leads',
      'start-from-an-address',
      'watch-open-calls',
      'what-kind-of-thing-it-is',
    ]);
    expect(by('governance')).toEqual([
      'from-proposal-to-action',
      'stake-behind-the-network',
      'voting-blocs-over-time',
      'where-power-lives',
      'who-can-move-money-or-change-rules',
      'who-gets-a-vote',
      'moloch-v3',
    ]);
    expect(by('money')).toEqual(['payouts', 'value', 'vesting']);
    expect(by('investigation')).toEqual(['going-deeper', 'over-time']);
    // services holds #101's slots only, as planned; nothing is in it yet
    expect(by('services')).toEqual([]);
    expect(by('stewardship')).toEqual(['contributing']);
  });

  test("each department has its hub, which routing reaches by the department's name", () => {
    const index = buildBrainIndex(BRAIN);
    const hubs = index.entries.filter((e) => e.kind === 'department');
    expect(hubs.map((e) => [e.id, e.file])).toEqual(
      BRAIN_DEPARTMENTS.map((d) => [d, `${d}/README.md`]),
    );
    // services holds #101's slots, planned: nothing is built in it yet
    expect(hubs.find((e) => e.id === 'services')?.status).toBe('partial');
    for (const d of BRAIN_DEPARTMENTS) {
      const hub = readFileSync(join(BRAIN, d, 'README.md'), 'utf8');
      // a hub names each of its chapters and recipes
      for (const e of index.entries.filter((x) => x.department === d && x.kind !== 'department'))
        expect(hub, `${d} names ${e.id}`).toContain(`\`${e.id}\``);
      expect(routeBrain(index, { words: d })[0]?.id).toBe(d);
    }
  });

  test('the routing table (routing.md) is in the index, names only files there are, and every chapter is in a row', () => {
    const index = buildBrainIndex(BRAIN);
    expect(index.tasks.length).toBe(23);
    expect(index.tasks[0]).toEqual({
      task: 'Set up Petals',
      words: ['setup', 'set up', 'sign in', 'wallet', 'credit', 'first conversation'],
      load: ['connecting', 'setup'],
      also: [],
    });
    const broken = {
      ...index,
      tasks: [
        ...index.tasks.filter((t) => ![...t.load, ...t.also].includes('vesting')),
        { task: 'Teleport', words: ['teleport'], load: ['teleporting'], also: [] },
      ],
    };
    expect(brainProblems(broken, tools, '')).toEqual([
      "routing.md: the row Teleport names teleporting, which isn't in the brain",
      // value's only rows also name vesting
      'routing.md: no row names the chapter value',
      'routing.md: no row names the chapter vesting',
    ]);
  });

  test('the checks catch what they are for', () => {
    const index = buildBrainIndex(BRAIN);
    const broken = {
      ...index,
      entries: index.entries.map((e) =>
        e.id === 'going-deeper'
          ? { ...e, tools: [...e.tools, 'teleport'], continues: ['nowhere'] }
          : e.id === 'value'
            ? { ...e, department: 'treasury' }
            : e.id === 'vesting'
              ? { ...e, department: '' }
              : e,
      ),
    };
    expect(brainProblems(broken, tools, '- see packages/tools/src/x.ts')).toEqual([
      "money/value.md: its header says treasury, and it's in another department's folder",
      'money/value.md: no department treasury (connecting, gathering, governance, money, investigation, services, stewardship)',
      'money/vesting.md: its header names no department (connecting, gathering, governance, money, investigation, services, stewardship)',
      'investigation/going-deeper.md: no tool teleport',
      'investigation/going-deeper.md: no chapter nowhere to continue to',
      'doctrine.md: it names a path, and the doctrine names none',
    ]);
  });
});
