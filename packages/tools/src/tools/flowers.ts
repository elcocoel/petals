// list_flowers and get_flower (tools.md; shared-map.md, Reading). Rows come from trusted
// writers only, and every entry is re-verified; a row that fails is hidden.
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Entry, MapRow } from '@petal/core/types';
import { mapKeys } from '@petal/near/map';
import { defineTool, FLOWER_DEFS } from '../define.ts';
import { ToolFailure } from '../errors.ts';
import type { ToolContext } from '../types.ts';
import { type Verified, verifyEntry } from '../verify.ts';
import { ENTRY_ID, obj } from './shared.ts';

/** Shared-map prefix of published flowers (shared-map.md, Keys and values). */
const SPEC_PREFIX = 'petal/v1/spec/';

interface Found {
  entry: Entry;
  where: 'map' | 'fixture';
  verified: Verified;
  row?: MapRow;
}

/** block_timestamp as ISO time: FastData gives nanoseconds, the fake map milliseconds. */
function isoFromBlock(ts: number): string | null {
  if (!Number.isFinite(ts) || ts <= 0) return null;
  const ms = ts > 1e17 ? ts / 1e6 : ts > 1e14 ? ts / 1e3 : ts;
  return new Date(Math.floor(ms)).toISOString();
}

function fromRow(row: MapRow): Found | null {
  const entry = row.value as Entry | null;
  if (!entry || typeof entry !== 'object' || entry.petal !== 'flower/v1') return null;
  if (row.key !== `${SPEC_PREFIX}${entry.id}`) return null;
  const verified = verifyEntry(entry, {
    id: row.key.slice(SPEC_PREFIX.length),
    recipient: row.receiver,
  });
  // Published entries carry the maker's proof; one that fails either check is hidden.
  if (!verified.entry_hash || !verified.maker_signature) return null;
  return { entry, where: 'map', verified, row };
}

/** Hero entries shipped in the repo: fixtures/map/*.json (flower/v1). */
async function fixtureEntries(ctx: ToolContext): Promise<Found[]> {
  const dir = join(resolve(ctx.config.root, ctx.config.fixturesDir ?? 'fixtures'), 'map');
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.json')).sort();
  } catch {
    return [];
  }
  const out: Found[] = [];
  for (const name of names) {
    try {
      const entry = JSON.parse(await readFile(join(dir, name), 'utf8')) as Entry;
      if (entry?.petal !== 'flower/v1') continue;
      const verified = verifyEntry(entry);
      if (verified.entry_hash) out.push({ entry, where: 'fixture', verified });
    } catch {
      // an unreadable fixture is skipped, like a map row that fails
    }
  }
  return out;
}

async function mapEntries(ctx: ToolContext): Promise<Found[]> {
  const rows = await ctx.map.reader.latest(SPEC_PREFIX, { writers: ctx.map.trustedWriters });
  return rows.map(fromRow).filter((f): f is Found => f !== null);
}

const FLOWER_ROW = obj(['id', 'title', 'network', 'as_of', 'maker', 'published_at', 'where'], {
  id: ENTRY_ID,
  title: { type: 'string' },
  network: { type: 'string' },
  as_of: { type: 'string' },
  maker: { type: ['string', 'null'] },
  published_at: { type: ['string', 'null'] },
  where: { enum: ['map', 'fixture'] },
  tx_hash: { type: 'string' },
});

function summaryOf(f: Found) {
  const e = f.entry;
  return {
    id: e.id,
    title: e.title ?? `${e.spec.network.id} at ${e.spec.snapshot.as_of}`,
    network: e.spec.network.id,
    as_of: e.spec.snapshot.as_of,
    maker: e.provenance.maker?.account_id ?? null,
    published_at: (f.row && isoFromBlock(f.row.block_timestamp)) ?? e.provenance.created_at ?? null,
    where: f.where,
    ...(f.row ? { tx_hash: f.row.tx_hash } : {}),
  };
}

