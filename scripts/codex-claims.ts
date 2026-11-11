// Codex's research into who is behind RaidGuild's addresses (Elco's test, 10 Nov), as claim/v3 annotations:
// one `named` claim/v3 a row. A row whose proposal names the address is sourced, with its transaction, proposal
// and quote; a row Codex worked out is inferred, from research. The CSV stays on the person's computer and
// out of the repo: names are kept in a person's own project only (people.ts, decision 1 (a)). Run from build/:
//   node scripts/codex-claims.ts --csv <address-name-claims.csv> --by near:mainnet:<account> [--out <claims.json>]
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { accountRef, type Claim, makeClaim, proposalRef, validateClaim } from '@petal/core';

/** RaidGuild's DAO, a Baal on Gnosis, as Codex's report names it. */
export const RAIDGUILD = { chain: 'eip155:100', dao: '0xf02fd4286917270cb94fbc13a0f4e1ed76f7e986' };
const VIA = 'tool:codex@2026-11-10';
const METHOD = 'codex/research@2026-11-10';

/** RFC 4180: quoted fields may hold commas, quotes ("") and line breaks. */
export function csvRows(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) rows.push([...row, field]);
  const [head = [], ...body] = rows.filter((r) => r.some((f) => f !== ''));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

/** One row of Codex's CSV as a claim, or why it can't be one. */
export function claimOfRow(
  row: Record<string, string>,
  by: string,
  at: string,
): { claim: Claim } | { error: string } {
  const subject = accountRef(RAIDGUILD.chain, row.address ?? '');
  if (!subject) return { error: `not an address on ${RAIDGUILD.chain}: ${row.address}` };
  const proposal = row.proposal
    ? proposalRef(RAIDGUILD.chain, `${RAIDGUILD.dao}:${row.proposal}`)
    : null;
  // the proposal Codex read, with its transaction, its page and its words: found by Codex, when it wrote
  const evidence = {
    type: proposal ? ('proposal' as const) : row.transaction ? ('tx' as const) : ('page' as const),
    found_by: VIA,
    found_at: at,
    ...(row.quote_source ? { url: row.quote_source } : {}),
    ...(row.transaction ? { tx: `${RAIDGUILD.chain}:${row.transaction.toLowerCase()}` } : {}),
    ...(proposal ? { proposal } : {}),
    ...(row.quote ? { quote: row.quote } : {}),
    note: [row.basis, row.status && `Proposal ${row.status}.`].filter(Boolean).join(' '),
  };
  const inferred = row.link === 'inferred';
  return {
    claim: makeClaim(
      {
        subject,
        verb: 'named',
        object: { value: (row.name ?? '').trim() },
        ...(inferred ? { qualifiers: { grounds: 'research' }, method: METHOD } : {}),
        issued_at: at,
        kind: inferred ? 'inferred' : 'sourced',
        evidence: [evidence],
        by,
        via: VIA,
      },
      'claim/v3',
    ),
  };
}

/** Every row as a claim kept in a person's own project, and the reasons for any that can't be. */
export function codexClaims(csv: string, by: string, at: string) {
  const claims: Claim[] = [];
  const refused: { row: number; name: string; why: string[] }[] = [];
  for (const [i, row] of csvRows(csv).entries()) {
    const made = claimOfRow(row, by, at);
    if ('error' in made) {
      refused.push({ row: i + 1, name: row.name ?? '', why: [made.error] });
      continue;
    }
    const v = validateClaim(made.claim, { private: true });
    if (v.ok) claims.push(made.claim);
    else
      refused.push({
        row: i + 1,
        name: row.name ?? '',
        why: v.errors.map((e) => `${e.path} ${e.message}`),
      });
  }
  return { claims, refused };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: { csv: { type: 'string' }, by: { type: 'string' }, out: { type: 'string' } },
  });
  if (!values.csv || !values.by) {
    console.error(
      'usage: --csv <address-name-claims.csv> --by near:mainnet:<account> [--out <claims.json>]',
    );
    process.exit(1);
  }
  // when it was said: when Codex wrote the file, so the same file gives the same ids
  const at = `${statSync(values.csv).mtime.toISOString().slice(0, 19)}Z`;
  const { claims, refused } = codexClaims(readFileSync(values.csv, 'utf8'), values.by, at);
  const kinds = claims.reduce<Record<string, number>>(
    (n, c) => ({ ...n, [c.kind]: (n[c.kind] ?? 0) + 1 }),
    {},
  );
  console.log(
    `${claims.length} of ${claims.length + refused.length} rows pass as claim/v3, kept in a person's own project: ${Object.entries(
      kinds,
    )
      .map(([k, n]) => `${n} ${k}`)
      .join(', ')}`,
  );
  for (const r of refused) console.log(`  row ${r.row} (${r.name}): ${r.why.join('; ')}`);
  if (values.out) writeFileSync(values.out, `${JSON.stringify(claims, null, 2)}\n`);
  if (refused.length) process.exitCode = 1;
}
