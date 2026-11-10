// The JSON Schemas (contracts/, draft 2020-12) as values. schema/*.json are byte copies of
// specs/001-petal-core/contracts/{common-table,petal-spec}.schema.json (T013), and view.schema.json of
// specs/006-the-map/contracts/view-v1.schema.json.
// `spec`, `interpretation`, `entry`, `entryV2` and `correction` are self-contained views of the flower
// schema: the same $defs with a different root, so any JSON Schema tool can use them alone.
import claimSchema from '../../schema/claim.schema.json' with { type: 'json' };
import flowerSchema from '../../schema/flower.schema.json' with { type: 'json' };
import layerSchema from '../../schema/layer.schema.json' with { type: 'json' };
import priceSchema from '../../schema/price.schema.json' with { type: 'json' };
import seamSchema from '../../schema/seam.schema.json' with { type: 'json' };
import snapshotSchema from '../../schema/snapshot.schema.json' with { type: 'json' };
import usageSchema from '../../schema/usage.schema.json' with { type: 'json' };
import viewSchema from '../../schema/view.schema.json' with { type: 'json' };

export const SNAPSHOT_SCHEMA_ID = 'urn:petal:schema:snapshot:v1';
export const FLOWER_SCHEMA_ID = 'urn:petal:schema:flower:v1';
export const VIEW_SCHEMA_ID = 'urn:petal:schema:view:v1';

const view = (def: 'spec' | 'interpretation' | 'entry' | 'entryV2' | 'correction'): object => ({
  ...flowerSchema,
  $id: `urn:petal:schema:${def}:v1`,
  title: `Petal ${def} v1`,
  description: `$defs.${def} of ${FLOWER_SCHEMA_ID}`,
  $ref: `#/$defs/${def}`,
});

export const schemas: {
  snapshot: object;
  spec: object;
  interpretation: object;
  entry: object;
  entryV2: object;
  correction: object;
  claim: object;
  /** the data protocol's layer (005, data.md); stored and hashed, so it refuses fields it doesn't know */
  layer: object;
  /** a person's view (006, contracts/view.md): which piece of data each dimension shows */
  view: object;
  /** what crosses from data to the look (005, seam.md): every piece of data with its kind and standing */
  seam: object;
  /** one model call, counted and charged, and NEAR AI's own bill for it (pricing-protocol.md) */
  usage: object;
  /** what Petals charges: NEAR AI's bill, plus the fees switched on times the tip, plus the protocol rate */
  price: object;
} = {
  snapshot: snapshotSchema,
  spec: view('spec'),
  interpretation: view('interpretation'),
  entry: view('entry'),
  entryV2: view('entryV2'),
  correction: view('correction'),
  claim: claimSchema,
  layer: layerSchema,
  view: viewSchema,
  seam: seamSchema,
  usage: usageSchema,
  price: priceSchema,
};

/** The two source documents, unchanged. */
export const schemaDocuments: { snapshot: object; flower: object } = {
  snapshot: snapshotSchema,
  flower: flowerSchema,
};
