// Every Ethereum and Solana module through the same path a render takes: the registry, getSnapshot
// from the fixtures with no fetch, the default spec and a variation, the legend and the SVG.
import { buildSpec, renderFlower, validateSpec } from '@petal/core';
import type { ProposeChoices } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { fileStore, getSnapshot, modules } from '../src/index.ts';
import { rowFor, storedSnapshot } from './helpers/recordings.ts';
import { FIXTURES, tmp } from './helpers/snapshots.ts';
import { BANK, DPX, ENS, MELANIA, MOLOCH, SEAM, TRUMP } from './helpers/targets.ts';

const TARGETS: [string, Record<string, string>][] = [
  ['moloch-v1', MOLOCH.params],
  ['solana-spl-holders', TRUMP],
  ['solana-spl-holders', MELANIA],
  ['erc20-votes', ENS],
  ['erc20-holders', BANK],
  ['erc20-holders', DPX],
  ['erc20-holders', SEAM],
];

describe.each(TARGETS)('%s %j', (network, params) => {
  const mod = modules[network];
  if (!mod) throw new Error(`${network} is not in the registry`);

  test('the same parameters reuse the fixture, without fetching', async () => {
    const store = fileStore({ fixtures: FIXTURES, cache: tmp('draw') });
    const reader = { ...mod, fetch: () => Promise.reject(new Error('fetched')) };
    const r = await getSnapshot({ network, params }, { store, modules: { [network]: reader } });
    expect(r).toMatchObject({ reused: true, where: 'fixture' });
    expect(r.sha256).toBe(rowFor(network, params).sha256);
  });

  test('it draws, by default and with other choices', () => {
    const row = rowFor(network, params);
    const s = storedSnapshot(row);
    const sources = new Set(s.sources.map((x) => x.id));
    for (const d of mod.descriptor.sources) expect(sources).toContain(d.id);
    for (const m of Object.values(mod.descriptor.capabilities.meanings))
      for (const id of m.sources) expect(sources).toContain(id);
    const variations: ProposeChoices[] = [
      {},
      { width: 'equal', height: 'log', colour: 'single', outline: 'none' },
      { height: 'linear', colour: 'identity' },
    ];
    for (const choices of variations) {
      const { spec } = buildSpec(
        { network, sha256: row.sha256, params, choices },
        mod.descriptor,
        s,
      );
      const check = validateSpec(spec, { snapshot: s, capabilities: mod.descriptor.capabilities });
      expect(check.errors).toEqual([]);
      const drawn = renderFlower(spec, s);
      expect(drawn.svg.startsWith('<svg')).toBe(true);
      expect(drawn.legend.length).toBeGreaterThan(0);
      for (const item of drawn.legend) expect(item.meaning.length).toBeGreaterThan(0);
    }
  });
});

test('Beanstalk stays one stored data set, with no parameters', () => {
  expect(modules.beanstalk?.descriptor).toMatchObject({ live: false, params: {} });
});
