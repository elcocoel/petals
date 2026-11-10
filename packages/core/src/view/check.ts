// A view checked against view/v1 (specs/006-the-map/contracts/view.md), for whoever stores one: the server,
// when a person saves their own (one-source.md, step 1). Apart from view/index.ts, which the site imports,
// so the browser doesn't carry the schema checker.
import { createAjv, schemaId } from '../schema/ajv.ts';
import type { View } from '../types/index.ts';

let compiled: ReturnType<ReturnType<typeof createAjv>['getSchema']> | undefined;

/** Null when it's a valid view/v1; otherwise why not, in a line. */
export function viewProblem(x: unknown): string | null {
  compiled ??= createAjv().getSchema(schemaId('view'));
  if (!compiled) throw new Error('view schema not registered');
  if (compiled(x)) return null;
  const e = compiled.errors?.[0];
  const p = e?.params as { additionalProperty?: string } | undefined;
  return `${e?.instancePath || 'the view'} ${p?.additionalProperty ? `has an unknown field: ${p.additionalProperty}` : (e?.message ?? 'is not valid')}`;
}

export const isView = (x: unknown): x is View => viewProblem(x) === null;
