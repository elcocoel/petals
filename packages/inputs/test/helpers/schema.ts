// A local stand-in for validateSnapshot (W1's, still a stub): the snapshot/v1 JSON Schema with
// strict Ajv 2020 and formats, as scripts/import-spike-data.ts does, plus the row-source rule.
import { schemas } from '@petal/core';
import type { Snapshot } from '@petal/core/types';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormatsModule.default(ajv);
const validate = ajv.compile(schemas.snapshot);

/** Schema problems, then rows whose `source` is not a sources[].id. Empty when valid. */
export function snapshotProblems(s: unknown): string[] {
  if (!validate(s)) return (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
  const snap = s as Snapshot;
  const ids = new Set(snap.sources.map((x) => x.id));
  const rows = [...snap.participants, ...snap.holdings, ...snap.relationships, ...snap.events];
  return rows.filter((r) => !ids.has(r.source)).map((r) => `unknown source ${r.source}`);
}
