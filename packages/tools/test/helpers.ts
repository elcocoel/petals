// Test helpers: fixture snapshots, real-shaped input modules, a ToolContext on the real packages
// (fileStore, near-validators, core) with fakes only where the outside world would be (fakeMap,
// the test NEP-413 signer and fake RPC, the recorded dry quote), and MCP clients over HTTP and
// in-memory stdio.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { canonicalJson, sha256Hex } from '@petal/core';
import type { IndexRow, NetworkDescriptor, ProgressEvent, Snapshot } from '@petal/core/types';
import {
  fileStore,
  type InputModule,
  NEAR_VALIDATORS_DESCRIPTOR,
  nearValidators,
  type SnapshotStore,
} from '@petal/inputs';
import { fakeRpcFor, type TestSigner, testSigner } from '@petal/near/auth/testing';
import { fakeMap } from '@petal/near/map';
import { fakeQuote } from '@petal/near/pay';
import type { Hono } from 'hono';
import { expect } from 'vitest';
import { serveOn } from '../src/mcp/stdio.ts';
import { findTool } from '../src/registry.ts';
import type { ToolContext } from '../src/types.ts';

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

// ---------------------------------------------------------------------------------------------
// Networks: real-shaped input modules

/**
 * A stored test network over one snapshot: the real NEAR validators descriptor, re-pointed at
 * the snapshot's network id and population, with each standard meaning citing only sources the
 * snapshot has (validator rule 4).
 */
export function testDescriptor(
  s: Snapshot,
  opts: { segments?: string[]; live?: boolean } = {},
): NetworkDescriptor {
  const base = NEAR_VALIDATORS_DESCRIPTOR;
  const have = s.sources.map((x) => x.id);
  const meanings = Object.fromEntries(
    Object.entries(base.capabilities.meanings).map(([k, m]) => {
      const sources = m.sources.filter((x) => have.includes(x));
      return [k, { ...m, sources: sources.length ? sources : [have[0] as string] }];
    }),
  );
  const segments = opts.segments ?? base.capabilities.segments;
  return {
    ...base,
    id: s.network.id,
    chain: s.network.chain,
    population: s.network.population,
    title: s.network.title,
    description: `${s.network.title}: a test network over one snapshot`,
    live: opts.live ?? false,
    cost: { calls: 0, seconds: 0, note: 'test data' },
    capabilities: {
      ...base.capabilities,
      by: { ...base.capabilities.by, segments },
      segments,
      meanings,
    },
    sources: base.sources.filter((x) => have.includes(x.id)),
  };
}

/** An input module serving one snapshot; `fetch` reports progress like a live read. */
export function moduleOf(d: NetworkDescriptor, s: Snapshot): InputModule {
  return {
    descriptor: d,
    async resolveAt() {
      return { block_height: s.snapshot.block_height ?? 0, as_of: s.snapshot.as_of };
    },
    async fetch(_at, _params, onProgress) {
      onProgress?.({ stage: 'fetching', message: 'reading holders', done: 1, total: 2 });
      onProgress?.({ stage: 'fetching', message: 'reading delegations', done: 2, total: 2 });
      return s;
    },
  };
}

/** A snapshot of `test-live`: two-participants with its own network id and a block. */
export function liveSnapshot(): Snapshot {
  const { s } = testFixture('two-participants');
  return {
    ...s,
    network: {
      ...s.network,
      id: 'test-live',
      population: 'live-test',
      title: 'A live test network',
    },
    snapshot: { ...s.snapshot, block_height: 223_000_000 },
  };
}

// ---------------------------------------------------------------------------------------------
// Context

export interface TestRig {
  ctx: ToolContext;
  map: FakeMap;
  store: SnapshotStore;
  signer: TestSigner;
  /** a key of maker.testnet that is only a function-call key */
  fcSigner: TestSigner;
  stateDir: string;
  clock: { set(iso: string): void };
}

export const NOW = '2026-11-04T12:00:00.000Z';

/**
 * A ToolContext on the real packages: fileStore over the repo fixtures (cache in a temp dir,
 * holding the two test snapshots), the real near-validators module, fakeMap, the test NEP-413
 * signer with a fake RPC, and the recorded dry quote.
 */
