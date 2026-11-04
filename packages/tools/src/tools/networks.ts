// list_networks and get_network (tools.md). What Petal can read comes from the input modules'
// descriptors, never from data.
import type { NetworkDescriptor, Params, SnapshotWhere } from '@petal/core/types';
import { defineTool } from '../define.ts';
import type { ToolContext } from '../types.ts';
import {
  checkParams,
  DATETIME,
  moduleFor,
  NETWORK_SCHEMA,
  obj,
  PARAMS,
  readable,
  SHA256,
} from './shared.ts';

/** Shared-map prefix of snapshot fingerprints (shared-map.md, Keys and values). */
const SNAPSHOT_PREFIX = 'petal/v1/snapshot/';

const matches = (d: NetworkDescriptor, q: string) =>
  [d.id, d.title, d.description, d.chain, d.population, d.kind]
    .join(' ')
    .toLowerCase()
    .includes(q.toLowerCase());

export const listNetworks = defineTool<{ query?: string }, object>({
  name: 'list_networks',
  title: 'List networks',
  description:
    'The networks Petal can read, with what each can show (measures, segments) and what a live ' +
    'read costs. Use it first; when the network asked for is not listed, say plainly that Petal ' +
    "can't read it yet and name what it can read (cannot_read_hint).",
  input: obj(
    [],
    { query: { type: 'string', description: 'filter by words in id, title or chain' } },
    {
      additionalProperties: false,
    },
  ),
  output: obj(['networks', 'cannot_read_hint'], {
    networks: { type: 'array', items: NETWORK_SCHEMA },
    cannot_read_hint: { type: 'string' },
  }),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  async run({ query }, ctx) {
    const all = Object.values(ctx.modules).map((m) => m.descriptor);
    const q = query?.trim();
    const networks = q ? all.filter((d) => matches(d, q)) : all;
    const cannot_read_hint =
      q && networks.length === 0
        ? `Petal can't read "${q}" yet. It can read: ${readable(ctx)}.`
        : `Petal reads only these networks. It can read: ${readable(ctx)}. For anything else, ` +
          'say it is not readable yet; quote_payment with purpose sponsor_coverage quotes new coverage.';
    return { networks, cannot_read_hint };
  },
});

type Mapped = {
  sha256: string;
  as_of: string;
  block_height: number | null;
  final: boolean;
  where: SnapshotWhere;
};

/** Snapshot fingerprints on the shared map for one network (trusted writers only). */
async function mappedOnMap(ctx: ToolContext, id: string): Promise<Mapped[]> {
  const rows = await ctx.map.reader.latest(SNAPSHOT_PREFIX, { writers: ctx.map.trustedWriters });
  const out: Mapped[] = [];
  for (const r of rows) {
    const v = r.value as {
      sha256?: string;
      network?: { id?: string };
      as_of?: string;
      block_height?: number | null;
      final?: boolean;
    } | null;
    if (!v || v.network?.id !== id || typeof v.sha256 !== 'string') continue;
    if (r.key !== `${SNAPSHOT_PREFIX}${v.sha256}`) continue;
    out.push({
      sha256: v.sha256,
      as_of: String(v.as_of ?? ''),
      block_height: v.block_height ?? null,
      final: v.final === true,
      where: 'map',
    });
  }
  return out;
}

export const getNetwork = defineTool<{ id: string; params?: Params }, object>({
  name: 'get_network',
  title: 'Get a network',
  description:
    'One network: its descriptor (parameters, capabilities, cost) and the snapshots Petal ' +
    'already holds for it (fixture, cache or the shared map), so a final one can be reused.',
  input: obj(
    ['id'],
    { id: { type: 'string', minLength: 1 }, params: PARAMS },
    {
      additionalProperties: false,
    },
  ),
  output: obj(['network', 'mapped'], {
    network: NETWORK_SCHEMA,
    mapped: {
      type: 'array',
      items: obj(['sha256', 'as_of', 'block_height', 'final', 'where'], {
        sha256: SHA256,
        as_of: DATETIME,
        block_height: { type: ['integer', 'null'] },
        final: { type: 'boolean' },
        where: { enum: ['fixture', 'cache', 'map'] },
      }),
    },
  }),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  async run({ id, params }, ctx) {
    const network = moduleFor(ctx, id).descriptor;
    if (params) checkParams(network, params);
    const sameParams = (p: Params | undefined) =>
      !params || Object.entries(params).every(([k, v]) => p?.[k] === v);
    const local = (await ctx.store.list(id)).filter((r) => sameParams(r.params));
    const mapped: Mapped[] = local.map((r) => ({
      sha256: r.sha256,
      as_of: r.as_of,
      block_height: r.block_height,
      final: r.final,
      where: r.where,
    }));
    // The map is best-effort here: when it is down, what Petal holds locally still answers.
    const onMap = await mappedOnMap(ctx, id).catch(() => []);
    const seen = new Set(mapped.map((m) => m.sha256));
    for (const m of onMap) if (!seen.has(m.sha256)) mapped.push(m);
    mapped.sort((a, b) => (b.block_height ?? 0) - (a.block_height ?? 0));
    return { network, mapped };
  },
});