export const listFlowers = defineTool<{ network?: string; maker?: string; limit?: number }, object>(
  {
    name: 'list_flowers',
    title: 'List flowers',
    description:
      'Published flowers on the shared map (trusted writers only, each re-verified) and the hero ' +
      'fixtures, newest first. Check here before making a new flower: offer an existing one for ' +
      'the same network and date unless a fresh analysis is asked for.',
    input: obj(
      [],
      {
        network: { type: 'string', minLength: 1 },
        maker: { type: 'string', minLength: 1, description: 'NEAR account of the maker' },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
      },
      { additionalProperties: false },
    ),
    output: obj(['flowers'], { flowers: { type: 'array', items: FLOWER_ROW } }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    async run({ network, maker, limit = 50 }, ctx) {
      // When the map is unreachable the fixtures still answer; health says map: down.
      const fromMap = await mapEntries(ctx).catch(() => [] as Found[]);
      const seen = new Set(fromMap.map((f) => f.entry.id));
      const all = [...fromMap, ...(await fixtureEntries(ctx)).filter((f) => !seen.has(f.entry.id))];
      const flowers = all
        .map(summaryOf)
        .filter((f) => (network ? f.network === network : true))
        .filter((f) => (maker ? f.maker === maker : true))
        .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
        .slice(0, limit);
      return { flowers };
    },
  },
);

export const getFlower = defineTool<{ id: string }, object>({
  name: 'get_flower',
  title: 'Get a flower',
  description:
    'One published flower by id: the entry (spec, interpretation, provenance), where it was ' +
    'found, its transaction, what was verified (entry hash, maker signature, model signature) ' +
    'and open correction requests.',
  input: obj(['id'], { id: ENTRY_ID }, { additionalProperties: false }),
  output: obj(
    ['entry', 'where', 'verified', 'corrections'],
    {
      entry: { $ref: '#/$defs/entry' },
      where: { enum: ['map', 'fixture'] },
      tx_hash: { type: 'string' },
      verified: obj(['entry_hash', 'maker_signature', 'model_signature'], {
        entry_hash: { type: 'boolean' },
        maker_signature: { type: 'boolean' },
        model_signature: { enum: ['present', 'absent'] },
      }),
      corrections: {
        type: 'array',
        items: obj(['id', 'target', 'request', 'status'], {
          id: { type: 'string' },
          target: { type: 'object' },
          request: { enum: ['correct', 'remove'] },
          status: { enum: ['open', 'accepted', 'declined'] },
        }),
      },
    },
    { $defs: FLOWER_DEFS },
  ),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  async run({ id }, ctx) {
    let hidden = false;
    let mapError: Error | null = null;
    const key = mapKeys.spec(id);
    for (const w of ctx.map.trustedWriters) {
      const row = await ctx.map.reader.get(key, w).catch((err: Error) => {
        mapError = err;
        return null;
      });
      if (!row) continue;
      const found = fromRow(row);
      if (found) return result(found);
      hidden = true;
    }
    const fixture = (await fixtureEntries(ctx)).find((f) => f.entry.id === id);
    if (fixture) return result(fixture);
    if (mapError) {
      throw new ToolFailure(
        'source_failed',
        `The shared map could not be read: ${(mapError as Error).message}`,
        'Try again in a moment; GET /api/v1/health says whether the map is up.',
      );
    }
    throw new ToolFailure(
      'not_found',
      hidden
        ? `Flower ${id} is on the map but failed verification, so it is hidden.`
        : `No flower ${id} on the map or in the fixtures.`,
      'list_flowers lists the flowers Petal can show.',
    );
  },
});

function result(f: Found) {
  return {
    entry: f.entry,
    where: f.where,
    ...(f.row ? { tx_hash: f.row.tx_hash } : {}),
    verified: f.verified,
    // Correction requests are read from the map from T082 (Phase B).
    corrections: [],
  };
}
