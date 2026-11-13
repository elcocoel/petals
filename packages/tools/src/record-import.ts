// What was on the map before the publication record (specs/005-mapping-brain/composition.md, section 2): it enters
// the record once. For each map, Petals' own rows (the readings its mapping drew, and the map's mark, value,
// proposals, payouts and vesting) as one publication by mapping.petals.near, "imported, unsigned"; and each press a
// person signed before the protocol (the published claims of 12 Nov) as that person's publication, with its own
// NEP-413 proof, whose message names the hash of what it signed. A map whose own rows changed since Petals' latest
// version of it (a re-read replaced its value, its proposals, a reading) gets the next version, its parent and
// previous that one, so the composed map follows what Petals holds now and the record keeps what it held before;
// a map unchanged is left, and so is a map petals.near has signed over the import (from then on, a press).
// scripts/publish-import.ts runs it, --dry first.
import {
  aboutKey,
  canonicalJson,
  IMPORTED_AUTHOR,
  mapOf,
  PETALS_AUTHOR,
  PUBLICATION_VERSION,
  type Publication,
  sha256Hex,
} from '@petal/core';
import type { Spec } from '@petal/core/types';
import { privateStore } from './drafts.ts';
import { retiredReading } from './hidden.ts';
import { appendPublication, recordOf } from './record.ts';
import { findSnapshot } from './tools/shared.ts';
import type { ToolContext } from './types.ts';

export interface ImportReport {
  maps: number;
  publications: {
    about: string;
    author: string;
    layers: Record<string, number>;
    signed: boolean;
  }[];
  /** maps the record holds already, left as they are */
  left: string[];
}

/** The same layers, in any order. */
const sameLayers = (a: Publication['layers'], b: Publication['layers']) =>
  a.length === b.length && new Set([...a, ...b].map((l) => l.sha256)).size === a.length;

const hashOf = (doc: unknown) => sha256Hex(canonicalJson(doc));
const kindOf = (petal: string) => petal.split('/')[0] as string;
const counts = (layers: Publication['layers']) =>
  layers.reduce<Record<string, number>>((n, l) => {
    n[kindOf(l.petal)] = (n[kindOf(l.petal)] ?? 0) + 1;
    return n;
  }, {});

/** What Petals holds for one map: each document once, by its hash, and the documents themselves. */
export interface Holding {
  layers: Publication['layers'];
  /** every layer's document, by its hash, a reading's snapshot too */
  docs: Map<string, unknown>;
}

/**
 * What Petals holds now, by map: the readings its mapping drew (not retired), each once by its snapshot's hash, and
 * the map's own rows (mark, value, proposals, payouts, vesting), each one document as it's kept. The import enters
 * them unsigned; petals.near publishes them signed, through a press (composition.md, section 2b).
 */
export async function petalsHoldings(ctx: ToolContext): Promise<Map<string, Holding>> {
  const store = privateStore(ctx.config);
  const byMap = new Map<string, Holding>();
  const add = (about: string, doc: unknown, petal: string, sha = hashOf(doc)) => {
    const key = aboutKey(about);
    const m = byMap.get(key) ?? { layers: [], docs: new Map<string, unknown>() };
    if (!m.layers.some((l) => l.sha256 === sha)) {
      m.layers.push({ sha256: sha, petal });
      m.docs.set(sha, doc);
    }
    byMap.set(key, m);
  };
  // the readings Petals' mapping drew, not retired: each reading once, by its snapshot's hash
  for (const row of await store.draft.list()) {
    if (row.made_by !== IMPORTED_AUTHOR) continue;
    const spec = JSON.parse(row.body) as Spec;
    const sha = spec.snapshot.sha256;
    if (retiredReading(sha)) continue;
    const s = await findSnapshot(ctx, sha);
    if (s) add(mapOf(s), s, s.petal, sha);
  }
  // the map's own rows, each one document as it's kept
  for (const table of [store.mark, store.value, store.proposals, store.payouts, store.vesting])
    for (const r of await table.list()) {
      const doc = JSON.parse(r.body) as { petal: string };
      add(r.about, doc, doc.petal);
    }
  return byMap;
}

