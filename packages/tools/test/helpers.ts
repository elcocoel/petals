// Test helpers: fixture snapshots in a memory store, network descriptors, a ToolContext on fakes
// (fakeMap, the test NEP-413 signer and fake RPC, the recorded dry quote), and MCP clients over
// HTTP and in-memory stdio. Tests that use these also vi.mock the stub packages (doubles/).
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { canonicalJson, sha256Hex } from '@petal/core';
import type {
  Capabilities,
  IndexRow,
  NetworkDescriptor,
  Snapshot,
  SnapshotWhere,
} from '@petal/core/types';
import type { InputModule, SnapshotStore } from '@petal/inputs';
import { fakeRpcFor, type TestSigner, testSigner } from '@petal/near/auth/testing';
import { fakeMap } from '@petal/near/map';
import { fakeQuote } from '@petal/near/pay';
import type { Hono } from 'hono';
import { serveOn } from '../src/mcp/stdio.ts';
import type { ToolContext } from '../src/types.ts';
import { testModules } from './doubles/inputs.ts';

type FakeMap = ReturnType<typeof fakeMap>;

export const REPO = fileURLToPath(new URL('../../../', import.meta.url));
export const FIXTURES = join(REPO, 'fixtures');

// ---------------------------------------------------------------------------------------------
// Snapshots

let validators: { s: Snapshot; sha256: string } | undefined;
/** The near-validators fixture (block 222,915,356), named by its index row. */
export function validatorsFixture(): { s: Snapshot; sha256: string } {
  if (validators) return validators;
  const index = JSON.parse(readFileSync(join(FIXTURES, 'snapshots/index.json'), 'utf8')) as {
    snapshots: IndexRow[];
  };
  const row = index.snapshots.find((r) => r.network === 'near-validators');
  if (!row) throw new Error('no near-validators fixture');
  const s = JSON.parse(gunzipSync(readFileSync(join(FIXTURES, 'snapshots', row.file))).toString());
  validators = { s, sha256: row.sha256 };
  return validators;
}

/** A hand-sized test snapshot (fixtures/snapshots/test/<name>.json) and its hash. */
export function testFixture(name: 'tiny-backers' | 'two-participants'): {
  s: Snapshot;
  sha256: string;
} {
  const s = JSON.parse(readFileSync(join(FIXTURES, `snapshots/test/${name}.json`), 'utf8'));
  return { s, sha256: sha256Hex(canonicalJson(s)) };
}

export type MemoryStore = SnapshotStore & { puts: string[] };

