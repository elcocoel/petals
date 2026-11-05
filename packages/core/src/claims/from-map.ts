// claimsFromMap: labels and corrections already on the map, read as claims (open question 16).
// Nothing on the map is rewritten, and no text is copied: a label's value and a correction's reason
// can hold a person's name, so they stay on their row, read at draw time (people.ts). The claim says
// that the row exists, who wrote it and how it can be checked, and points back at the row.
import { createAjv, schemaId } from '../schema/ajv.ts';
import type { Identity, MapRow } from '../types/index.ts';
import { accountRef } from './refs.ts';
import type { Claim, ClaimDraft, ClaimEvidence, ClaimKind, EntityRef } from './types.ts';
import { makeClaim, validateClaim } from './validate.ts';

export interface MapRead {
  claims: Claim[];
  /** Label and correction rows that can't be claims, with why. They stay valid on the map. */
  skipped: { key: string; why: string }[];
}

/**
 * What an identity status means as a kind, and it isn't one for one:
 * - `verified` is a writer's word that they checked a source, so it's `sourced`, never `observed`.
 * - `inferred` is `inferred`.
 * - `self-declared` is `declared` only when the account itself wrote the row. From anyone else it's
 *   a report of what the account said, so it's `sourced`. Stored snapshots show why this matters:
 *   Moloch's self-declared names come from proposal text, which the member may not have written.
 */
export function kindOfIdentityStatus(
  status: Identity['status'],
  writerIsSubject: boolean,
): ClaimKind {
  if (status === 'inferred') return 'inferred';
  return status === 'self-declared' && writerIsSubject ? 'declared' : 'sourced';
}

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

const nearChain = (receiver: string) =>
  receiver.endsWith('.testnet') ? 'near:testnet' : 'near:mainnet';

/** Outside URLs only: a row's own notes are free text and stay on the row. */
function outsideEvidence(evidence: unknown): ClaimEvidence[] {
  if (!Array.isArray(evidence)) return [];
  return evidence.flatMap((e): ClaimEvidence[] =>
    isObject(e) && typeof e.url === 'string' && /^https?:\/\//.test(e.url) ? [{ url: e.url }] : [],
  );
}

/** Where a reader finds the row's text. */
const rowPointer = (row: MapRow): ClaimEvidence => ({
  url: `fastdata://${row.receiver}/${row.writer}/${row.key}`,
});

const STATUSES: readonly unknown[] = ['self-declared', 'verified', 'inferred'];

function fromLabel(row: MapRow): ClaimDraft | string {
  const [, , , caip2 = '', address = ''] = row.key.split('/');
  const subject = accountRef(caip2, address);
  if (subject === null) return `"${caip2}/${address}" is not an account`;
  const v = row.value;
  if (!isObject(v) || typeof v.tag !== 'string' || typeof v.written_at !== 'string')
    return 'not a label row';
  if (!STATUSES.includes(v.status)) return 'its status is not one this version knows';

  const by = accountRef(nearChain(row.receiver), row.writer);
  if (by === null) return `the writer "${row.writer}" is not an account`;
  const kind = kindOfIdentityStatus(v.status as Identity['status'], by === subject);
  const inferred: Pick<ClaimDraft, 'method'> & { grounds?: string } = {};
  if (kind === 'inferred') {
    if (typeof v.method !== 'string' || typeof v.grounds !== 'string')
      return 'an inferred label needs a stated method and grounds, and this row has none';
    inferred.method = v.method;
    inferred.grounds = v.grounds;
  }
  return {
    subject,
    verb: 'labelled',
    object: { value: v.tag },
    ...(inferred.grounds === undefined ? {} : { qualifiers: { grounds: inferred.grounds } }),
    ...(inferred.method === undefined ? {} : { method: inferred.method }),
    issued_at: v.written_at,
    kind,
    evidence: [...outsideEvidence(v.evidence), rowPointer(row)],
    by,
    proof: { type: 'tx', hash: row.tx_hash },
  };
}

let correctionSchema: ReturnType<ReturnType<typeof createAjv>['getSchema']> | undefined;
function isCorrection(x: unknown): boolean {
  if (!correctionSchema) correctionSchema = createAjv().getSchema(schemaId('correction'));
  return correctionSchema?.(x) === true;
}

function fromCorrection(row: MapRow): ClaimDraft | string {
  if (!isCorrection(row.value)) return 'not a correction row';
  const v = row.value as {
    id: string;
    flower_id: string;
    target: { caip2: string; address: string };
    request: 'correct' | 'remove';
    evidence?: unknown;
    requester: string;
    proof: { type: 'nep413'; account_id: string } & Record<string, string>;
    written_at: string;
  };
  if (v.proof.account_id !== v.requester) return 'its proof is not from its requester';
  const subject: EntityRef | null = accountRef(nearChain(row.receiver), v.requester);
  if (subject === null) return `the requester "${v.requester}" is not an account`;
  const object = accountRef(v.target.caip2, v.target.address);
  if (object === null) return `"${v.target.caip2}/${v.target.address}" is not an account`;
  return {
    subject,
    verb: 'requests_correction',
    object,
    qualifiers: { request: v.request, flower_id: v.flower_id, correction_id: v.id },
    issued_at: v.written_at,
    kind: 'declared',
    evidence: [...outsideEvidence(v.evidence), rowPointer(row)],
    by: subject,
    // It proves the request as written on the map, not this reading of it.
    proof: v.proof as unknown as NonNullable<ClaimDraft['proof']>,
  };
}

/** Reads label and correction rows. Other rows on the map aren't claims, and are passed over. */
export function claimsFromMap(rows: readonly MapRow[]): MapRead {
  const claims = new Map<string, Claim>();
  const skipped: MapRead['skipped'] = [];
  for (const row of rows) {
    const folder = row.key.split('/')[2];
    if (folder !== 'label' && folder !== 'correction') continue;
    const draft = folder === 'label' ? fromLabel(row) : fromCorrection(row);
    if (typeof draft === 'string') {
      skipped.push({ key: row.key, why: draft });
      continue;
    }
    const checked = validateClaim(makeClaim(draft));
    if (!checked.ok) {
      const why = checked.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
      skipped.push({ key: row.key, why });
    } else if (!claims.has(checked.value.id)) {
      claims.set(checked.value.id, checked.value);
    }
  }
  return { claims: [...claims.values()], skipped };
}
