// A DAO's proposals and each account's vote, the run over the shared map (board #93; Elco, 11 Nov: proposals on
// the flower's ring, each wallet's yes and no on hover, absent showing nothing): for each map of a DAO Petals
// reads proposals from, its proposals/v1, kept by the map's address. scripts/map-proposals.ts runs it where the
// server runs, and adds a DAO's map first when asked. Read again, a map's proposals are replaced.
import { type Proposals, validateProposals } from '@petal/core';
import type { Spec } from '@petal/core/types';
import { defaultPool, readSputnik, resolveNearAt, sputnikProposals } from '@petal/inputs';
import { privateStore } from './drafts.ts';
import { mapsOf, mapViews } from './map.ts';
import { callTool } from './registry.ts';
import type { ToolContext } from './types.ts';

/** What a map's card carries of its proposals: how many, how many have votes, and when they were read. */
export interface CardProposals {
  count: number;
  voted: number;
  read_at: string;
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

export const cardProposals = (p: Proposals): CardProposals => ({
  count: p.proposals.length,
  voted: p.proposals.filter((x) => x.votes.length > 0).length,
  read_at: p.read_at,
});

/** The readers whose maps have proposals Petals reads, and how. */
const READERS: Record<
  string,
  (about: string, address: string, readAt: string) => Promise<Proposals>
> = {
  'sputnik-dao': async (about, dao, readAt) => {
    const pool = defaultPool();
    const at = await resolveNearAt(pool, 'latest');
    return sputnikProposals(about, dao, await readSputnik(pool, dao, at), at, readAt);
  },
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
  const cards = mapsOf(await mapViews(ctx)).filter(
    (c) => (!o.only || c.id.includes(o.only)) && READERS[c.readings[0]?.network ?? ''],
  );
  const out = { maps: cards.length, saved: 0, proposals: 0, votes: 0 };
  for (const card of cards) {
    const read = READERS[card.readings[0]?.network ?? ''];
    if (!read || !card.address) continue;
    const at = (o.now ?? (() => new Date()))().toISOString();
    let p: Proposals;
    try {
      p = await read(card.id, card.address, at);
    } catch (e) {
      log(`${card.id}: not read, ${(e as Error).message}`);
      continue;
    }
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
