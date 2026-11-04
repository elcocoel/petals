// Small schema-valid test snapshots (T018), derived from the imported NEAR validators fixture so
// they keep its real shape. Distinct network ids, no block height: they are never in a store
// index and never collide with a real (chain, population, block) lookup.
import type { Coverage, Participant, Relationship, Snapshot } from '@petal/core/types';
import { BACKER_CLASSES, type BackerClass } from '@petal/inputs';

/** yoctoNEAR → shortest decimal string in NEAR. */
function fromBaseUnits(raw: bigint, decimals: number): string {
  const s = raw.toString().padStart(decimals + 1, '0');
  const int = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}

const MEASURE = 'validator_stake_current_epoch';
const KEEP_PER_CLASS = 2;
const yocto = (x?: string) => BigInt(x ?? '0');
const near = (raw: bigint) => fromBaseUnits(raw, 24);
const classes = Object.keys(BACKER_CLASSES) as BackerClass[];

function classOf(p: Participant | undefined): BackerClass | undefined {
  return (p?.detail as { backer_class?: BackerClass } | undefined)?.backer_class;
}

function referencedSources(s: Omit<Snapshot, 'sources'>, all: Snapshot['sources']) {
  const ids = new Set<string>();
  for (const p of s.participants) {
    ids.add(p.source);
    if (p.identity) ids.add(p.identity.source);
  }
  for (const r of [...s.holdings, ...s.relationships, ...s.events]) ids.add(r.source);
  return all.filter((x) => ids.has(x.id)) as Snapshot['sources'];
}

function base(
  v: Snapshot,
  id: string,
  title: string,
): Pick<Snapshot, 'petal' | 'network' | 'snapshot' | 'module'> {
  return {
    petal: 'snapshot/v1',
    network: { id, chain: v.network.chain, population: 'validators-test', title },
    snapshot: { as_of: v.snapshot.as_of, final: true },
    module: {
      id: 'test-subset',
      version: '1',
      imported_from: `fixtures/snapshots (near-validators)`,
    },
  };
}

