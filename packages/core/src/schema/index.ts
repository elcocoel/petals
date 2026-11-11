// The JSON Schemas (contracts/, draft 2020-12) as values. schema/*.json are byte copies of
// specs/001-petal-core/contracts/{common-table,petal-spec}.schema.json (T013), and view.schema.json and
// view-v2.schema.json of specs/006-the-map/contracts/view-v1.schema.json and view-v2.schema.json.
// `spec`, `interpretation`, `entry`, `entryV2` and `correction` are self-contained views of the flower
// schema: the same $defs with a different root, so any JSON Schema tool can use them alone.
import claimSchema from '../../schema/claim.schema.json' with { type: 'json' };
import claimV2Schema from '../../schema/claim-v2.schema.json' with { type: 'json' };
import claimV3Schema from '../../schema/claim-v3.schema.json' with { type: 'json' };
import flowerSchema from '../../schema/flower.schema.json' with { type: 'json' };
import layerSchema from '../../schema/layer.schema.json' with { type: 'json' };
import markSchema from '../../schema/mark.schema.json' with { type: 'json' };
import priceSchema from '../../schema/price.schema.json' with { type: 'json' };
import priceV2Schema from '../../schema/price-v2.schema.json' with { type: 'json' };
import proposalsSchema from '../../schema/proposals.schema.json' with { type: 'json' };
import seamSchema from '../../schema/seam.schema.json' with { type: 'json' };
import snapshotSchema from '../../schema/snapshot.schema.json' with { type: 'json' };
import usageSchema from '../../schema/usage.schema.json' with { type: 'json' };
import valueSchema from '../../schema/value.schema.json' with { type: 'json' };
import viewSchema from '../../schema/view.schema.json' with { type: 'json' };
import viewV2Schema from '../../schema/view-v2.schema.json' with { type: 'json' };

export const SNAPSHOT_SCHEMA_ID = 'urn:petal:schema:snapshot:v1';
export const FLOWER_SCHEMA_ID = 'urn:petal:schema:flower:v1';
export const VIEW_SCHEMA_ID = 'urn:petal:schema:view:v1';
export const VIEW_V2_SCHEMA_ID = 'urn:petal:schema:view:v2';

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
  /** a claim, and what a person or an agent adds about an account: names, notes, links (annotation-layer.md) */
  claimV2: object;
  /** a claim whose every piece of evidence says what it is, who found it and when (11 Nov) */
  claimV3: object;
  /** the data protocol's layer (005, data.md); stored and hashed, so it refuses fields it doesn't know */
  layer: object;
  /** a person's view (006, contracts/view.md): which piece of data each dimension shows */
  view: object;
  /** the same, with labels: which piece of data names each petal (view/v2, which v1 reads as) */
  viewV2: object;
  /** what crosses from data to the look (005, seam.md): every piece of data with its kind and standing */
  seam: object;
  /** one model call, counted and charged, and NEAR AI's own bill for it (pricing-protocol.md) */
  usage: object;
  /** what Petals charges: NEAR AI's bill, plus the fees switched on times the tip, plus the protocol rate */
  price: object;
  /** what a person pays: NEAR AI's bill, plus a base fee, plus their own tip (price/v2, which replaces v1) */
  priceV2: object;
  /** what tells one organisation on the map from another: its name, symbol and logo, each with where it came from (#85) */
  mark: object;
  /** a map's token in dollars, its supply, and its reading's totals at that price (#91) */
  value: object;
  /** a DAO's proposals and each account's vote on each (#93) */
  proposals: object;
} = {
  snapshot: snapshotSchema,
  spec: view('spec'),
  interpretation: view('interpretation'),
  entry: view('entry'),
  entryV2: view('entryV2'),
  correction: view('correction'),
  claim: claimSchema,
  claimV2: claimV2Schema,
  claimV3: claimV3Schema,
  layer: layerSchema,
  view: viewSchema,
  viewV2: viewV2Schema,
  seam: seamSchema,
  usage: usageSchema,
  price: priceSchema,
  priceV2: priceV2Schema,
  mark: markSchema,
  value: valueSchema,
  proposals: proposalsSchema,
};

/** The two source documents, unchanged. */
export const schemaDocuments: { snapshot: object; flower: object } = {
  snapshot: snapshotSchema,
  flower: flowerSchema,
};
