// The protocols' check (specs/protocols.md): every format is a JSON Schema with a versioned id, at least one
// fixture of it is pinned by the hash of its canonical JSON, every fixture validates, every pin matches, and a
// version that was ever pinned keeps its schema, so old documents stay readable.
//   node scripts/check-protocols.ts            exits 1 and says why when anything is off
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, schemas, sha256Hex } from '@petal/core';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

const addFormats = addFormatsModule as unknown as (a: Ajv2020) => Ajv2020;
export const SCHEMA_DIR = join(import.meta.dirname, '..', 'packages', 'core', 'schema');
const ID = /^urn:petal:schema:[A-Za-z0-9-]+:v\d+$/;

interface Pin {
  schema: string;
  sha256: string;
}

/** What's wrong with the formats in `dir`; empty when they hold. */
export function protocolProblems(
  dir: string = SCHEMA_DIR,
  registry: Record<string, object> = schemas,
): string[] {
  const problems: string[] = [];
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const ids: string[] = [];
  for (const [name, s] of Object.entries(registry)) {
    const id = (s as { $id?: unknown }).$id;
    if (typeof id !== 'string' || !ID.test(id)) {
      problems.push(`${name}: its $id ${String(id)} isn't urn:petal:schema:<name>:vN`);
      continue;
    }
    ids.push(id);
    ajv.addSchema(s);
  }
  const pins = JSON.parse(readFileSync(join(dir, 'pins.json'), 'utf8')) as Record<string, Pin>;
  const pinned = new Set(Object.values(pins).map((p) => p.schema));
  for (const id of ids) if (!pinned.has(id)) problems.push(`${id} has no pinned fixture`);
  for (const [file, pin] of Object.entries(pins)) {
    if (!ids.includes(pin.schema)) {
      problems.push(
        `${file}: its schema ${pin.schema} is gone, and a pinned version stays readable`,
      );
      continue;
    }
    let doc: unknown;
    try {
      doc = JSON.parse(readFileSync(join(dir, 'fixtures', file), 'utf8'));
    } catch (e) {
      problems.push(`${file}: can't be read (${(e as Error).message})`);
      continue;
    }
    const validate = ajv.getSchema(pin.schema);
    if (validate && !validate(doc)) {
      problems.push(`${file}: isn't a valid ${pin.schema}: ${ajv.errorsText(validate.errors)}`);
    }
    const hash = sha256Hex(canonicalJson(doc));
    if (hash !== pin.sha256) problems.push(`${file}: its hash is ${hash}, pinned ${pin.sha256}`);
  }
  for (const file of readdirSync(join(dir, 'fixtures'))) {
    if (file.endsWith('.json') && !pins[file]) problems.push(`fixtures/${file} isn't pinned`);
  }
  return problems;
}

if (import.meta.main) {
  const problems = protocolProblems();
  if (problems.length) {
    for (const p of problems) console.error(`protocols: ${p}`);
    process.exit(1);
  }
  console.log(`protocols: ${Object.keys(schemas).length} formats, each pinned and valid`);
}
