---
id: treasury-and-unlocks-calendar
department: services
for: showing recorded treasury assets and evidenced upcoming releases
recognise: treasury calendar, unlock calendar, treasury and unlocks, upcoming releases
tools: brain_context, search_petals, read_page, list_annotations, read_chain, list_payouts
continues: value, vesting, who-can-move-money-or-change-rules
status: partial
---

# Treasury and unlocks calendar

A free service for Petals' agent or the person's own agent. Put the treasury's recorded position beside dated release obligations and rights.

**Reads:** `brain_context` for value and vesting; `search_petals` for the DAO; `read_page` on the map card (`GET /api/v1/maps/:id`, URL-encoded id) and its primary sources. Use `list_annotations` for sourced allocation notes in a project the person already has access to; annotations retain their original evidence status.

1. **Fix the scope.** Name the treasury accounts, assets, as-of dates and calendar window; use the next 30 days if none is supplied. Separate treasury-owned allocations from wider token unlocks that do not pay the treasury.
2. **Read the position.** Quote stored `value/v3` treasury items, priced/unpriced coverage, price sources and times. Preserve native amounts. Do not substitute market cap, delegated-token value or gross assets for available spending funds; do not count claims and their backing twice. For payouts from this treasury over a period, call `list_payouts` with `map`, `since` (inclusive) and `until` (exclusive). Report its asset totals, priced/unpriced coverage and undated count separately from future releases; no payout data means unknown, not zero.
3. **Read release evidence.** Use existing sourced allocation records. Where a known EVM contract needs checking, `read_chain` can inspect its calls; it is not a generic NEAR/Solana or historical-call reader. Establish beneficiary, asset, funding, start, cliff, end, release rule, withdrawals and cancellation conditions before placing a release on the calendar.
4. **Write dated entries.** Give UTC date, allocation/contract, beneficiary, amount and unit, condition, evidence and read time. Distinguish vested, unlocked, claimable and paid. A continuous stream is an interval, not a fabricated discrete payment. Label projected releases conditional on the recorded rules.

**Missing data:** Petals has no registered vesting reader; without a readable schedule, report “unlock schedule unknown”, not “no unlocks”.

**The person gets:** A dated treasury summary and chronological calendar of evidenced releases, with unknown allocations and unpriced assets visible.
