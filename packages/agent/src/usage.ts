// A usage record for every model call (usage/v1; coordinator/pricing-protocol.md; Elco, 10 Nov: "count usage
// like pros"). Each answer's tokens, the list price they were counted at, what the person was charged, and,
// once NEAR AI knows it, NEAR AI's own bill for the call, found by its inference id. The person is charged
// the bill: when it differs from what was counted, the difference goes back or is charged as its own entry.
// Reconciling happens when it's needed, before a person's next chat and when they look at their usage: no
// timer.
import type { Store, UsageRow } from '@petal/store';
import type { LlmClient } from './llm.ts';

export interface UsageRecord {
  petal: 'usage/v1';
  call: string | null;
  completion: string;
  run: string;
  at: string;
  model: string;
  tokens: { in: number; cached: number; out: number };
  list_price: { in: number; cached: number; out: number };
  computed_usd: number;
  failed_usd: number;
  charged_usd: number;
  billed_usd: number | null;
  reconciled_at: string | null;
}

/** What a run hands over after each answer: its record, and whose account paid. */
export interface Usage {
  account: string | null;
  record: UsageRecord;
}

export const RECONCILED = "reconciled with NEAR AI's bill";
const usd = (n: number) => Math.round(n * 1e9) / 1e9;

/** Kept once, by its inference id, or by its answer's id when NEAR AI gave none. */
export async function keepUsage(store: Store, u: Usage): Promise<void> {
  await store.usage.add({
    id: u.record.call ?? u.record.completion,
    account_key: u.account,
    run: u.record.run,
    at: u.record.at,
    body: JSON.stringify(u.record),
    billed_usd: null,
    reconciled_at: null,
  });
}

/** A record as it's handed out: its bill and when it was reconciled, from the row. */
export const recordOf = (row: UsageRow): UsageRecord => ({
  ...(JSON.parse(row.body) as UsageRecord),
  billed_usd: row.billed_usd,
  reconciled_at: row.reconciled_at,
});

/**
 * Asks NEAR AI's billing for each of an account's calls it hasn't reconciled yet, records the bill, and on a
 * person's credit gives back or charges the difference from what was counted, as its own entry. What attempts
 * that failed before an answer were counted at stays charged: NEAR AI names no bill for them.
 */
export async function reconcile(
  store: Store,
  llm: LlmClient,
  account: string,
  now: () => Date = () => new Date(),
): Promise<number> {
  if (!llm.billed) return 0;
  const open = (await store.usage.unreconciled(account, 1000)).filter((r) =>
    /^[0-9a-f-]{36}$/.test(r.id),
  );
  if (!open.length) return 0;
  const bills = await llm.billed(open.map((r) => r.id));
  let done = 0;
  for (const row of open) {
    const billed = bills.get(row.id);
    if (billed === undefined) continue;
    const at = now().toISOString();
    const counted = (JSON.parse(row.body) as UsageRecord).computed_usd;
    const back = usd(counted - billed);
    await store.tx(async () => {
      if (back !== 0 && account.startsWith('person:')) {
        await store.credit.apply({
          id: `reconcile:${row.id}`,
          account_key: account,
          delta_usd: back,
          reason: RECONCILED,
          at,
        });
      }
      await store.usage.reconcile(row.id, billed, at);
    });
    done++;
  }
  return done;
}