/** A content-addressed store in memory, like fileStore's interface. */
export function memoryStore(
  seed: { s: Snapshot; sha256: string; where?: Exclude<SnapshotWhere, 'map'> }[] = [],
): MemoryStore {
  const docs = new Map<string, { s: Snapshot; where: Exclude<SnapshotWhere, 'map'> }>();
  for (const x of seed) docs.set(x.sha256, { s: x.s, where: x.where ?? 'fixture' });
  const puts: string[] = [];
  const rowOf = (sha256: string, s: Snapshot, where: Exclude<SnapshotWhere, 'map'>): IndexRow => ({
    sha256,
    network: s.network.id,
    chain: s.network.chain,
    population: s.network.population,
    block_height: s.snapshot.block_height ?? null,
    as_of: s.snapshot.as_of,
    final: s.snapshot.final,
    bytes: 0,
    gz_bytes: 0,
    file: `${sha256}.json.gz`,
    where,
    module: s.module,
  });
  return {
    puts,
    async get(sha256) {
      return docs.get(sha256)?.s ?? null;
    },
    async put(s) {
      const text = canonicalJson(s);
      const sha256 = sha256Hex(text);
      docs.set(sha256, { s, where: 'cache' });
      puts.push(sha256);
      return { sha256, bytes: new TextEncoder().encode(text).length };
    },
    async lookup({ chain, population, block_height }) {
      for (const [sha, d] of docs) {
        const n = d.s.network;
        if (
          n.chain === chain &&
          n.population === population &&
          d.s.snapshot.block_height === block_height
        )
          return sha;
      }
      return null;
    },
    async list(networkId) {
      return [...docs]
        .filter(([, d]) => !networkId || d.s.network.id === networkId)
        .map(([sha, d]) => rowOf(sha, d.s, d.where));
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Networks

const stake = (sources: string[]) => ({
  'width:share': { meaning: 'share of stake in the current epoch, in a 2x band', sources },
  'height:share': { meaning: 'square root of share of stake', sources },
  'colour:kind': { meaning: 'kind of account: pool or liquid-staking entity', sources },
  'outline:identity_status': {
    meaning: 'pool names are self-declared on-chain: solid when declared, none when unknown',
    sources,
  },
  'segments:backers': {
    meaning: 'who backs the pool: other delegators, 1M+ NEAR accounts, liquid staking, lockups',
    sources: ['fastnear-rpc-staking-pool-views'],
  },
  'order:measure_desc': { meaning: 'largest first, clockwise from the top', sources },
});

function capabilities(sources: string[], segments: string[]): Capabilities {
  return {
    measures: [{ id: 'validator_stake_current_epoch', unit: 'NEAR', label: 'stake this epoch' }],
    by: {
      width: ['share', 'equal'],
      height: ['share', 'amount', 'equal'],
      colour: ['kind', 'identity', 'single'],
      outline: ['identity_status'],
      segments,
      order: ['measure_desc'],
    },
    segments,
    relationships: ['delegates_to', 'owned_by'],
    defaults: { measure: 'validator_stake_current_epoch' },
    meanings: stake(sources),
  };
}

export function descriptor(
  id: string,
  title: string,
  opts: { segments?: string[]; live?: boolean; params?: NetworkDescriptor['params'] } = {},
): NetworkDescriptor {
  return {
    id,
    chain: 'near:mainnet',
    population: id === 'near-validators' ? 'validators' : 'validators-test',
    kind: 'chain',
    title,
    description: `${title}: stake and the delegators behind it`,
    params: opts.params ?? {},
    capabilities: capabilities(
      ['fastnear-rpc-validators', 'nearblocks-validators'],
      opts.segments ?? ['backers'],
    ),
    live: opts.live ?? false,
    cost: { calls: 0, seconds: 0, note: 'served from a fixture' },
    sources: [
      { id: 'fastnear-rpc-validators', kind: 'chain', url: 'https://rpc.mainnet.fastnear.com' },
    ],
  };
}

/** An input module for a descriptor; `fetch` reports progress and returns `snapshot`. */
export function moduleOf(d: NetworkDescriptor, snapshot?: Snapshot): InputModule {
  return {
    descriptor: d,
    async resolveAt() {
      return {
        block_height: snapshot?.snapshot.block_height ?? 1,
        as_of: snapshot?.snapshot.as_of ?? '2026-11-04T00:00:00Z',
      };
    },
    async fetch(_at, _params, onProgress) {
      if (!snapshot) throw Object.assign(new Error('nothing to fetch'), { code: 'source_failed' });
      onProgress?.({ stage: 'fetching', message: 'reading holders', done: 1, total: 2 });
      onProgress?.({ stage: 'fetching', message: 'reading delegations', done: 2, total: 2 });
      return snapshot;
    },
  };
}

/** A snapshot of `test-live`: two-participants with its own network id and a block. */
export function liveSnapshot(): Snapshot {
  const { s } = testFixture('two-participants');
  return {
    ...s,
    network: { ...s.network, id: 'test-live', population: 'live-test' },
    snapshot: { ...s.snapshot, block_height: 223_000_000 },
  };
}

// ---------------------------------------------------------------------------------------------
// Context

export interface TestRig {
  ctx: ToolContext;
  map: FakeMap;
  store: MemoryStore;
  signer: TestSigner;
  /** a key of maker.testnet that is only a function-call key */
  fcSigner: TestSigner;
  stateDir: string;
  clock: { set(iso: string): void };
}

export const NOW = '2026-11-04T12:00:00.000Z';

export function rig(opts: { tiny?: boolean } = {}): TestRig {
  const v = validatorsFixture();
  const tiny = testFixture('tiny-backers');
  const two = testFixture('two-participants');
  const store = memoryStore(opts.tiny === false ? [v] : [v, tiny, two]);
  const map = fakeMap();
  const signer = testSigner('maker.testnet');
  const fcSigner = testSigner('maker.testnet', 'maker.testnet/function-call');
  const stateDir = mkdtempSync(join(tmpdir(), 'petal-tools-'));
  let now = new Date(NOW);
  // the getSnapshot double fetches through these (the real one uses @petal/inputs' modules)
  testModules['test-live'] = moduleOf(
    descriptor('test-live', 'A live test network', { live: true }),
    liveSnapshot(),
  );
  const ctx: ToolContext = {
    config: {
      root: REPO,
      fixturesDir: FIXTURES,
      stateDir,
      fake: true,
      apiBase: 'https://petal.test',
    },
    store,
    modules: {
      'near-validators': moduleOf(descriptor('near-validators', 'NEAR validators')),
      'test-tiny-backers': moduleOf(descriptor('test-tiny-backers', 'Five NEAR pools (test)')),
      'test-two-participants': moduleOf(
        descriptor('test-two-participants', 'Two NEAR validators (test)', { segments: [] }),
      ),
      'test-live': testModules['test-live'],
    },
    map: { reader: map, writer: map, receiver: map.receiver, trustedWriters: [map.writer] },
    rpc: fakeRpcFor([signer, fcSigner], [fcSigner]),
    quote: fakeQuote(),
    now: () => now,
  };
  return {
    ctx,
    map,
    store,
    signer,
    fcSigner,
    stateDir,
    clock: { set: (iso) => (now = new Date(iso)) },
  };
}

// ---------------------------------------------------------------------------------------------
// MCP clients

/** An MCP client over Streamable HTTP, talking to `app` at /mcp without a network. */
export async function httpMcpClient(app: Hono): Promise<Client> {
  const client = new Client({ name: 'petal-test', version: '1' });
  const transport = new StreamableHTTPClientTransport(new URL('https://petal.test/mcp'), {
    fetch: async (url, init) => app.fetch(new Request(url, init)),
  });
  await client.connect(transport);
  return client;
}

/** An MCP client on an in-memory stdio pair, served by serveOn (what serveStdio runs). */
export async function stdioMcpClient(
  ctx: ToolContext,
): Promise<{ client: Client; closed: Promise<void> }> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const closed = serveOn(ctx, serverSide);
  const client = new Client({ name: 'petal-test', version: '1' });
  await client.connect(clientSide as never);
  return { client, closed };
}

// ---------------------------------------------------------------------------------------------
// A full flow, for tests that need real inputs for every tool

/** The skeleton interpretation (fixtures/transcripts/skeleton.hand.json), with no numbers. */
export const INTERPRETATION = {
  summary:
    "Stake decides who produces NEAR's blocks. A few seated validators together hold more than a third of it.",
  power_means: [
    {
      claim: "A validator's power is its stake in the current epoch.",
      sources: ['fastnear-rpc-validators'],
      figures: ['fig:total', 'fig:shares'],
    },
  ],
  mappings: [
    {
      primitive: 'width',
      why: 'Share of stake is the power that counts here.',
      sources: ['fastnear-rpc-validators'],
    },
    {
      primitive: 'segments',
      why: 'Each bar is cut into the backers of the pool.',
      sources: ['fastnear-rpc-staking-pool-views'],
    },
  ],
  conflicts: ['House of Stake voting power is a second kind of power on NEAR.'],
  unknowns: ['Who controls the large implicit (hex) delegators.'],
  inferred: ['A named .near account is a self-declared name, not a verified identity.'],
  documents: [],
};

type Run = (name: string, input: unknown) => Promise<Record<string, unknown>>;

/** get_snapshot → propose_spec (backers) → render_flower → the draft entry to publish. */
export async function flow(run: Run) {
  const snap = await run('get_snapshot', { network: 'near-validators' });
  const sha256 = snap.sha256 as string;
  const proposed = await run('propose_spec', {
    network: 'near-validators',
    sha256,
    choices: { measure: 'validator_stake_current_epoch', segments: 'backers' },
  });
  const spec = proposed.spec as Record<string, unknown>;
  const rendered = await run('render_flower', { spec });
  const draft = {
    petal: 'flower/v1',
    title: "Who stands behind NEAR's validators",
    spec,
    spec_sha256: proposed.spec_sha256,
    interpretation: INTERPRETATION,
    snapshot: { sha256, urls: [snap.body_url] },
    render_sha256: rendered.render_sha256,
    provenance: {
      maker: null,
      agent: { kind: 'own-agent', name: 'vitest' },
      tools_version: 'tools/v1',
      created_at: NOW,
    },
  };
  return { snap, sha256, proposed, spec, rendered, draft };
}
