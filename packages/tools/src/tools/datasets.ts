// Layers kept on the site, and the versions of a dataset (specs/005-mapping-brain/data.md; Elco, 9 Nov:
// "anyone can add, fork and use the prior", private first). A dataset is everything an author holds about one
// address; a version of it is a set of layer hashes plus the version it came from (parent). Nothing is
// overwritten: keeping a layer makes a new version after the author's last one, and a fork makes one from a
// version they can see, with layers added or dropped.
//   keep_layer     a layer, kept privately under the project's owner, and the new version it makes
//   list_layers    the owner's layers and versions about an address, or one layer whole by its hash
//   fork_dataset   a new version from one of theirs, with layers added or dropped
// They go through the project's link as save_step does: keeping and forking need what writing a note needs
// (the owner or a continue link), listing needs any link. A project nobody has claimed holds its layers
// under itself until someone does (claimExploration moves them). Publishing to the shared map is later.
import { randomBytes } from 'node:crypto';
import { canonicalJson, checkLayer, type Layer, LayerError, layerHash } from '@petal/core';
import type { DatasetVersionRow, LayerRow } from '@petal/store';
import { defineTool } from '../define.ts';
import { ToolFailure } from '../errors.ts';
import {
  credentialOf,
  lastingStore,
  open,
  READS,
  REF,
  touched,
  WRITES,
  writable,
} from './explorations.ts';
import { LAYER_INPUT } from './layers.ts';
import { DATETIME, obj, SHA256 } from './shared.ts';

/** Who holds a project's layers: its owner, or the project itself until someone claims it. */
export const layerOwnerOf = (row: { id: string; owner: string | null }) =>
  row.owner ?? `exploration:${row.id}`;

const ABOUT = { type: 'string', minLength: 3, maxLength: 200, description: 'chain:address' };
const VERSION = obj(['id', 'about', 'seq', 'parent', 'layers', 'created_at'], {
  id: { type: 'string' },
  about: { type: 'string' },
  seq: { type: 'integer' },
  parent: { type: ['string', 'null'] },
  layers: { type: 'array', items: SHA256 },
  created_at: DATETIME,
});
const LAYER_SUMMARY = obj(['hash', 'about', 'standing', 'measures', 'rows', 'created_at'], {
  hash: SHA256,
  about: { type: 'string' },
  standing: { type: 'string' },
  measures: { type: 'array', items: { type: 'object' } },
  rows: { type: 'integer' },
  created_at: DATETIME,
});

const versionOut = (v: DatasetVersionRow) => ({
  id: v.id,
  about: v.about,
  seq: v.seq,
  parent: v.parent,
  layers: v.layers,
  created_at: v.created_at,
});
const summaryOf = (r: LayerRow) => {
  const l = JSON.parse(r.body) as Layer;
  return {
    hash: r.hash,
    about: r.about,
    standing: r.standing,
    measures: l.measures,
    rows: l.rows.length,
    created_at: r.created_at,
  };
};
const newVersionId = () => `dsv_${randomBytes(9).toString('hex')}`;

export const keepLayer = defineTool<{ exploration: string; layer: unknown }, object>({
  name: 'keep_layer',
  title: 'Keep a layer on the site',
  description:
    "Keep a layer in the person's project on the site, privately, under its owner: the same layer add_layer keeps on this machine. It makes a new version of their dataset about that address, after their last one. The same layer twice changes nothing.",
  input: obj(['exploration', 'layer'], { exploration: REF, layer: LAYER_INPUT }),
  accepts: obj(['exploration', 'layer'], { exploration: REF, layer: { type: 'object' } }),
  output: obj(['exploration', 'hash', 'about', 'existed', 'version'], {
    exploration: { type: 'string' },
    hash: SHA256,
    about: { type: 'string' },
    existed: { type: 'boolean' },
    version: VERSION,
  }),
  annotations: WRITES,
  async run({ exploration, layer }, ctx) {
    let l: Layer;
    try {
      l = checkLayer(layer);
    } catch (e) {
      if (e instanceof LayerError) {
        throw new ToolFailure(
          'bad_input',
          `This isn't a layer yet: ${e.message}.`,
          "See add_layer's input schema.",
        );
      }
      throw e;
    }
    const store = lastingStore(ctx);
    const o = await open(ctx, exploration);
    writable(o);
    const owner = layerOwnerOf(o.row);
    const hash = layerHash(l);
    const at = ctx.now().toISOString();
    const credential = credentialOf(ctx, o);
    const out = await store.tx(async () => {
      const fresh = await store.layer.keep({
        owner,
        hash,
        about: l.about,
        standing: l.standing,
        body: canonicalJson(l),
        credential,
        created_at: at,
      });
      const last = await store.datasetVersion.latest(owner, l.about);
      if (last?.layers.includes(hash)) return { existed: !fresh, version: last };
      const version = await store.datasetVersion.add({
        id: newVersionId(),
        owner,
        about: l.about,
        parent: last?.id ?? null,
        layers: [...(last?.layers ?? []), hash],
        credential,
        created_at: at,
      });
      return { existed: !fresh, version };
    });
    touched(ctx, o.row.id, 'keep_layer');
    return {
      exploration: o.row.id,
      hash,
      about: l.about,
      existed: out.existed,
      version: versionOut(out.version),
    };
  },
});

