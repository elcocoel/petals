// Server only. The vote ring on real data (#93): NEAR's Marketing DAO, its members as petals (sized by votes cast)
// and its 1,059 proposals with every vote, as SYSTEMS reads them (proposals/v1), from the live server. The ring
// shows a stretch of the DAO's own time, its last 90 days by default, until the legend's period setting (#92).

import type { Snapshot, Spec } from '@petal/core/types';
import { GREY, KEYS, type Key } from '@petal/core/wedge/keys';
import type { Proposal } from '@petal/core/wedge/votes';
import { api } from '../../lib/api.ts';
import { ART_VIEW, day, type LookFlower, loadCore, whole } from './bench.ts';

const MAP = 'near:mainnet:marketing.sputnik-dao.near';
const DAY = 86_400_000;

/** The ring's stretch: the last `days` of the DAO's proposals, up to when the newest one closes. */
function stretchOf(proposals: readonly Proposal[], days: number) {
  const last = Math.max(...proposals.map((p) => Date.parse(p.decided_at ?? p.closes_at ?? p.at)));
  return { from: new Date(last - days * DAY).toISOString(), to: new Date(last).toISOString() };
}

export async function votesBench(days = 90): Promise<LookFlower | { error: string }> {
  const core = await loadCore();
  const at = encodeURIComponent(MAP);
  const doc = await api<{
    proposals: { proposals: Proposal[]; source: { ref: string; at: string } };
  }>(`/api/v1/maps/${at}/proposals`);
  const card = await api<{ map: { readings: { snapshot: string }[] } }>(`/api/v1/maps/${at}`);
  if (!doc.ok || !card.ok) return { error: 'the Marketing DAO could not be read' };
  const sha256 = card.value.map.readings[0]?.snapshot;
  if (!sha256) return { error: 'the Marketing DAO has no reading' };
  const [proposed, snap] = await Promise.all([
    api<{ spec: Spec }>('/api/v1/specs/propose', {
      body: { network: 'sputnik-dao', params: { dao: 'marketing.sputnik-dao.near' }, sha256 },
    }),
    api<Snapshot>(`/api/v1/snapshots/${sha256}`),
  ]);
  if (!proposed.ok || !snap.ok) return { error: 'the Marketing DAO reading could not be read' };
  const s = snap.value;
  const petals = core
    .readFlower(proposed.value.spec, s, ART_VIEW, [], { floor: 0 })
    .petals.filter((p) => !p.tail);
  const proposals = doc.value.proposals.proposals;
  const stretch = stretchOf(proposals, days);
  const inStretch = proposals.filter(
    (p) =>
      Date.parse(p.at) <= Date.parse(stretch.to) &&
      Date.parse(p.closes_at ?? p.at) >= Date.parse(stretch.from),
  );
  const mint = (KEYS[0] as Key).hex;
  const pink = (KEYS[4] as Key).hex;
  return {
    reading: { title: s.network.title, petals },
    look: {
      // the petals keep the reading's colours; the votes speak in the question's own
      fills: Object.fromEntries(petals.map((p) => [p.id, GREY.hex])),
      bands: {},
      highlight: [],
      votes: {
        ...stretch,
        proposals,
        // the reading's meaning for this question (Elco's example): for mint, against pink; abstain is context
        colours: { for: mint, against: pink, abstain: GREY.hex },
      },
    },
    key: [
      { hex: mint, label: 'voted for', petals: 0 },
      { hex: pink, label: 'voted against', petals: 0 },
      { hex: GREY.hex, label: 'a member, as tall as the votes they cast', petals: petals.length },
    ],
    facts: [
      `NEAR's Marketing DAO (marketing.sputnik-dao.near): ${petals.length} members, each as tall as the votes they cast.`,
      `${whole(proposals.length)} proposals and ${whole(proposals.reduce((t, p) => t + p.votes.length, 0))} votes, read from the DAO itself on ${day(doc.value.proposals.source.at)}.`,
      `The ring is ${day(stretch.from)} to ${day(stretch.to)}, the DAO's last ${days} days, clockwise from twelve: ${inStretch.length} proposals. Each arc runs from when a proposal was put up to when its voting closed; ones open at once stack outward.`,
      'Point at an arc: a dot shows under each member that voted. No vote, no dot.',
    ],
    highlight: '',
  };
}

/**
 * RaidGuild's ring (#93): its delegates' flower, the one the art direction was drawn on, with its Baal's 246
 * proposals and every vote with its time, as SYSTEMS reads them, over the last `days` of its proposals. A voter
 * who isn't one of the drawn delegates (a member voting by its shares) has no petal, so no dot.
 */
export async function raidguildVotes(days = 90): Promise<LookFlower | { error: string }> {
  const { petalBench } = await import('./bench.ts');
  const { raidguild } = await petalBench();
  const doc = await api<{
    proposals: { proposals: Proposal[]; source: { ref: string; at: string } };
  }>(
    `/api/v1/maps/${encodeURIComponent('eip155:100:0x372fc5a6b0b12ae174f09f6fc849a83de6b503b6')}/proposals`,
  );
  if (!doc.ok) return { error: "RaidGuild's proposals could not be read" };
  const proposals = doc.value.proposals.proposals;
  const stretch = stretchOf(proposals, days);
  const drawn = new Set(raidguild.reading.petals.map((p) => p.id));
  const votes = proposals.reduce((t, p) => t + p.votes.length, 0);
  const onPetals = proposals.reduce(
    (t, p) => t + p.votes.filter((v) => drawn.has(v.account)).length,
    0,
  );
  const inStretch = proposals.filter(
    (p) =>
      Date.parse(p.at) <= Date.parse(stretch.to) &&
      Date.parse(p.closes_at ?? p.at) >= Date.parse(stretch.from),
  );
  const mint = (KEYS[0] as Key).hex;
  const pink = (KEYS[4] as Key).hex;
  return {
    ...raidguild,
    look: {
      ...raidguild.look,
      highlight: [],
      votes: { ...stretch, proposals, colours: { for: mint, against: pink, abstain: GREY.hex } },
    },
    key: [
      { hex: mint, label: 'voted for', petals: 0 },
      { hex: pink, label: 'voted against', petals: 0 },
      ...raidguild.key,
    ],
    facts: [
      ...raidguild.facts.slice(0, 1),
      `RaidGuild's Baal: ${whole(proposals.length)} proposals and ${whole(votes)} votes, read from its logs on ${day(doc.value.proposals.source.at)}; ${whole(onPetals)} of the votes are by delegates drawn here.`,
      `The ring is ${day(stretch.from)} to ${day(stretch.to)}, the last ${days} days, clockwise from twelve: ${inStretch.length} proposals. Each arc runs from when a proposal was put up to when its voting closed; ones open at once stack outward.`,
      'Point at an arc: a dot shows under each delegate that voted. No vote, no dot.',
    ],
    highlight: '',
  };
}
