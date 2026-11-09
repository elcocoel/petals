// The data protocol's layers, and the seam's first version (specs/005-mapping-brain, data.md and
// seam.md). A layer is one set of facts about an address's participants, named by the hash of what it
// holds; who added it is kept by whoever stores it, as git keeps authors on commits, not on blobs.
// A reading Petals' readers made is a layer too, named by its snapshot's hash.
//
// seam/v1 is a composed reading: a reader's snapshot with other layers' measures added as holdings,
// each layer listed as a source. Today's renderer draws it as it draws any snapshot, so a flower can
// take its size from one layer and its height from another (`height: m:<measure>`).
import { canonicalJson, sha256Hex } from './hash.ts';
import { createAjv, schemaId } from './schema/ajv.ts';
import type { Holding, Participant, Snapshot } from './types/index.ts';

export const LAYER_VERSION = 'layer/v1';
export const SEAM_VERSION = 'seam/v1';
/** A composed reading's module id: what tells a tool it's a view over layers, not one reader's. */
export const COMPOSED = 'compose';

export type MeasureKind = 'amount' | 'count' | 'share' | 'category' | 'flag';
export const MEASURE_KINDS: readonly MeasureKind[] = [
  'amount',
  'count',
  'share',
  'category',
  'flag',
];
export type Standing = 'verified' | 'inferred' | 'lead';

export interface Layer {
  petal: typeof LAYER_VERSION;
  /** the investigated address, `chain:address` (eip155:100:0x…, near:mainnet:alice.near) */
  about: string;
  kind: 'measures';
  measures: { name: string; unit: string; kind: MeasureKind; label?: string }[];
  /** a value per participant and measure; amounts and counts as decimal text */
  rows: { participant: string; measure: string; value: string }[];
  /** how it was made: the method in words, and what it read */
  how: { method: string; sources: { url: string; note?: string }[]; recipe?: string };
  /** the layers it was built on, by hash */
  from: string[];
  when: { as_of: string; block_height?: number };
  standing: Standing;
}

const NAME = /^[a-z][a-z0-9_]{0,40}$/;
const SHA = /^[0-9a-f]{64}$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;
export const LAYER_ROWS_MAX = 20_000;

export class LayerError extends Error {}

let compiled: ReturnType<ReturnType<typeof createAjv>['getSchema']> | undefined;
const layerValidator = () => {
  compiled ??= createAjv().getSchema(schemaId('layer'));
  if (!compiled) throw new Error('layer schema not registered');
  return compiled;
};

/** A layer as given, checked, or a LayerError that says what's wrong. */
export function checkLayer(x: unknown): Layer {
  const bad = (why: string): never => {
    throw new LayerError(why);
  };
  if (!x || typeof x !== 'object' || Array.isArray(x)) return bad('a layer is an object');
  const l = x as Partial<Layer>;
  if (l.petal !== LAYER_VERSION) bad(`petal must be ${LAYER_VERSION}`);
  if (
    typeof l.about !== 'string' ||
    !/^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}:\S{2,128}$/.test(l.about)
  )
    bad('about must be chain:address, as eip155:100:0xabc… or near:mainnet:alice.near');
  if (l.kind !== 'measures') bad('kind must be measures (relations and leads come later)');
  if (!Array.isArray(l.measures) || !l.measures.length) bad('measures must name at least one');
  const kinds = new Map<string, MeasureKind>();
  for (const m of l.measures ?? []) {
    if (!NAME.test(m?.name ?? '')) bad(`measure ${m?.name} must be lowercase_with_underscores`);
    if (kinds.has(m.name)) bad(`measure ${m.name} appears twice`);
    if (typeof m.unit !== 'string' || !m.unit) bad(`measure ${m.name} needs a unit`);
    if (!MEASURE_KINDS.includes(m.kind))
      bad(`measure ${m.name}: kind is one of ${MEASURE_KINDS.join(', ')}`);
    kinds.set(m.name, m.kind);
  }
  if (!Array.isArray(l.rows) || !l.rows.length) bad('rows must hold at least one value');
  if ((l.rows?.length ?? 0) > LAYER_ROWS_MAX) bad(`at most ${LAYER_ROWS_MAX} rows in a layer`);
  for (const [i, r] of (l.rows ?? []).entries()) {
    if (typeof r?.participant !== 'string' || !r.participant || r.participant.length > 200)
      bad(`rows[${i}].participant must be an address or account id`);
    const kind = kinds.get(r.measure);
    if (!kind) bad(`rows[${i}].measure ${r.measure} is not one of the layer's measures`);
    if (typeof r.value !== 'string') bad(`rows[${i}].value must be text`);
    if ((kind === 'amount' || kind === 'count' || kind === 'share') && !DECIMAL.test(r.value))
      bad(`rows[${i}].value must be a number written as text for a measure of kind ${kind}`);
  }
  const h = l.how;
  if (!h || typeof h.method !== 'string' || !h.method.trim())
    bad('how.method must say in words how this was made');
  if (!Array.isArray(h?.sources)) bad('how.sources must list what was read');
  for (const s of h?.sources ?? [])
    if (typeof s?.url !== 'string' || !/^(https?:\/\/|petal:|eip155:|near:)\S+$/.test(s.url))
      bad('each source needs a url (https://…, or a chain or petal reference)');
  if (h?.recipe !== undefined && !SHA.test(h.recipe)) bad('how.recipe must be a recipe hash');
  if (!Array.isArray(l.from) || !l.from.every((f) => SHA.test(f)))
    bad('from must list layer hashes');
  if (!l.when || Number.isNaN(Date.parse(l.when.as_of ?? ''))) bad('when.as_of must be a date');
  if (l.when?.block_height !== undefined && !Number.isInteger(l.when.block_height))
    bad('when.block_height must be a whole number');
  if (l.standing !== 'verified' && l.standing !== 'inferred' && l.standing !== 'lead')
    bad('standing is verified, inferred or lead');
  // Last, the schema itself (urn:petal:schema:layer:v1): what the checks above don't name, such as a field
  // it doesn't know or a date without its time, is refused here.
  const valid = layerValidator();
  if (!valid(x))
    bad(
      `not a layer/v1: ${(valid.errors ?? []).map((e) => `${e.instancePath || 'the layer'} ${e.message}`).join('; ')}`,
    );
  return l as Layer;
}