export const listLayers = defineTool<
  { exploration: string; about?: string; hash?: string },
  object
>({
  name: 'list_layers',
  title: 'List the layers kept on the site',
  description:
    "The layers and dataset versions the project's owner keeps on the site, about one address or all, oldest first; or, with hash, that one layer whole. Any link to the project can read them.",
  input: obj(
    ['exploration'],
    { exploration: REF, about: ABOUT, hash: SHA256 },
    { additionalProperties: false },
  ),
  output: obj(['exploration'], {
    exploration: { type: 'string' },
    layers: { type: 'array', items: LAYER_SUMMARY },
    versions: { type: 'array', items: VERSION },
    layer: { type: 'object' },
  }),
  annotations: READS,
  async run({ exploration, about, hash }, ctx) {
    const store = lastingStore(ctx);
    const o = await open(ctx, exploration);
    const owner = layerOwnerOf(o.row);
    if (hash) {
      const row = await store.layer.get(owner, hash);
      if (!row) throw new ToolFailure('not_found', `No layer ${hash} in this project.`);
      return { exploration: o.row.id, layer: JSON.parse(row.body) as Layer };
    }
    return {
      exploration: o.row.id,
      layers: (await store.layer.list(owner, about)).map(summaryOf),
      versions: (await store.datasetVersion.list(owner, about)).map(versionOut),
    };
  },
});

export const forkDataset = defineTool<
  { exploration: string; version: string; add?: string[]; drop?: string[] },
  object
>({
  name: 'fork_dataset',
  title: 'Fork a dataset version',
  description:
    "A new version of a dataset from one the project's owner can see (their own, for now), with layers added (ones they keep) or dropped. It names the one it came from as its parent; that one stays as it was.",
  input: obj(
    ['exploration', 'version'],
    {
      exploration: REF,
      version: { type: 'string', minLength: 1, maxLength: 100 },
      add: { type: 'array', items: SHA256, maxItems: 50 },
      drop: { type: 'array', items: SHA256, maxItems: 50 },
    },
    { additionalProperties: false },
  ),
  output: obj(['exploration', 'version'], { exploration: { type: 'string' }, version: VERSION }),
  annotations: WRITES,
  async run({ exploration, version, add = [], drop = [] }, ctx) {
    const store = lastingStore(ctx);
    const o = await open(ctx, exploration);
    writable(o);
    const owner = layerOwnerOf(o.row);
    const parent = await store.datasetVersion.get(version);
    // a published version could be forked by anyone; none is published yet, so only one's own
    if (!parent || parent.owner !== owner) {
      throw new ToolFailure('not_found', `No version ${version} that this project can see.`);
    }
    for (const h of add) {
      const row = await store.layer.get(owner, h);
      if (!row)
        throw new ToolFailure('not_found', `No layer ${h} in this project: keep_layer it first.`);
      if (row.about !== parent.about) {
        throw new ToolFailure(
          'bad_input',
          `Layer ${h} is about ${row.about}, not ${parent.about}.`,
        );
      }
    }
    const layers = [
      ...parent.layers.filter((h) => !drop.includes(h)),
      ...add.filter((h) => !parent.layers.includes(h)),
    ];
    const made = await store.datasetVersion.add({
      id: newVersionId(),
      owner,
      about: parent.about,
      parent: parent.id,
      layers,
      credential: credentialOf(ctx, o),
      created_at: ctx.now().toISOString(),
    });
    touched(ctx, o.row.id, 'fork_dataset');
    return { exploration: o.row.id, version: versionOut(made) };
  },
});
