// validateSnapshot (data-model.md, Snapshot rules): the schema, then the rules the schema cannot
// say. "Every row's `source` matches a `sources[].id`. Every row has a date." `group` rows carry
// `count`, and grouping is allowed only when declared in `coverage.grouped[]`.
import { createAjv, schemaId } from '../schema/ajv.ts';
import type { Result, Snapshot, ValidationIssue } from '../types/index.ts';

/** Stop collecting after this many problems: a broken 6 MB snapshot would list thousands. */
export const MAX_ISSUES = 100;

let compiled: ReturnType<ReturnType<typeof createAjv>['getSchema']> | undefined;
function schemaValidator() {
  if (!compiled) compiled = createAjv().getSchema(schemaId('snapshot'));
  if (!compiled) throw new Error('snapshot schema not registered');
  return compiled;
}

// the schema checks the format (date-time); this checks the date is there at all
const dated = (d: unknown): boolean => typeof d === 'string' && d.length > 0;

export function validateSnapshot(x: unknown): Result<Snapshot> {
  const v = schemaValidator();
  if (!v(x)) {
    const errors = (v.errors ?? []).slice(0, MAX_ISSUES).map(
      (e): ValidationIssue => ({
        path: e.instancePath,
        rule: 'schema',
        message: `${e.message ?? 'invalid'}${e.params && 'additionalProperty' in e.params ? `: ${String(e.params.additionalProperty)}` : ''}`,
      }),
    );
    return { ok: false, errors };
  }
  const s = x as Snapshot;
  const errors: ValidationIssue[] = [];
  const add = (path: string, rule: string, message: string) => {
    if (errors.length < MAX_ISSUES) errors.push({ path, rule, message });
  };

  const sources = new Set(s.sources.map((src) => src.id));
  if (sources.size !== s.sources.length) add('/sources', 'unique_ids', 'source ids repeat');

  const ids = new Set<string>();
  s.participants.forEach((p, i) => {
    if (ids.has(p.id)) add(`/participants/${i}/id`, 'unique_ids', `participant ${p.id} repeats`);
    ids.add(p.id);
  });

  const tables = [
    ['participants', s.participants],
    ['holdings', s.holdings],
    ['relationships', s.relationships],
    ['events', s.events],
  ] as const;
  for (const [name, rows] of tables)
    rows.forEach((row, i) => {
      if (!sources.has(row.source))
        add(`/${name}/${i}/source`, 'source', `source ${row.source} is not in sources[]`);
    });

  // every row has a date (participants are timeless: they are dated by the rows that cite them)
  if (!dated(s.snapshot.as_of)) add('/snapshot/as_of', 'date', 'the snapshot has no date');
  s.holdings.forEach((h, i) => {
    if (!dated(h.as_of)) add(`/holdings/${i}/as_of`, 'date', 'holding has no date');
  });
  s.relationships.forEach((r, i) => {
    if (!dated(r.as_of)) add(`/relationships/${i}/as_of`, 'date', 'relationship has no date');
  });
  s.events.forEach((e, i) => {
    if (!dated(e.at)) add(`/events/${i}/at`, 'date', 'event has no date');
  });

  // rows point at participants that exist (relationships may point *to* non-participants, such
  // as a proposal id)
  s.holdings.forEach((h, i) => {
    if (!ids.has(h.participant))
      add(`/holdings/${i}/participant`, 'reference', `no participant ${h.participant}`);
  });
  s.relationships.forEach((r, i) => {
    if (!ids.has(r.from)) add(`/relationships/${i}/from`, 'reference', `no participant ${r.from}`);
  });

  let groups = 0;
  s.participants.forEach((p, i) => {
    if (p.kind === 'group') {
      groups++;
      if (p.count === undefined)
        add(`/participants/${i}/count`, 'group_count', 'a group row must say how many it folds');
    } else if (p.count !== undefined) {
      add(`/participants/${i}/count`, 'group_count', 'only group rows carry count');
    }
  });
  if (groups > 0 && (s.coverage.grouped ?? []).length === 0)
    add(
      '/coverage/grouped',
      'grouping',
      `${groups} group rows, but no grouping is declared in coverage.grouped`,
    );

  return errors.length ? { ok: false, errors } : { ok: true, value: s };
}
