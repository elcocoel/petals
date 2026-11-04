// One Ajv setup for every validator in core: draft 2020-12, strict, with formats.
// Without ajv-formats, strict Ajv throws on `format: "date-time"`.
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { schemas } from './index.ts';

// ajv-formats is CommonJS; under NodeNext its default import is module.exports, whose
// `.default` is the plugin both at runtime and in its types.
const addFormats = addFormatsModule.default;

export type SchemaName = keyof typeof schemas;

export function createAjv(): Ajv2020 {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  for (const s of Object.values(schemas)) ajv.addSchema(s);
  return ajv;
}

export function schemaId(name: SchemaName): string {
  return (schemas[name] as { $id: string }).$id;
}