/** A layer's name: the hash of what it holds. */
export const layerHash = (l: Layer): string => sha256Hex(canonicalJson(l));

/** One added layer, as compose takes it: a layer, or another reader's snapshot, with its hash. */
export type Added = { hash: string; layer: Layer } | { hash: string; snapshot: Snapshot };

const sourceOf = (hash: string) => `layer:${hash.slice(0, 12)}`;

/**
 * A reading made of layers (seam/v1): the base reading, plus each added layer's measures as holdings,
 * each layer as a source. A measure name may come from one layer only, so a view can name it alone.
 */
export function composeView(base: Snapshot, added: readonly Added[]): Snapshot {
  if (!added.length) throw new LayerError('compose needs at least one layer to add');
  const names = new Set(base.holdings.map((h) => h.measure));
  const participants = new Map<string, Participant>(base.participants.map((p) => [p.id, p]));
  const holdings: Holding[] = [...base.holdings];
  const sources: Snapshot['sources'] = [...base.sources];
  const meet = (id: string, source: string) => {
    if (!participants.has(id))
      participants.set(id, {
        id,
        label: id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id,
        kind: 'unknown',
        identity: null,
        source,
      });
  };
  for (const a of added) {
    const source = sourceOf(a.hash);
    const measures =
      'layer' in a
        ? a.layer.measures.map((m) => m.name)
        : [...new Set(a.snapshot.holdings.map((h) => h.measure))];
    for (const m of measures) {
      if (names.has(m))
        throw new LayerError(`measure ${m} is in two layers; a view takes each name from one`);
      names.add(m);
    }
    if ('layer' in a) {
      const l = a.layer;
      const unit = new Map(l.measures.map((m) => [m.name, m.unit]));
      sources.push({
        id: source,
        kind: 'dataset',
        url: `petal:layer:${a.hash}`,
        method: `${l.standing}: ${l.how.method}`,
        fetched_at: l.when.as_of,
        ...(l.when.block_height !== undefined ? { block_height: l.when.block_height } : {}),
      });
      for (const r of l.rows) {
        meet(r.participant, source);
        holdings.push({
          participant: r.participant,
          asset: l.about,
          measure: r.measure,
          amount: r.value,
          unit: unit.get(r.measure) ?? '',
          as_of: l.when.as_of,
          source,
        });
      }
    } else {
      const s = a.snapshot;
      sources.push({
        id: source,
        kind: 'dataset',
        url: `petal:snapshot:${a.hash}`,
        method: `verified: ${s.module.id} ${s.module.version}, at block ${s.snapshot.block_height ?? 'unknown'}`,
        fetched_at: s.snapshot.as_of,
        ...(s.snapshot.block_height !== undefined ? { block_height: s.snapshot.block_height } : {}),
      });
      for (const h of s.holdings) {
        meet(h.participant, source);
        holdings.push({ ...h, source });
      }
    }
  }
  const hashes = added.map((a) => a.hash);
  return {
    ...base,
    network: {
      ...base.network,
      // its own population, so it's never taken for the base reading when a store looks one up
      population: `${base.network.population}+view-${sha256Hex(hashes.join(',')).slice(0, 12)}`,
      description: `${base.network.description ?? base.network.title}, with ${added.length} more layer${added.length === 1 ? '' : 's'}: ${hashes.map((h) => h.slice(0, 12)).join(', ')}`,
    },
    sources,
    participants: [...participants.values()],
    holdings,
    module: { id: COMPOSED, version: SEAM_VERSION },
  };
}
