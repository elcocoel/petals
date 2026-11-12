// The run over the shared map (board #85, Elco's pick, 11 Nov: "Chain first, then lists"): every map's card,
// its address read with @petal/inputs' readMark, its mark/v1 kept by the map's address, its logo as a picture
// in media. Read again, a map's mark is replaced. scripts/map-marks.ts runs it where the server runs.
import { MARK_VERSION, validateMark } from '@petal/core';
import { type Fetch, listReader, readMark, readTypes } from '@petal/inputs';
import { privateStore } from './drafts.ts';
import { mapsOf, mapViews, typeWords } from './map.ts';
import type { ToolContext } from './types.ts';

export interface MarkRun {
  /** only the maps whose address holds this */
  only?: string;
  /** false: read and say, keep nothing */
  save?: boolean;
  fetch?: Fetch;
  now?: () => Date;
  log?: (line: string) => void;
}

export interface MarkRunResult {
  maps: number;
  saved: number;
  named: number;
  symbols: number;
  logos: number;
  /** the lists that couldn't be read this run */
  failed_lists: string[];
}

const said = (s: { value: string; status: string; source: string } | null) =>
  s ? `${s.value} (${s.status}, ${s.source})` : '-';

export async function markMaps(ctx: ToolContext, o: MarkRun = {}): Promise<MarkRunResult> {
  const store = privateStore(ctx.config);
  const fetchImpl = o.fetch ?? ((...a: Parameters<Fetch>) => globalThis.fetch(...a));
  const lists = listReader(fetchImpl);
  const log = o.log ?? (() => {});
  const cards = mapsOf(await mapViews(ctx)).filter((c) => !o.only || c.id.includes(o.only));
  const out: MarkRunResult = {
    maps: cards.length,
    saved: 0,
    named: 0,
    symbols: 0,
    logos: 0,
    failed_lists: [],
  };
  for (const card of cards) {
    const { mark, logo } = await readMark(
      {
        about: card.id,
        chain: card.chain,
        address: card.address,
        reader: card.readings[0]?.network ?? null,
        snapshot: card.readings[0]?.snapshot ?? null,
      },
      { fetch: fetchImpl, lists, ...(o.now ? { now: o.now } : {}) },
    );
    const checked = validateMark(mark);
    if (!checked.ok) {
      log(
        `${card.id}: not kept, ${checked.errors.map((e) => `${e.path} ${e.message}`).join('; ')}`,
      );
      continue;
    }
    if (mark.name) out.named++;
    if (mark.symbol) out.symbols++;
    if (mark.logo) out.logos++;
    log(
      `${card.id}: ${said(mark.name)} · ${said(mark.symbol)} · logo ${mark.logo ? `${mark.logo.source}, ${logo?.bytes.length ?? 0} bytes` : '-'}`,
    );
    if (o.save === false) continue;
    if (logo)
      await store.media.put({
        sha256: logo.sha256,
        type: logo.media_type,
        body: Buffer.from(logo.bytes).toString('base64'),
        person: null,
        created_at: mark.read_at,
      });
    await store.mark.put({ about: mark.about, body: JSON.stringify(mark), read_at: mark.read_at });
    out.saved++;
  }
  out.failed_lists = [...lists.failed];
  return out;
}

export interface TypeRunResult {
  maps: number;
  /** kept marks that gained types */
  typed: number;
  saved: number;
  /** maps with no mark kept: left */
  unmarked: number;
}

/**
 * The types pass (#97; META, 11 Nov: "only adds types to each kept mark"): each map's kept mark gains the types
 * its reading and chain show, as mark/v2. Its name, symbol, logo and when they were read stay as they were, so a
 * wave's own mark keeps its words. A map with no mark kept, or no types found, is left as it is.
 */
