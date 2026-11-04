// `at` in get_snapshot: "latest", an ISO date or datetime, or { block_height }.
import type { At } from '@petal/core/types';
import { InputError } from '../errors.ts';

export type ParsedAt =
  | { kind: 'latest' }
  | { kind: 'block'; block_height: number }
  /** `ms` is the moment asked for: a datetime as given, a bare date as the end of that day (UTC) */
  | { kind: 'date'; ms: number; iso: string };

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export function parseAt(at: At | undefined): ParsedAt {
  if (at === undefined || at === 'latest') return { kind: 'latest' };
  if (typeof at === 'object' && at !== null) {
    const h = (at as { block_height?: unknown }).block_height;
    if (typeof h === 'number' && Number.isInteger(h) && h >= 0)
      return { kind: 'block', block_height: h };
  } else if (typeof at === 'string') {
    if (DATE_ONLY.test(at)) {
      const start = Date.parse(`${at}T00:00:00Z`);
      if (!Number.isNaN(start)) return { kind: 'date', ms: start + 86_399_000, iso: at };
    } else if (DATETIME.test(at)) {
      const ms = Date.parse(at);
      if (!Number.isNaN(ms)) return { kind: 'date', ms, iso: at };
    }
  }
  throw new InputError(
    'bad_input',
    `at must be "latest", an ISO date or { "block_height": int }, got ${JSON.stringify(at)}`,
    {
      hint: 'e.g. "latest", "2026-11-03", "2026-11-03T12:00:00Z" or { "block_height": 222915356 }',
    },
  );
}
