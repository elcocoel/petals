// seam/v1 (specs/005-mapping-brain/seam.md; systems check, step 2): what crosses from the data side to the
// look, as one typed document. It names an address, the layers it was made from, the participants, and each
// piece of data with its kind, its standing and the layer it came from. The look reads it and draws; it never
// computes data, so whatever a dimension shows (a share, a kind of account, a petal's backers) is in here
// already. A view (view/v1) names these pieces by name.
import { canonicalJson, sha256Hex } from './hash.ts';
import { type Added, LayerError, type MeasureKind, type Standing } from './layers.ts';
import type { Snapshot } from './types/index.ts';

export const SEAM_DOCUMENT_VERSION = 'seam/v1';

/**
 * The kinds a piece of data can be, the contract both sides share (seam.md, "The one rule"): a layer's five
 * (amount, count, share, category, flag), and date, parts (a petal cut into what it's made of) and relation
 * (petal to petal). Adding one is seam/v2.
 */
export type DataKind = MeasureKind | 'date' | 'parts' | 'relation';
export const DATA_KINDS: readonly DataKind[] = [
  'amount',
  'count',
  'share',
  'category',
  'flag',
  'date',
  'parts',
  'relation',
];

interface PieceBase {
  name: string;
  unit: string;
  label?: string;
  standing: Standing;
  /** the layer or reading it came from, by hash */
  layer: string;
  as_of: string;
}
export type SeamPiece =
  | (PieceBase & {
      kind: Exclude<DataKind, 'parts' | 'relation'>;
      values: { participant: string; value: string }[];
    })
  | (PieceBase & { kind: 'parts'; parts: { participant: string; part: string; value: string }[] })
  | (PieceBase & { kind: 'relation'; lines: { from: string; to: string; value: string }[] });

export interface Seam {
  petal: typeof SEAM_DOCUMENT_VERSION;
  about: string;
  /** the reading first, then each layer: the dataset's version */
  layers: string[];
  participants: string[];
  data: SeamPiece[];
  dates: string[];
  coverage: { participants: number; partial: boolean };
}

/** The address parameters a reader is asked for, in the order one is taken as what the reading is about. */
const ADDRESS_PARAMS = ['dao', 'token', 'mint', 'contract', 'address', 'account'] as const;

/**
 * What a reading is about, as `chain:address`: its chain and the address it was asked for (a DAO, a token, a
 * mint), or its chain and its population when it reads a whole network (validators).
 */
export function aboutOf(s: Snapshot): string {
  const params = (s.network.params ?? {}) as Record<string, unknown>;
  const address = ADDRESS_PARAMS.map((k) => params[k]).find((v) => typeof v === 'string' && v);
  return `${s.network.chain}:${address ?? s.network.population}`;
}

/** An address in one form: an EVM address in any case is one address, so it's written in lower case. */
export const aboutKey = (about: string) =>
  /:0x[0-9a-fA-F]{40}$/.test(about) ? about.toLowerCase() : about;

/** Two addresses the same. */
export const sameAbout = (a: string, b: string) => a === b || aboutKey(a) === aboutKey(b);

/**
 * The map a reading belongs to (Elco, 10 Nov: "maps that map the same address need to come together as
 * versions of the same map"): its address, in one form. Every drawing of every reading of it is on that map.
 */
export const mapOf = (s: Snapshot): string => aboutKey(aboutOf(s));

/** A share of a total, as decimal text with nine places at most. */
function shareOf(part: number, total: number): string {
  if (!(total > 0)) return '0';
  return (part / total).toFixed(9).replace(/\.?0+$/, '') || '0';
}

/**
 * The seam document for a reading and the layers added to it. Each layer, and each added reading, must be
 * about the same address as the base; a name may come from one source only.
 */