export function makeTestSnapshots(v: Snapshot, sha256: string): Record<string, Snapshot> {
  const byId = new Map(v.participants.map((p) => [p.id, p]));
  const stake = v.holdings.filter((h) => h.measure === MEASURE);
  const seated = [...stake].sort((a, b) => (yocto(b.amount_raw) > yocto(a.amount_raw) ? 1 : -1));

  // two-participants: the two largest seated validators, stake only.
  const two = seated.slice(0, 2);
  const twoBody = {
    ...base(v, 'test-two-participants', 'Two NEAR validators (test)'),
    coverage: {
      participants_total: 2,
      participants_included: 2,
      amount_total: near(two.reduce((a, h) => a + yocto(h.amount_raw), 0n)),
      amount_included: near(two.reduce((a, h) => a + yocto(h.amount_raw), 0n)),
      unit: 'NEAR',
      measure: MEASURE,
      note: `Test subset of the near-validators snapshot ${sha256}: the two largest seated validators by ${MEASURE}.`,
    },
    participants: two.map((h) => byId.get(h.participant) as Participant),
    holdings: two,
    relationships: [],
    events: [],
  };
  const twoParticipants: Snapshot = { ...twoBody, sources: referencedSources(twoBody, v.sources) };

  // tiny-backers: 5 seated pools that together show every backer class.
  const delegationsTo = new Map<string, Relationship[]>();
  for (const r of v.relationships) {
    if (r.type !== 'delegates_to') continue;
    const list = delegationsTo.get(r.to) ?? [];
    list.push(r);
    delegationsTo.set(r.to, list);
  }
  const classesOf = (pool: string) =>
    new Set((delegationsTo.get(pool) ?? []).map((r) => classOf(byId.get(r.from))).filter(Boolean));
  const chosen: string[] = [];
  const covered = new Set<BackerClass>();
  for (const h of seated) {
    if (covered.size === classes.length) break;
    const cs = classesOf(h.participant);
    if ([...cs].some((c) => !covered.has(c as BackerClass))) {
      chosen.push(h.participant);
      for (const c of cs) covered.add(c as BackerClass);
    }
  }
  for (const h of seated) {
    if (chosen.length >= 5) break;
    if (!chosen.includes(h.participant)) chosen.push(h.participant);
  }
  if (covered.size !== classes.length)
    throw new Error('tiny-backers: not every backer class found');

  const participants: Participant[] = [];
  const relationships: Relationship[] = [];
  const subsetFolded = { rows: 0, amount: 0n };
  const smallFolded = { rows: 0, amount: 0n };
  for (const pool of chosen) {
    participants.push(byId.get(pool) as Participant);
    for (const r of v.relationships) {
      if (r.type === 'owned_by' && r.from === pool) {
        relationships.push(r);
        const owner = byId.get(r.to);
        if (owner && !participants.includes(owner)) participants.push(owner);
      }
    }
    const rows = delegationsTo.get(pool) ?? [];
    for (const cls of classes) {
      const individual = rows
        .filter((r) => !r.from.startsWith('group:') && classOf(byId.get(r.from)) === cls)
        .sort((a, b) => (yocto(b.amount_raw) > yocto(a.amount_raw) ? 1 : -1));
      const group = rows.find((r) => r.from === `group:${pool}:${cls}`);
      for (const r of individual.slice(0, KEEP_PER_CLASS)) {
        relationships.push(r);
        participants.push(byId.get(r.from) as Participant);
      }
      const extra = individual.slice(KEEP_PER_CLASS);
      if (!group && extra.length === 0) continue;
      const gp = group ? (byId.get(group.from) as Participant) : undefined;
      const groupRows = gp?.count ?? 0;
      const groupAmount = yocto(group?.amount_raw);
      const extraAmount = extra.reduce((a, r) => a + yocto(r.amount_raw), 0n);
      smallFolded.rows += groupRows;
      smallFolded.amount += groupAmount;
      subsetFolded.rows += extra.length;
      subsetFolded.amount += extraAmount;
      const count = groupRows + extra.length;
      const id = `group:${pool}:${cls}`;
      participants.push({
        id,
        label: `${count} ${BACKER_CLASSES[cls]} (folded)`,
        kind: 'group',
        identity: null,
        count,
        source: gp?.source ?? extra[0]?.source ?? 'fastnear-rpc-staking-pool-views',
        detail: { pool, backer_class: cls, rule: 'test subset: see coverage.grouped' },
      });
      relationships.push({
        from: id,
        to: pool,
        type: 'delegates_to',
        amount: near(groupAmount + extraAmount),
        amount_raw: (groupAmount + extraAmount).toString(),
        unit: 'NEAR',
        as_of: (group ?? extra[0])?.as_of ?? v.snapshot.as_of,
        source: (group ?? extra[0])?.source ?? 'fastnear-rpc-staking-pool-views',
        detail: { rows_folded: count },
      });
    }
  }
  const unique = [...new Map(participants.map((p) => [p.id, p])).values()];
  participants.length = 0;
  participants.push(...unique);
  const holdings = v.holdings.filter((h) => chosen.includes(h.participant));
  const poolStake = stake
    .filter((h) => chosen.includes(h.participant))
    .reduce((a, h) => a + yocto(h.amount_raw), 0n);
  const accounts =
    participants.filter((p) => p.kind !== 'group').length +
    participants.reduce((a, p) => a + (p.kind === 'group' ? (p.count ?? 0) : 0), 0);
  const coverage: Coverage = {
    participants_total: accounts,
    participants_included: accounts,
    amount_total: near(poolStake),
    amount_included: near(poolStake),
    unit: 'NEAR',
    measure: MEASURE,
    grouped: [
      {
        rule: 'delegates_to rows under 1,000 NEAR staked, one group row per pool and backer class (as in the source snapshot)',
        rows_folded: smallFolded.rows,
        amount: near(smallFolded.amount),
      },
      {
        rule: `test subset: delegates_to rows of 1,000 NEAR or more beyond the ${KEEP_PER_CLASS} largest per pool and backer class, folded into the same group rows`,
        rows_folded: subsetFolded.rows,
        amount: near(subsetFolded.amount),
      },
    ],
    note:
      `Test subset of the near-validators snapshot ${sha256}: ${chosen.length} seated pools chosen` +
      ` so that every backer class (${classes.join(', ')}) appears, with their owners, holdings and` +
      ' delegations; group rows fold the rest, declared in grouped.',
  };
  const tinyBody = {
    ...base(v, 'test-tiny-backers', 'Five NEAR pools and their backers (test)'),
    coverage,
    participants,
    holdings,
    relationships,
    events: [],
  };
  const tinyBackers: Snapshot = { ...tinyBody, sources: referencedSources(tinyBody, v.sources) };

  return { 'two-participants': twoParticipants, 'tiny-backers': tinyBackers };
}
