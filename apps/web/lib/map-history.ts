// A map's history of versions, as Information's Layers says it (the server's GET /api/v1/maps/:id/record,
// composition.md): each publication in the record's own order, newest first here, with its place, its author and
// day, signed or Petals' import, what it added and dropped against its author's previous version, the version it
// came after, and its proof (the standard, the signed text, the key and the signature) so anyone can check it.
// Pure.

import { shortHash } from './map-strata.ts';

/** A publication's proof, as the record keeps it. */
export interface RecordProof {
  standard: string;
  signature: string;
  message: string;
  public_key?: string | null;
  nonce?: string | null;
  recipient?: string | null;
  manifest?: string | null;
}

/** One entry of a map's record, as GET /api/v1/maps/:id/record gives it. */
export interface RecordEntry {
  seq: number;
  appended_at?: string;
  hash: string;
  author: string;
  name?: string | null;
  signed: boolean;
  published_at: string;
  via?: string | null;
  parent?: string | null;
  previous?: string | null;
  layers?: readonly { sha256: string; petal: string }[];
  added?: readonly string[];
  dropped?: readonly string[];
  proof?: RecordProof | null;
}

export interface MapRecord {
  about: string;
  entries: readonly RecordEntry[];
}

/** A layer a version added or dropped: named by its title where it's a layer of this map, else by its hash. */
export interface HistoryLayer {
  id: string;
  title: string | null;
}

/** One version of the map, as Layers lists it. */
export interface HistoryRow {
  hash: string;
  seq: number;
  /** who published it, as people read it */
  by: string;
  signed: boolean;
  /** when it was published, in words */
  day: string;
  added: readonly HistoryLayer[];
  dropped: readonly HistoryLayer[];
  /** the version it came after, by its place in the record where it's there */
  after: { hash: string; seq: number | null } | null;
  proof: RecordProof | null;
}

export const historyWords = {
  title: 'Versions of this map',
  version: (seq: number) => `Version ${seq.toLocaleString('en-US')}`,
  by: (who: string) => `by ${who}`,
  imported: 'imported, unsigned',
  added: 'added',
  dropped: 'dropped',
  nothingNew: 'the same layers',
  after: 'after',
  first: 'the first version',
  check: (standard: string) => `How to check it: signed with ${standard}`,
  unsigned: 'Nothing signed to check: Petals imported it',
  signedText: 'Signed text',
  key: 'Key',
  signature: 'Signature',
  recipient: 'Recipient',
  nonce: 'Nonce',
  manifest: 'Manifest',
} as const;

/** 2026-11-12T… as '12 Nov 2026'. */
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** An account as people read it: a NEAR name whole, a long address at its ends. */
const accountWords = (a: string) => {
  const bare = a.split(':').at(-1) ?? a;
  return bare.length > 20 ? `${bare.slice(0, 6)}…${bare.slice(-4)}` : bare;
};

/** A version's place in the record, its parent's place where it's there, newest first, the layers named. */
export function historyOf(record: MapRecord, titles: ReadonlyMap<string, string>): HistoryRow[] {
  const seqOf = new Map(record.entries.map((e) => [e.hash, e.seq] as const));
  const named = (id: string): HistoryLayer => ({ id, title: titles.get(id) ?? null });
  return [...record.entries]
    .sort((a, b) => b.seq - a.seq)
    .map((e) => ({
      hash: e.hash,
      seq: e.seq,
      by: e.name ?? accountWords(e.author),
      signed: e.signed,
      day: day(e.published_at),
      added: (e.added ?? []).map(named),
      dropped: (e.dropped ?? []).map(named),
      after: e.parent ? { hash: e.parent, seq: seqOf.get(e.parent) ?? null } : null,
      proof: e.signed ? (e.proof ?? null) : null,
    }));
}

/** A layer or a version as the history says it: its title, else its hash by its ends. */
export const layerWords = (l: HistoryLayer) => l.title ?? shortHash(l.id);