export async function typeMaps(ctx: ToolContext, o: MarkRun = {}): Promise<TypeRunResult> {
  const store = privateStore(ctx.config);
  const fetchImpl = o.fetch ?? ((...a: Parameters<Fetch>) => globalThis.fetch(...a));
  const log = o.log ?? (() => {});
  const cards = mapsOf(await mapViews(ctx)).filter((c) => !o.only || c.id.includes(o.only));
  const out: TypeRunResult = { maps: cards.length, typed: 0, saved: 0, unmarked: 0 };
  for (const card of cards) {
    const kept = await store.mark.get(card.id);
    if (!kept) {
      out.unmarked++;
      continue;
    }
    const types = await readTypes(
      {
        about: card.id,
        chain: card.chain,
        address: card.address,
        reader: card.readings[0]?.network ?? null,
        snapshot: card.readings[0]?.snapshot ?? null,
      },
      { fetch: fetchImpl, ...(o.now ? { now: o.now } : {}) },
    );
    if (!types.length) continue;
    const mark = { ...JSON.parse(kept.body), petal: MARK_VERSION, types };
    const checked = validateMark(mark);
    if (!checked.ok) {
      log(
        `${card.id}: not kept, ${checked.errors.map((e) => `${e.path} ${e.message}`).join('; ')}`,
      );
      continue;
    }
    out.typed++;
    log(`${card.id}: ${typeWords(types).join(', ')}`);
    if (o.save === false) continue;
    await store.mark.put({ about: card.id, body: JSON.stringify(mark), read_at: kept.read_at });
    out.saved++;
  }
  return out;
}

export interface LogoRunResult {
  maps: number;
  /** maps whose kept mark had no logo */
  without: number;
  /** of those, the ones a logo was found for */
  found: number;
  saved: number;
  failed_lists: string[];
}

/**
 * The logos pass (Elco, 12 Nov, walk 3: "some daos here that do have logos not having them"): each map whose kept
 * mark has no logo is read again, chain first, then the curated lists (#85), and a logo found is added to the kept
 * mark, with its picture in media. Its name, symbol and types stay as they were, so a wave's own mark keeps its
 * words; a map with no mark kept gains the mark read. Nothing else changes.
 */
export async function logoMaps(ctx: ToolContext, o: MarkRun = {}): Promise<LogoRunResult> {
  const store = privateStore(ctx.config);
  const fetchImpl = o.fetch ?? ((...a: Parameters<Fetch>) => globalThis.fetch(...a));
  const lists = listReader(fetchImpl);
  const log = o.log ?? (() => {});
  const cards = mapsOf(await mapViews(ctx)).filter((c) => !o.only || c.id.includes(o.only));
  const out: LogoRunResult = {
    maps: cards.length,
    without: 0,
    found: 0,
    saved: 0,
    failed_lists: [],
  };
  for (const card of cards) {
    const keptRow = await store.mark.get(card.id);
    const kept = keptRow ? (JSON.parse(keptRow.body) as Record<string, unknown>) : null;
    if (kept?.logo) continue;
    out.without++;
    const { mark, logo } = await readMark(
      {
        about: card.id,
        chain: card.chain,
        address: card.address,
        reader: card.readings[0]?.network ?? null,
        snapshot: card.readings[0]?.snapshot ?? null,
      },
      { fetch: fetchImpl, lists, ...(o.now ? { now: o.now } : {}) },
    );
    if (!mark.logo || !logo) {
      log(`${card.id}: no logo on its chain or in the lists`);
      continue;
    }
    const next = kept ? { ...kept, logo: mark.logo } : mark;
    const checked = validateMark(next);
    if (!checked.ok) {
      log(
        `${card.id}: not kept, ${checked.errors.map((e) => `${e.path} ${e.message}`).join('; ')}`,
      );
      continue;
    }
    out.found++;
    log(
      `${card.id}: logo from ${mark.logo.source} (${mark.logo.status}), ${logo.bytes.length} bytes`,
    );
    if (o.save === false) continue;
    await store.media.put({
      sha256: logo.sha256,
      type: logo.media_type,
      body: Buffer.from(logo.bytes).toString('base64'),
      person: null,
      created_at: mark.read_at,
    });
    await store.mark.put({
      about: card.id,
      body: JSON.stringify(next),
      read_at: keptRow?.read_at ?? mark.read_at,
    });
    out.saved++;
  }
  out.failed_lists = [...lists.failed];
  return out;
}
