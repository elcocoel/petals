// A DAO's proposals and each account's vote, the run over the shared map (proposals on the flower's ring, each
// wallet's yes and no on hover, absent showing nothing): for each map of a DAO Petals reads proposals from, its
// proposals/v1, kept by the map's address. scripts/map-proposals.ts runs it where the server runs, and adds a
// DAO's map first when asked. Read again, a map's proposals are replaced.
import { PROPOSALS_VERSION, type Proposals, validateProposals } from '@petal/core';
import type { Spec } from '@petal/core/types';
import {
  baalLogs,
  baalOf,
  baalProposals,
  baalSenders,
  defaultPool,
  EVM_CHAINS,
  readSputnik,
  resolveNearAt,
  sputnikProposals,
} from '@petal/inputs';
import { privateStore } from './drafts.ts';
import { mapsOf, mapViews } from './map.ts';
import { callTool } from './registry.ts';
import type { ToolContext } from './types.ts';

/** What a map's card carries of its proposals: how many, how many have votes, when they were read, and the span they cover. */
export interface CardProposals {
  count: number;
  voted: number;
  read_at: string;
  /** the earliest and latest proposal's own time (the period each layer contains); null with none */
  period: { from: string; to: string } | null;
  /** the earliest and latest vote's time, where its source keeps one (Sputnik keeps none); null when none does */
  votes_period: { from: string; to: string } | null;
}

/** Each map's stored proposals, by its address, as stored and valid. */
export async function proposalsOf(ctx: ToolContext): Promise<Map<string, Proposals>> {
  const out = new Map<string, Proposals>();
  for (const r of await privateStore(ctx.config).proposals.list()) {
    const p = validateProposals(JSON.parse(r.body));
    if (p.ok) out.set(r.about, p.value);
  }
  return out;
}

/** The earliest and latest of some times, by their instant, as they were written; null for none. */
function spanOf(
  times: readonly (string | null | undefined)[],
): { from: string; to: string } | null {
  let from: string | null = null;
  let to: string | null = null;
  for (const t of times) {
    if (!t || Number.isNaN(Date.parse(t))) continue;
    if (from === null || Date.parse(t) < Date.parse(from)) from = t;
    if (to === null || Date.parse(t) > Date.parse(to)) to = t;
  }
  return from && to ? { from, to } : null;
}

export const cardProposals = (p: Proposals): CardProposals => ({
  count: p.proposals.length,
  voted: p.proposals.filter((x) => x.votes.length > 0).length,
  read_at: p.read_at,
  period: spanOf(p.proposals.map((x) => x.at)),
  votes_period: spanOf(p.proposals.flatMap((x) => x.votes.map((v) => v.at))),
});

type Reader = (
  card: { id: string; chain: string; address: string },
  readAt: string,
) => Promise<Proposals | null>;

/** A token map's DAO, when its token is a Baal's shares (RaidGuild's): that DAO's proposals; else none. */
const baalBehind: Reader = async (card, readAt) => {
  const chain = EVM_CHAINS[card.chain];
  if (!chain) return null;
  const dao = await baalOf(chain, card.address);
  if (!dao) return null;
  const logs = await baalLogs(chain, dao);
  return baalProposals(
    card.id,
    chain,
    dao,
    logs,
    readAt,
    Date.now(),
    await baalSenders(chain, logs),
  );
};

/** The readers whose maps have proposals Petals reads, and how; null: this map has none to read. */
const READERS: Record<string, Reader> = {
  'sputnik-dao': async (card, readAt) => {
    const pool = defaultPool();
    const at = await resolveNearAt(pool, 'latest');
    return sputnikProposals(
      card.id,
      card.address,
      await readSputnik(pool, card.address, at),
      at,
      readAt,
    );
  },
  'erc20-holders': baalBehind,
  'erc20-votes': baalBehind,
};

export interface ProposalRun {
  only?: string;
  save?: boolean;
  now?: () => Date;
  log?: (line: string) => void;
}

export async function proposalMaps(
  ctx: ToolContext,
  o: ProposalRun = {},
): Promise<{ maps: number; saved: number; proposals: number; votes: number }> {
  const store = privateStore(ctx.config);
  const log = o.log ?? (() => {});
  // a card's reader: its first reading Petals reads proposals for, newest first (a mapping run's newest reading can
  // be of a network Petals has no reader for, beside an older one it has: RaidGuild's moloch-v3 by its erc20-holders)
  const readerOf = (c: { readings: { network: string }[] }) =>
    c.readings.map((r) => READERS[r.network]).find((r): r is Reader => !!r);
  const cards = mapsOf(await mapViews(ctx)).filter(
    (c) => (!o.only || c.id.includes(o.only)) && readerOf(c),
  );
  const out = { maps: cards.length, saved: 0, proposals: 0, votes: 0 };
  for (const card of cards) {
    const read = readerOf(card);
    if (!read || !card.address) continue;
    const at = (o.now ?? (() => new Date()))().toISOString();
    let p: Proposals | null;
    try {
      p = await read({ id: card.id, chain: card.chain, address: card.address }, at);
    } catch (e) {
      log(`${card.id}: not read, ${(e as Error).message}`);
      continue;
    }
    if (!p) continue;
    const checked = validateProposals(p);
    if (!checked.ok) {
      log(
        `${card.id}: not kept, ${checked.errors.map((e) => `${e.path} ${e.message}`).join('; ')}`,
      );
      continue;
    }
    const votes = p.proposals.reduce((n, x) => n + x.votes.length, 0);
    out.proposals += p.proposals.length;
    out.votes += votes;
    log(`${card.id}: ${p.proposals.length} proposals, ${votes} votes`);
    if (o.save === false) continue;
    await store.proposals.put({ about: p.about, body: JSON.stringify(p), read_at: at });
    out.saved++;
  }
  return out;
}

