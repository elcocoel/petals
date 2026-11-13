// The JSON Schemas (contracts/, draft 2020-12) as values. schema/*.json are byte copies of
// specs/001-petal-core/contracts/{common-table,petal-spec}.schema.json (T013), and view.schema.json and
// view-v2.schema.json of specs/006-the-map/contracts/view-v1.schema.json and view-v2.schema.json.
// `spec`, `interpretation`, `entry`, `entryV2` and `correction` are self-contained views of the flower
// schema: the same $defs with a different root, so any JSON Schema tool can use them alone.

import brainReceiptSchema from '../../schema/brain-receipt.schema.json' with { type: 'json' };
import callsSchema from '../../schema/calls-v1.schema.json' with { type: 'json' };
import claimSchema from '../../schema/claim.schema.json' with { type: 'json' };
import claimV2Schema from '../../schema/claim-v2.schema.json' with { type: 'json' };
import claimV3Schema from '../../schema/claim-v3.schema.json' with { type: 'json' };
import claimV4Schema from '../../schema/claim-v4.schema.json' with { type: 'json' };
import creditSchema from '../../schema/credit.schema.json' with { type: 'json' };
import flowerSchema from '../../schema/flower.schema.json' with { type: 'json' };
import layerSchema from '../../schema/layer.schema.json' with { type: 'json' };
import markSchema from '../../schema/mark.schema.json' with { type: 'json' };
import markV2Schema from '../../schema/mark-v2.schema.json' with { type: 'json' };
import payoutsSchema from '../../schema/payouts.schema.json' with { type: 'json' };
import priceSchema from '../../schema/price.schema.json' with { type: 'json' };
import priceV2Schema from '../../schema/price-v2.schema.json' with { type: 'json' };
import proposalsSchema from '../../schema/proposals.schema.json' with { type: 'json' };
import proposalsV2Schema from '../../schema/proposals-v2.schema.json' with { type: 'json' };
import proposalsV3Schema from '../../schema/proposals-v3.schema.json' with { type: 'json' };
import publicationSchema from '../../schema/publication.schema.json' with { type: 'json' };
import seamSchema from '../../schema/seam.schema.json' with { type: 'json' };
import snapshotSchema from '../../schema/snapshot.schema.json' with { type: 'json' };
import usageSchema from '../../schema/usage.schema.json' with { type: 'json' };
import valueSchema from '../../schema/value.schema.json' with { type: 'json' };
import valueV2Schema from '../../schema/value-v2.schema.json' with { type: 'json' };
import valueV3Schema from '../../schema/value-v3.schema.json' with { type: 'json' };
import vestingSchema from '../../schema/vesting.schema.json' with { type: 'json' };
import viewSchema from '../../schema/view.schema.json' with { type: 'json' };
import viewV2Schema from '../../schema/view-v2.schema.json' with { type: 'json' };
import viewV3Schema from '../../schema/view-v3.schema.json' with { type: 'json' };

export const SNAPSHOT_SCHEMA_ID = 'urn:petal:schema:snapshot:v1';
export const FLOWER_SCHEMA_ID = 'urn:petal:schema:flower:v1';
export const VIEW_SCHEMA_ID = 'urn:petal:schema:view:v1';
export const VIEW_V2_SCHEMA_ID = 'urn:petal:schema:view:v2';
export const VIEW_V3_SCHEMA_ID = 'urn:petal:schema:view:v3';

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
  /** a claim, and what a person or an agent adds about an account: names, notes, links */
  claimV2: object;
  /** a claim whose every piece of evidence says what it is, who found it and when (11 Nov) */
  claimV3: object;
  /** claim/v3 with one more verb, is_a: an account's type, in any word (11 Nov) */
  claimV4: object;
  /** the data protocol's layer (005, data.md); stored and hashed, so it refuses fields it doesn't know */
  layer: object;
  /** a person's view (006, contracts/view.md): which piece of data each dimension shows */
  view: object;
  /** the same, with labels: which piece of data names each petal (view/v2, which v1 reads as) */
  viewV2: object;
  /** the same, with colour's keys: which key each value takes, as the person chose it (view/v3, 12 Nov) */
  viewV3: object;
  /** what crosses from data to the look (005, seam.md): every piece of data with its kind and standing */
  seam: object;
  /** one model call, counted and charged, and NEAR AI's own bill for it */
  usage: object;
  /** one serving of the brain's text by a door, the Harness's access log field for field (12 Nov) */
  brainReceipt: object;
  /** what Petals charges: NEAR AI's bill, plus the fees switched on times the tip, plus the protocol rate */
  price: object;
  /** what a person pays: NEAR AI's bill, plus a base fee, plus their own tip (price/v2, which replaces v1) */
  priceV2: object;
  /** what tells one organisation on the map from another: its name, symbol and logo, each with where it came from */
  mark: object;
  /** the same, with its types as is_a claims */
  markV2: object;
  /** a map's token in dollars, its supply, and its reading's totals at that price */
  value: object;
  valueV2: object;
  /** the same with the token's circulating supply, its max and its market cap, each naming its source (12 Nov) */
  valueV3: object;
  calls: object;
  /** a DAO's proposals and each account's vote on each */
  proposals: object;
  /** the same with closed, recipients, options, and a ballot's choices and weights (11 Nov) */
  proposalsV2: object;
  /** the same with each proposal's summary and a link to read it, saying what kind of link (12 Nov) */
  proposalsV3: object;
  /** what a DAO paid out, each payout dated by its own transfer and priced on that day (12 Nov) */
  payouts: object;
  /** a token's vesting schedules, one allocation each, each saying how it's known (12 Nov) */
  vesting: object;
  /** an author signing one version of their dataset for a map: the record's entry (13 Nov) */
  publication: object;
  /** one author's credit and points, computed from the record alone (13 Nov) */
  credit: object;
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
  claimV4: claimV4Schema,
  layer: layerSchema,
  view: viewSchema,
  viewV2: viewV2Schema,
  viewV3: viewV3Schema,
  seam: seamSchema,
  usage: usageSchema,
  brainReceipt: brainReceiptSchema,
  price: priceSchema,
  priceV2: priceV2Schema,
  mark: markSchema,
  markV2: markV2Schema,
  value: valueSchema,
  valueV2: valueV2Schema,
  valueV3: valueV3Schema,
  calls: callsSchema,
  proposals: proposalsSchema,
  proposalsV2: proposalsV2Schema,
  proposalsV3: proposalsV3Schema,
  payouts: payoutsSchema,
  vesting: vestingSchema,
  publication: publicationSchema,
  credit: creditSchema,
};

/** The two source documents, unchanged. */
export const schemaDocuments: { snapshot: object; flower: object } = {
  snapshot: snapshotSchema,
  flower: flowerSchema,
};
