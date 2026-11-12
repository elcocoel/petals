---
id: stake-behind-the-network
department: governance
for: separating validator consensus power from the accounts and stake behind it
recognise: validators, staking pools, stake, backers, delegators, consensus, block producers, unstake
tools: get_snapshot, describe_snapshot, compute_figures
continues: where-power-lives, who-gets-a-vote, going-deeper
status: partial
---

# Stake behind the network

Start with what the stake does. Validators participate in the chain's consensus. Their backers supply stake. Neither relationship alone says who votes in a DAO, owns a treasury, or can spend someone else's funds.

1. **Read the available data.** Use `get_snapshot` for `near-validators`, then `describe_snapshot`. This reader serves stored data; it does not crawl NEAR live. Say the returned date, block and coverage. “Latest” means latest stored, and a requested date does not create a historical reading.
2. **Separate the accounts.** Keep the validator, staking-pool contract, recorded owner and backers distinct. A backer may itself be a pool, lockup or other contract. Follow the evidence before attributing its balance to people. A declared name is a lead with its source, not verified identity.
3. **Count the right stake.** Seated validator stake and total stake held by a pool answer different questions. Use `compute_figures` on the chosen data with the measure that answers the person's question, `validator_stake_current_epoch` for seated stake or `pool_contract_stake` for what a pool holds, and quote its results with that scope. Explain any grouped backers or missing coverage; absence is not proof of no stake.
4. **Trace each authority separately.** Consensus approvals, withdrawal rights, pool administration and protocol upgrades are different powers. A stake reading alone cannot establish the last three. Say what remains unknown and what contract or protocol evidence would answer it.
5. **Explain entry and exit.** Distinguish delegating to a pool from qualifying as a validator, and unstaking from withdrawing. Use the relevant pool and protocol rules; do not infer a treasury redemption right or DAO vote from staking.

Call a claim verified only when its source establishes the chain reading and block. Distinguish inferences and leads; a stored dataset does not verify every explanation attached to it.