type Out = Record<string, unknown>;

/**
 * A DAO's map, drawn and named, so it's on the shared map: its reading (get_snapshot), the default flower of it
 * (propose_spec, render_flower), and the drawing's name and maker. Its proposals are then read with the rest.
 */
export async function addDaoMap(
  ctx: ToolContext,
  a: { network: string; params: Record<string, string>; name: string; by: string },
): Promise<{ snapshot: string; spec: string }> {
  const call = async (name: string, input: unknown) => {
    const r = (await callTool(name, input, ctx)) as Out & { error?: { message: string } };
    if (r?.error) throw new Error(`${name}: ${r.error.message}`);
    return r;
  };
  const snap = await call('get_snapshot', { network: a.network, params: a.params });
  const sha = String(snap.sha256 ?? (snap.snapshot as Out | undefined)?.sha256 ?? '');
  if (!/^[0-9a-f]{64}$/.test(sha)) throw new Error('get_snapshot gave no sha256');
  const proposed = await call('propose_spec', { network: a.network, sha256: sha });
  const drawn = await call('render_flower', { spec: proposed.spec as Spec });
  const spec = String(drawn.spec_sha256);
  await privateStore(ctx.config).draft.label(spec, { name: a.name, made_by: a.by });
  return { snapshot: sha, spec };
}

export const SNAPSHOT_GRAPHQL = 'https://hub.snapshot.org/graphql';
const SNAPSHOT_ID = /^0x[0-9a-f]{64}$/i;

/** A proposal Snapshot holds: in a doc read from Snapshot, or one whose ref names Snapshot, by its own id. */
const onSnapshot = (doc: Proposals, p: Proposals['proposals'][number]) =>
  SNAPSHOT_ID.test(p.id) &&
  (doc.source.kind === 'snapshot' ||
    p.ref.startsWith('proposal:snapshot:') ||
    p.ref.startsWith('https://snapshot.box/') ||
    p.ref.startsWith('https://snapshot.org/'));

/**
 * The Snapshot proposals kept on the shared map (the mapping runs wrote them), each given its own text and
 * its page on Snapshot, where it was made, by its id from Snapshot's keyless GraphQL. Only
 * summary and link are added: everything else in a doc stays as it was, and a doc that wouldn't validate is
 * left alone. scripts/map-snapshot-texts.ts runs it where the server runs.
 */
export async function snapshotTexts(
  ctx: ToolContext,
  o: {
    save?: boolean;
    only?: string;
    fetch?: typeof globalThis.fetch;
    log?: (line: string) => void;
  } = {},
): Promise<{ docs: number; proposals: number; found: number; saved: number; failed: string[] }> {
  const store = privateStore(ctx.config);
  const log = o.log ?? (() => {});
  const fetchImpl = o.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const out = { docs: 0, proposals: 0, found: 0, saved: 0, failed: [] as string[] };
  const docs: { about: string; doc: Proposals }[] = [];
  for (const row of await store.proposals.list()) {
    if (o.only && !row.about.includes(o.only)) continue;
    const v = validateProposals(JSON.parse(row.body));
    if (!v.ok || !v.value.proposals.some((p) => onSnapshot(v.value, p))) continue;
    docs.push({ about: row.about, doc: v.value });
  }
  const ids = [
    ...new Set(
      docs.flatMap((d) =>
        d.doc.proposals.filter((p) => onSnapshot(d.doc, p)).map((p) => p.id.toLowerCase()),
      ),
    ),
  ];
  const texts = new Map<string, { body: string | null; link: string | null }>();
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100);
    try {
      const res = await fetchImpl(SNAPSHOT_GRAPHQL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          query:
            'query ($ids: [String]) { proposals(first: 1000, where: { id_in: $ids }) { id body link } }',
          variables: { ids: part },
        }),
      });
      const body = (await res.json()) as {
        data?: { proposals?: { id: string; body?: string | null; link?: string | null }[] };
      };
      if (!res.ok || !body.data?.proposals) throw new Error(`HTTP ${res.status}`);
      for (const p of body.data.proposals)
        texts.set(p.id.toLowerCase(), { body: p.body ?? null, link: p.link ?? null });
    } catch (e) {
      out.failed.push(`${SNAPSHOT_GRAPHQL} (${part.length} proposals): ${(e as Error).message}`);
    }
  }
  for (const { about, doc } of docs) {
    out.docs++;
    let found = 0;
    const proposals = doc.proposals.map((p) => {
      const t = onSnapshot(doc, p) ? texts.get(p.id.toLowerCase()) : undefined;
      if (onSnapshot(doc, p)) out.proposals++;
      if (t) found++;
      return {
        ...p,
        recipient: p.recipient ?? null,
        summary: t ? t.body?.trim() || null : (p.summary ?? null),
        link:
          t?.link && /^https?:\/\//.test(t.link)
            ? { url: t.link, kind: 'where it was made' as const }
            : (p.link ?? null),
      };
    });
    out.found += found;
    const next: Proposals = { ...doc, petal: PROPOSALS_VERSION, proposals };
    const checked = validateProposals(next);
    if (!checked.ok) {
      log(
        `${about}: left as it was, as v3 it isn't valid: ${checked.errors
          .slice(0, 3)
          .map((e) => `${e.path} ${e.message}`)
          .join('; ')}`,
      );
      continue;
    }
    log(
      `${about}: ${found} of ${proposals.filter((p) => onSnapshot(doc, p)).length} Snapshot proposals given their text and page`,
    );
    if (o.save === false || found === 0) continue;
    await store.proposals.put({ about, body: JSON.stringify(next), read_at: doc.read_at });
    out.saved++;
  }
  return out;
}
