// Small sample documents, valid against the contracts. Shared by core tests; other packages
// may import them from here in their own tests (relative path), never from src.
import type {
  Correction,
  Entry,
  Interpretation,
  Snapshot,
  SourceIds,
  Spec,
} from '../src/types/index.ts';

const AS_OF = '2026-11-03T19:42:00Z';
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

export const sampleSnapshot: Snapshot = {
  petal: 'snapshot/v1',
  network: {
    id: 'sample-pools',
    chain: 'near:mainnet',
    population: 'validators',
    title: 'Two sample pools',
  },
  snapshot: { as_of: AS_OF, block_height: 222915356, final: true },
  coverage: {
    participants_total: 3,
    participants_included: 3,
    amount_total: '3000',
    amount_included: '3000',
    unit: 'NEAR',
    measure: 'validator_stake_current_epoch',
  },
  sources: [
    {
      id: 'rpc-validators',
      kind: 'chain',
      url: 'https://rpc.mainnet.fastnear.com',
      method: 'validators',
      fetched_at: AS_OF,
      block_height: 222915356,
    },
  ],
  participants: [
    {
      id: 'a.pool.near',
      label: 'a.pool.near',
      kind: 'staking_pool',
      identity: { name: 'A', source: 'rpc-validators', status: 'self-declared' },
      source: 'rpc-validators',
    },
    {
      id: 'b.pool.near',
      label: 'b.pool.near',
      kind: 'staking_pool',
      identity: null,
      source: 'rpc-validators',
    },
    {
      id: 'group:b.pool.near:other',
      label: '12 delegators under 1,000 NEAR',
      kind: 'group',
      identity: null,
      count: 12,
      source: 'rpc-validators',
    },
  ],
  holdings: [
    {
      participant: 'a.pool.near',
      asset: 'NEAR',
      measure: 'validator_stake_current_epoch',
      amount: '2000',
      amount_raw: '2000000000000000000000000000',
      unit: 'NEAR',
      as_of: AS_OF,
      source: 'rpc-validators',
    },
    {
      participant: 'b.pool.near',
      asset: 'NEAR',
      measure: 'validator_stake_current_epoch',
      amount: '1000.5',
      unit: 'NEAR',
      as_of: AS_OF,
      source: 'rpc-validators',
    },
  ],
  relationships: [
    {
      from: 'group:b.pool.near:other',
      to: 'b.pool.near',
      type: 'delegates_to',
      amount: '1000.5',
      unit: 'NEAR',
      as_of: AS_OF,
      source: 'rpc-validators',
    },
  ],
  events: [],
  module: { id: 'sample', version: '0.0.0' },
};

const meaning = (m: string) => ({ meaning: m, sources: ['rpc-validators'] as SourceIds });

export const sampleSpec: Spec = {
  petal: 'spec/v1',
  network: { id: 'sample-pools', chain: 'near:mainnet', population: 'validators' },
  snapshot: { sha256: SHA_A, as_of: AS_OF, block_height: 222915356 },
  labels: 'none',
  selection: {
    measure: 'validator_stake_current_epoch',
    petals: 60,
    tail: { group: true, label: 'everyone else' },
  },
  encodings: {
    width: { by: 'share', scale: 'log', max_ratio: 2, ...meaning('share of stake, in a 2x band') },
    height: { by: 'share', scale: 'sqrt', ...meaning('square root of share') },
    colour: { by: 'kind', ...meaning('kind of account') },
    outline: {
      by: 'identity_status',
      ...meaning('solid: self-declared or verified; dashed: inferred'),
    },
    segments: null,
    order: { by: 'measure_desc', ...meaning('largest first, clockwise from the top') },
  },
  convention: { id: 'default/v1', variation_of: null, changes: [] },
};

export const sampleInterpretation: Interpretation = {
  summary: 'Two pools hold all the stake; the larger holds two thirds of it.',
  power_means: [
    {
      claim: 'Stake decides block production.',
      sources: ['rpc-validators'],
      figures: ['fig:nakamoto'],
    },
  ],
  mappings: [
    {
      primitive: 'width',
      why: 'Stake is the power that counts here.',
      sources: ['rpc-validators'],
    },
  ],
  conflicts: [],
  unknowns: ['Who controls each pool is not known from the chain alone.'],
  inferred: [],
  documents: [],
};

export const sampleEntry: Entry = {
  petal: 'flower/v1',
  id: '0123456789abcdef01234567',
  title: 'Two sample pools',
  spec: sampleSpec,
  spec_sha256: SHA_B,
  interpretation: sampleInterpretation,
  snapshot: { sha256: SHA_A, urls: [`/api/v1/snapshots/${SHA_A}`] },
  render_sha256: SHA_B,
  provenance: {
    maker: null,
    agent: { kind: 'hand-written' },
    tools_version: 'tools/v1',
    created_at: '2026-11-04T12:00:00Z',
  },
};

export const sampleCorrection: Correction = {
  petal: 'correction/v1',
  id: 'abcdefabcdefabcdefabcdef',
  flower_id: '0123456789abcdef01234567',
  target: { participant: 'a.pool.near', caip2: 'near:mainnet', address: 'a.pool.near' },
  request: 'correct',
  reason: 'The pool is run by someone else.',
  requester: 'someone.testnet',
  proof: {
    type: 'nep413',
    account_id: 'someone.testnet',
    public_key: 'ed25519:11111111111111111111111111111111',
    signature: 'AAAA',
    message: `{"petal":"correction/v1","correction_sha256":"${SHA_A}"}`,
    nonce: 'AAAA',
    recipient: 'petals.testnet',
  },
  written_at: '2026-11-04T12:00:00Z',
};