export async function rig(): Promise<TestRig> {
  const stateDir = mkdtempSync(join(tmpdir(), 'petal-tools-'));
  const store = fileStore({
    fixtures: join(FIXTURES, 'snapshots'),
    cache: join(stateDir, 'cache'),
  });
  const tiny = testFixture('tiny-backers');
  const two = testFixture('two-participants');
  for (const t of [tiny, two]) expect((await store.put(t.s)).sha256).toBe(t.sha256);
  const map = fakeMap();
  const signer = testSigner('maker.testnet');
  const fcSigner = testSigner('maker.testnet', 'maker.testnet/function-call');
  let now = new Date(NOW);
  const live = liveSnapshot();
  const ctx: ToolContext = {
    config: {
      root: REPO,
      // a clean fixtures folder: list_flowers shows only what a test publishes, whatever hero
      // entries the repo ships. The snapshot store above still reads the repo's snapshots.
      fixturesDir: join(stateDir, 'fixtures'),
      stateDir,
      fake: true,
      apiBase: 'https://petal.test',
    },
    store,
    modules: {
      'near-validators': nearValidators(),
      'test-tiny-backers': moduleOf(testDescriptor(tiny.s), tiny.s),
      'test-two-participants': moduleOf(testDescriptor(two.s, { segments: [] }), two.s),
      'test-live': moduleOf(testDescriptor(live, { live: true }), live),
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
    clock: {
      set: (iso) => {
        now = new Date(iso);
      },
    },
  };
}

/** The progress events a tool reports in process, on a fresh rig. */
export async function progressOf(tool: string, input: unknown): Promise<ProgressEvent[]> {
  const r = await rig();
  const events: ProgressEvent[] = [];
  const t = findTool(tool);
  if (!t) throw new Error(tool);
  await t.run(input, { ...r.ctx, onProgress: (e) => events.push(e) });
  return events;
}

// ---------------------------------------------------------------------------------------------
// MCP clients

/** An MCP client over Streamable HTTP, talking to `app` at /mcp without a network. */
export async function httpMcpClient(
  app: Hono,
  headers: () => Record<string, string> = () => ({}),
): Promise<Client> {
  const client = new Client({ name: 'petal-test', version: '1' });
  const transport = new StreamableHTTPClientTransport(new URL('https://petal.test/mcp'), {
    fetch: async (url, init) => {
      const req = new Request(url, init);
      for (const [k, v] of Object.entries(headers())) req.headers.set(k, v);
      return app.fetch(req);
    },
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

/** The skeleton interpretation (fixtures/transcripts/skeleton.hand.json): one mapping per primitive
 * the backers spec uses, no numbers. */
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
      primitive: 'height',
      why: 'Bar height repeats the share, on a square-root scale.',
      sources: ['fastnear-rpc-validators'],
    },
    {
      primitive: 'colour',
      why: 'Kind of account tells pools from liquid-staking entities.',
      sources: ['nearblocks-validators', 'fastnear-rpc-liquid-staking'],
    },
    {
      primitive: 'outline',
      why: 'Pool names are self-declared on-chain, so they are drawn as self-declared.',
      sources: ['nearblocks-validators', 'account-id'],
    },
    {
      primitive: 'segments',
      why: 'Each bar is cut into the backers of the pool.',
      sources: ['fastnear-rpc-staking-pool-views'],
    },
    {
      primitive: 'order',
      why: 'Largest first, clockwise from the top.',
      sources: ['fastnear-rpc-validators'],
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
    petal: 'flower/v2',
    title: "Who stands behind NEAR's validators",
    spec,
    spec_sha256: proposed.spec_sha256,
    interpretation: INTERPRETATION,
    snapshot: { sha256, urls: [snap.body_url] },
    provenance: {
      maker: null,
      agent: { kind: 'own-agent', name: 'vitest' },
      tools_version: 'tools/v1',
      created_at: NOW,
    },
  };
  return { snap, sha256, proposed, spec, rendered, draft };
}
