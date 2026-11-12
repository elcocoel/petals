// What each DAO map paid out, the run over the shared map (payouts/v1, 12 Nov; Elco: "an unopinionated
// 'payouts from this treasury over period x'"; NEAR first): for each map of a Sputnik DAO, every passed
// proposal's payment, dated by the DAO's own transfer and priced on that day, kept by the map's address.
// scripts/map-payouts.ts runs it where the server runs. Read again, a map's payouts are replaced.
import { type Payout, type Payouts, validatePayouts } from '@petal/core';
import {
  defaultPool,
  FASTNEAR_TX,
  type Fetch,
  LLAMA_HISTORICAL,
  pastPrices,
  plannedPayouts,
  RETRY_WAITS,
  readBounties,
  readSputnik,
  resolveNearAt,
  sentByApprovals,
  sputnikPayouts,
  tokenFacts,
} from '@petal/inputs';
import { privateStore } from './drafts.ts';
import { mapsOf, mapViews } from './map.ts';
import type { ToolContext } from './types.ts';

/** A map's stored payouts, as stored and valid, or null when none were read. */
export async function payoutsOf(ctx: ToolContext, about: string): Promise<Payouts | null> {
  const row = await privateStore(ctx.config).payouts.get(about);
  if (!row) return null;
  const p = validatePayouts(JSON.parse(row.body));
  return p.ok ? p.value : null;
}

export interface PayoutRun {
  only?: string;
  save?: boolean;
  fetch?: Fetch;
  now?: () => Date;
  log?: (line: string) => void;
  /** how long to wait before asking a keyless service again; tests pass none */
  waits?: readonly number[];
}

/** One payout, the same in two reads: the proposal that paid it, what, to whom, how much. */
const payoutKey = (p: Payout) => `${p.proposal.ref}|${p.asset.id}|${p.to}|${p.raw}`;

/**
 * A read again never knows less than the one kept (META, 12 Nov, after run 3: DefiLlama refused past prices in the
 * real run that it gave in the dry one): a payout this read found no dollars or date for keeps the kept read's,
 * with the transfer that dated it. What this read found itself stands.
 */
export function keepKnown(doc: Payouts, kept: Payouts | null): Payouts {
  if (!kept) return doc;
  const before = new Map(kept.payouts.map((p) => [payoutKey(p), p]));
  return {
    ...doc,
    payouts: doc.payouts.map((p) => {
      const was = before.get(payoutKey(p));
      if (!was) return p;
      const dated = p.when === null && was.when !== null;
      return {
        ...p,
        ...(dated ? { when: was.when, evidence: was.evidence } : {}),
        ...(p.usd === null && was.usd !== null ? { usd: was.usd } : {}),
      };
    }),
  };
}

export async function payoutMaps(
  ctx: ToolContext,
  o: PayoutRun = {},
): Promise<{
  maps: number;
  saved: number;
  payouts: number;
  dated: number;
  priced: number;
  failed: string[];
}> {
  const store = privateStore(ctx.config);
  const fetchImpl = o.fetch ?? ((...a: Parameters<Fetch>) => globalThis.fetch(...a));
  const log = o.log ?? (() => {});
  const now = o.now ?? (() => new Date());
  const cards = mapsOf(await mapViews(ctx)).filter(
    (c) =>
      (!o.only || c.id.includes(o.only)) &&
      c.address &&
      c.readings.some((r) => r.network === 'sputnik-dao'),
  );
  const out = {
    maps: cards.length,
    saved: 0,
    payouts: 0,
    dated: 0,
    priced: 0,
    failed: [] as string[],
  };
  const pool = defaultPool();
  for (const card of cards) {
    const dao = card.address as string;
    const readAt = now().toISOString();
    let doc: Payouts;
    try {
      const at = await resolveNearAt(pool, 'latest');
      const read = await readSputnik(pool, dao, at);
      const planned = plannedPayouts(read, await readBounties(pool, dao, read, at));
      const sent = await sentByApprovals(fetchImpl, dao, log, o.waits ?? RETRY_WAITS);
      const facts = await tokenFacts(
        pool,
        planned.map((p) => p.token),
        at,
      );
      const prices = await pastPrices(
        fetchImpl,
        sent.sent.map((s) => ({ token: s.token, at: s.at })),
        o.waits ?? RETRY_WAITS,
      );
      out.failed.push(...sent.failed, ...prices.failed);
      doc = sputnikPayouts({
        about: card.id,
        dao,
        planned,
        sent: sent.sent,
        facts,
        priceOf: prices.priceOf,
        at,
        ref: `get_policy, get_last_proposal_id, get_proposals and get_bounty on ${dao} at block ${at.block_height} (final), via ${read.endpoint}; when paid, the DAO's own transfers in the transactions that approved them (${FASTNEAR_TX}); dollars that day (${LLAMA_HISTORICAL})`,
        readAt,
      });
    } catch (e) {
      log(`${card.id}: not read, ${(e as Error).message}`);
      continue;
    }
    doc = keepKnown(doc, await payoutsOf(ctx, card.id));
    const checked = validatePayouts(doc);
    if (!checked.ok) {
      log(
        `${card.id}: not kept, ${checked.errors.map((e) => `${e.path} ${e.message}`).join('; ')}`,
      );
      continue;
    }
    const dated = doc.payouts.filter((p) => p.when).length;
    const priced = doc.payouts.filter((p) => p.usd).length;
    out.payouts += doc.payouts.length;
    out.dated += dated;
    out.priced += priced;
    log(`${card.id}: ${doc.payouts.length} payouts, ${dated} dated, ${priced} priced`);
    if (o.save === false) continue;
    await store.payouts.put({ about: doc.about, body: JSON.stringify(doc), read_at: readAt });
    out.saved++;
  }
  return out;
}
