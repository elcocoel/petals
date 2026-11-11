// A view checked against its version's schema (specs/006-the-map/contracts/view.md), for whoever stores one:
// the server, when a person saves their own (one-source.md, step 1), and the render route. The document says
// its version, and the check picks the schema by it: view/v1 and view/v2 both read; any other is refused,
// never guessed. Apart from view/index.ts, which the site imports, so the browser doesn't carry the checker.
import { createAjv, type SchemaName, schemaId } from '../schema/ajv.ts';
import type { View } from '../types/index.ts';

const BY_VERSION: Record<string, SchemaName> = { 'view/v1': 'view', 'view/v2': 'viewV2' };
let ajv: ReturnType<typeof createAjv> | undefined;

/** Null when it's a valid view/v1 or view/v2; otherwise why not, in a line. */
export function viewProblem(x: unknown): string | null {
  const petal = (x as { petal?: unknown } | null)?.petal;
  const name = typeof petal === 'string' ? BY_VERSION[petal] : undefined;
  if (!name) return `the view's petal is ${JSON.stringify(petal ?? null)}, not view/v1 or view/v2`;
  ajv ??= createAjv();
  const compiled = ajv.getSchema(schemaId(name));
  if (!compiled) throw new Error(`${name} schema not registered`);
  if (compiled(x)) return null;
  const e = compiled.errors?.[0];
  const p = e?.params as { additionalProperty?: string } | undefined;
  return `${e?.instancePath || 'the view'} ${p?.additionalProperty ? `has an unknown field: ${p.additionalProperty}` : (e?.message ?? 'is not valid')}`;
}

export const isView = (x: unknown): x is View => viewProblem(x) === null;