export function seamOf(base: Snapshot, baseHash: string, added: readonly Added[]): Seam {
  const about = aboutOf(base);
  const at = base.snapshot.as_of;
  const data: SeamPiece[] = [];
  const names = new Set<string>();
  const push = (p: SeamPiece) => {
    if (names.has(p.name))
      throw new LayerError(`${p.name} comes from two places; a seam takes each name from one`);
    names.add(p.name);
    data.push(p);
  };
  const reading = { standing: 'verified' as const, layer: baseHash, as_of: at };

  // the reading's own data: each holding by its own name, and the main one as `amount`, with its share
  const byMeasure = new Map<string, { unit: string; per: Map<string, number> }>();
  for (const h of base.holdings) {
    const m = byMeasure.get(h.measure) ?? { unit: h.unit, per: new Map<string, number>() };
    m.per.set(h.participant, (m.per.get(h.participant) ?? 0) + Number(h.amount));
    byMeasure.set(h.measure, m);
  }
  const values = (per: Map<string, number>) =>
    [...per].map(([participant, v]) => ({ participant, value: String(v) }));
  for (const [name, m] of byMeasure)
    push({ name, kind: 'amount', unit: m.unit, ...reading, values: values(m.per) });
  const main = byMeasure.get(base.coverage.measure) ?? [...byMeasure.values()][0];
  if (main) {
    push({ name: 'amount', kind: 'amount', unit: main.unit, ...reading, values: values(main.per) });
    const total = [...main.per.values()].reduce((a, b) => a + b, 0);
    push({
      name: 'share',
      kind: 'share',
      unit: 'share',
      ...reading,
      values: [...main.per].map(([participant, v]) => ({ participant, value: shareOf(v, total) })),
    });
  }
  push({
    name: 'kind',
    kind: 'category',
    unit: 'kind of account',
    ...reading,
    values: base.participants.map((p) => ({ participant: p.id, value: p.kind })),
  });
  push({
    name: 'identity',
    kind: 'category',
    unit: 'identity',
    ...reading,
    values: base.participants.map((p) => ({
      participant: p.id,
      value: p.identity?.status ?? 'none',
    })),
  });
  const delegations = (base.relationships ?? []).filter(
    (r) => r.type === 'delegates_to' && r.amount,
  );
  if (delegations.length) {
    push({
      name: 'backers',
      kind: 'parts',
      unit: delegations[0]?.unit ?? '',
      ...reading,
      parts: delegations.map((r) => ({
        participant: r.to,
        part: r.from,
        value: r.amount as string,
      })),
    });
  }

  const participants = new Set(base.participants.map((p) => p.id));
  for (const a of added) {
    const other = 'layer' in a ? a.layer.about : aboutOf(a.snapshot);
    if (!sameAbout(other, about))
      throw new LayerError(`${a.hash.slice(0, 12)} is about ${other}, not ${about}, the reading's`);
    if ('layer' in a) {
      const l = a.layer;
      for (const m of l.measures) {
        const rows = l.rows.filter((r) => r.measure === m.name);
        for (const r of rows) participants.add(r.participant);
        push({
          name: m.name,
          kind: m.kind,
          unit: m.unit,
          ...(m.label ? { label: m.label } : {}),
          standing: l.standing,
          layer: a.hash,
          as_of: l.when.as_of,
          values: rows.map((r) => ({ participant: r.participant, value: r.value })),
        });
      }
    } else {
      const s = a.snapshot;
      const per = new Map<string, Map<string, number>>();
      const units = new Map<string, string>();
      for (const h of s.holdings) {
        participants.add(h.participant);
        const m = per.get(h.measure) ?? new Map<string, number>();
        m.set(h.participant, (m.get(h.participant) ?? 0) + Number(h.amount));
        per.set(h.measure, m);
        units.set(h.measure, h.unit);
      }
      for (const [name, m] of per) {
        push({
          name,
          kind: 'amount',
          unit: units.get(name) ?? '',
          standing: 'verified',
          layer: a.hash,
          as_of: s.snapshot.as_of,
          values: values(m),
        });
      }
    }
  }
  return {
    petal: SEAM_DOCUMENT_VERSION,
    about,
    layers: [baseHash, ...added.map((a) => a.hash)],
    participants: [...participants],
    data,
    dates: [...new Set(data.map((p) => p.as_of))].sort(),
    coverage: { participants: participants.size, partial: base.coverage.partial === true },
  };
}

/** A seam's name: the hash of its canonical JSON. */
export const seamHash = (s: Seam): string => sha256Hex(canonicalJson(s));
