// Stand-in network descriptors: local test doubles of W2's input-module descriptors
// (@petal/inputs `modules[id].descriptor`), so core builds and tests specs without depending on
// inputs (core is the bottom of the dependency graph). Goldens and render-fixture use these.
import type { Capabilities, NetworkDescriptor, Snapshot } from '../src/types/index.ts';

const LABELS: Record<string, string> = {
  validator_stake_current_epoch: 'stake in the current epoch',
  pool_contract_stake: 'stake in the pool contract',
  voting_power: 'voting power (veNEAR)',
  own_locked_near: 'NEAR locked by the account itself',
};

/** A minimal descriptor read off a snapshot: its measures, every `by` this build draws, backers
 * when the snapshot has delegations, no meanings (so buildSpec uses the standard ones). */
export function descriptorFor(
  s: Snapshot,
  opts: { measure?: string; capabilities?: Partial<Capabilities> } = {},
): NetworkDescriptor {
  const units = new Map<string, string>();
  for (const h of s.holdings) if (!units.has(h.measure)) units.set(h.measure, h.unit);
  const measures = [...units].map(([id, unit]) => ({ id, unit, label: LABELS[id] ?? id }));
  const first = opts.measure ?? measures[0]?.id;
  if (first) measures.sort((a, b) => (a.id === first ? -1 : b.id === first ? 1 : 0));
  const delegations = s.relationships.some((r) => r.type === 'delegates_to');
  const capabilities: Capabilities = {
    measures,
    by: {
      width: ['share', 'equal'],
      height: ['share', 'amount', 'equal', 'm:<metric>'],
      colour: ['kind', 'identity', 'single'],
      outline: ['identity_status'],
      segments: delegations ? ['backers'] : [],
      order: ['measure_desc'],
    },
    segments: delegations ? ['backers'] : [],
    relationships: [...new Set(s.relationships.map((r) => r.type))].sort(),
    defaults: first ? { measure: first } : {},
    meanings: {},
    ...opts.capabilities,
  };
  return {
    id: s.network.id,
    chain: s.network.chain,
    population: s.network.population,
    kind: 'chain',
    title: s.network.title,
    description: s.network.description ?? s.network.title,
    params: {},
    capabilities,
    live: false,
    cost: { calls: 0, seconds: 0, note: 'stand-in descriptor for core tests' },
    sources: s.sources.map((x) => ({ id: x.id, kind: x.kind, url: x.url })),
  };
}
