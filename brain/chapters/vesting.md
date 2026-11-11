---
id: vesting
for: finding when an allocation becomes available and who controls its release or claim rights
recognise: vesting, locked, unlock, cliff, claimable, streams, allocation, beneficiary, release schedule
tools: read_chain, add_annotation
continues: value, who-can-move-money-or-change-rules, going-deeper
status: partial
---

# Vesting

A token balance does not say when someone can use it. Find the allocation's contract, beneficiary and release conditions before calling it locked or available.

1. **Find the particular allocation.** Record the chain, contract or program version, token and plan, stream or account identifier. A project's published allocation table is a claim to check, not proof that the tokens sit in that contract. Discovery may need creation events, an indexer or an identifier from the person; one allocation does not cover their whole wallet.
2. **Keep four answers separate.** Vested means earned under the schedule. Unlocked means the relevant restriction has ended. Claimable means available to withdraw now after prior withdrawals and applicable conditions. Transferable may describe either released tokens or the right to future claims. Read the contract's definitions: these words are not interchangeable across systems.
3. **Read the conditions and authorities.** Find the start, cliff, release pattern and end; funded amount and withdrawals; beneficiary; cancellation, revocation and amendment powers; and any price or other condition. Check who can transfer the claim. Voting rights can exist while tokens remain locked, so follow the governance contract rather than infer votes from availability.
4. **Use the right evidence.** [NEAR lockups](https://github.com/near/core-contracts/blob/master/lockup/README.md) combine lockup and vesting; older private schedules may expose only a hash. EVM systems differ: [OpenZeppelin VestingWallet](https://docs.openzeppelin.com/contracts/5.x/api/finance) can transfer ownership; Sablier stream rights and Hedgey plan rights have their own rules. [Streamflow's SDK](https://github.com/streamflow-finance/js-sdk/blob/master/packages/stream/README.md) exposes Solana stream data, including withdrawal and transfer settings. Verify the deployed variant rather than copying a platform-wide promise.
5. **Say what the reading supports.** Report the source, block or slot and timestamp. Separate amounts available now from projected releases. Say “Under this allocation's rules read at block X, this amount remains locked until Y, subject to Z” only when the schedule supports that statement. Missing schedules, funding or conditions stay unknown.

Petals has no registered vesting reader. `read_chain` supports EVM inspection, not NEAR or Solana, and its view calls do not select historical blocks. `near-house-of-stake` omits individual lockup details; `near-validators` supplies stored categories, not schedules. Known-contract reads need no wallet signature. Public RPC access, archive data and discovery may still need a provider key; a private schedule hash does not reveal its dates. Other reads require available tools and endpoints. Call chain readings verified only with their block or slot; label deductions inferred and documentary directions leads. Unknown stays unknown. Save what you find about an allocation in the person's project as an annotation (`add_annotation`, a `noted` claim with its contract, block or slot and source as evidence), so it isn't only in this conversation.
