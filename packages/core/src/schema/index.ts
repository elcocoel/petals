// The JSON Schemas (contracts/, draft 2020-12) as values. schema/*.json are byte copies of
// specs/001-petal-core/contracts/{common-table,petal-spec}.schema.json (T013).
// `spec`, `interpretation`, `entry`, `entryV2` and `correction` are self-contained views of the flower
// schema: the same $defs with a different root, so any JSON Schema tool can use them alone.
import flowerSchema from '../../schema/flower.schema.json' with { type: 'json' };
import snapshotSchema from '../../schema/snapshot.schema.json' with { type: 'json' };

export const SNAPSHOT_SCHEMA_ID = 'urn:petal:schema:snapshot:v1';
export const FLOWER_SCHEMA_ID = 'urn:petal:schema:flower:v1';

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
} = {
  snapshot: snapshotSchema,
  spec: view('spec'),
  interpretation: view('interpretation'),
  entry: view('entry'),
  entryV2: view('entryV2'),
  correction: view('correction'),
};

/** The two source documents, unchanged. */
export const schemaDocuments: { snapshot: object; flower: object } = {
  snapshot: snapshotSchema,
  flower: flowerSchema,
};