export async function importRecord(
  ctx: ToolContext,
  o: { dry?: boolean } = {},
): Promise<ImportReport> {
  const store = privateStore(ctx.config);
  const at = ctx.now().toISOString();
  const record = await recordOf(ctx);
  const inRecord = new Set(
    record.map((e) => `${aboutKey(e.publication.about)}\u0000${e.publication.author}`),
  );
  // Petals' own latest version of each map, in record order
  const ownLatest = new Map(
    record
      .filter((e) => e.publication.author === IMPORTED_AUTHOR)
      .map((e) => [aboutKey(e.publication.about), e] as const),
  );
  // the maps petals.near signed over the import: from then on what Petals holds goes through a press
  const imported = new Set(
    record.filter((e) => e.publication.author === IMPORTED_AUTHOR).map((e) => e.hash),
  );
  const signed = new Set(
    record
      .filter(
        (e) =>
          e.publication.author === PETALS_AUTHOR &&
          e.publication.parent !== null &&
          imported.has(e.publication.parent),
      )
      .map((e) => aboutKey(e.publication.about)),
  );
  const byMap = await petalsHoldings(ctx);
  const report: ImportReport = { maps: byMap.size, publications: [], left: [] };
  for (const [about, held] of [...byMap].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const m = {
      layers: held.layers,
      bodies: new Map(
        [...held.docs].filter(([sha]) =>
          held.layers.some((l) => l.sha256 === sha && !l.petal.startsWith('snapshot/')),
        ),
      ),
    };
    const last = ownLatest.get(about);
    if (signed.has(about) || (last && sameLayers(last.publication.layers, m.layers))) {
      report.left.push(about);
      continue;
    }
    const p: Publication = {
      petal: PUBLICATION_VERSION,
      about,
      author: IMPORTED_AUTHOR,
      via: null,
      layers: m.layers,
      parent: last?.hash ?? null,
      previous: last?.hash ?? null,
      published_at: at,
      proof: null,
    };
    report.publications.push({
      about,
      author: IMPORTED_AUTHOR,
      layers: counts(m.layers),
      signed: false,
    });
    if (!o.dry) await appendPublication(ctx, p, m.bodies);
  }
  // presses signed before the protocol: the published claims, one press each, with the proof it was signed with
  const presses = new Map<
    string,
    { claims: Record<string, unknown>[]; credential: string | null; at: string }
  >();
  for (const a of await store.annotation.list('published')) {
    const press = presses.get(a.exploration) ?? {
      claims: [],
      credential: a.credential ?? null,
      at: a.created_at,
    };
    press.claims.push(JSON.parse(a.body) as Record<string, unknown>);
    presses.set(a.exploration, press);
  }
  for (const press of presses.values()) {
    const credential = press.credential
      ? (JSON.parse(press.credential) as {
          proof?: Record<string, string>;
          publication?: string;
        })
      : {};
    // a press since the record began is in it already, as its own publication
    if (credential.publication) continue;
    const proof = credential.proof;
    const message = proof?.message ? (JSON.parse(proof.message) as { about?: string }) : {};
    const author = String(press.claims[0]?.by ?? '');
    const about = aboutKey(message.about ?? '');
    if (!proof || !author || !about) continue;
    if (inRecord.has(`${about}\u0000${author}`)) {
      report.left.push(about);
      continue;
    }
    const claims = [...press.claims].sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
    const bodies = new Map(claims.map((c) => [hashOf(c), c] as [string, unknown]));
    const p: Publication = {
      petal: PUBLICATION_VERSION,
      about,
      author,
      via: null,
      layers: claims.map((c) => ({ sha256: hashOf(c), petal: String(c.petal) })),
      parent: null,
      previous: null,
      published_at: press.at,
      proof: {
        standard: 'nep413',
        signature: proof.signature as string,
        message: proof.message as string,
        ...(proof.public_key ? { public_key: proof.public_key } : {}),
        ...(proof.nonce ? { nonce: proof.nonce } : {}),
        ...(proof.recipient ? { recipient: proof.recipient } : {}),
      },
    };
    report.publications.push({ about, author, layers: counts(p.layers), signed: true });
    if (!o.dry) await appendPublication(ctx, p, bodies);
  }
  return report;
}
