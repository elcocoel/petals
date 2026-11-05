// Every Ethereum and Solana module through the same path a render takes: the registry, getSnapshot
// from the fixtures with no fetch, the default spec and a variation, the legend and the SVG.
import { buildSpec, renderFlower, validateSpec } from '@petal/core';
import type { ProposeChoices } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { fileStore, getSnapshot, modules } from '../src/index.ts';
import { indexRows, storedSnapshot } from './helpers/recordings.ts';
import { FIXTURES, tmp } from './helpers/snapshots.ts';

const NETWORKS = [
  'moloch-v1',
  'solana-spl-trump',
  'solana-spl-melania',
  'beanstalk',
  'ens-delegates',
  'erc20-holders-ethereum-bank',
  'erc20-holders-arbitrum-dpx',
] as const;

describe.each(NETWORKS)('%s', (network) => {
  const mod = modules[network];
  if (!mod) throw new Error(`${network} is not in the registry`);

  test('getSnapshot reuses the fixture without fetching', async () => {
    const store = fileStore({ fixtures: FIXTURES, cache: tmp('draw') });
    const reader = { ...mod, fetch: () => Promise.reject(new Error('fetched')) };
    const r = await getSnapshot({ network }, { store, modules: { [network]: reader } });
    expect(r).toMatchObject({ reused: true, where: 'fixture' });
    expect(r.sources.length).toBeGreaterThan(0);
  });

  test('every stored snapshot draws, by default and with other choices', () => {
    for (const row of indexRows(network)) {
      const s = storedSnapshot(row);
      expect(s.network.chain).toBe(mod.descriptor.chain);
      expect(s.network.population).toBe(mod.descriptor.population);
      expect(s.module.id).toBeTruthy();
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
        const base = { network, sha256: row.sha256, choices };
        const { spec } = buildSpec(base, mod.descriptor, s);
        const check = validateSpec(spec, {
          snapshot: s,
          capabilities: mod.descriptor.capabilities,
        });
        expect(check.errors).toEqual([]);
        const drawn = renderFlower(spec, s);
        expect(drawn.svg.startsWith('<svg')).toBe(true);
        expect(drawn.legend.length).toBeGreaterThan(0);
        for (const item of drawn.legend) expect(item.meaning.length).toBeGreaterThan(0);
        expect(drawn.petals[0]?.id).not.toMatch(/^group:/);
      }
    }
  });
});
