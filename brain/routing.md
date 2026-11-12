---
id: routing
for: which files to load for each task an agent does: one table, read by people and by the machine alike
---

# Routing

Which files to load for each task. The doctrine always comes first, so no row lists it. A row answers to its task's words and to the words beside it; when it fires, it brings what it loads and what it also loads. A recipe whose calls the contract answers comes before any row. This is the only copy: the index is made from it, and the check fails a row that names a file that doesn't exist, or a chapter that no row names.

| Task | Words it answers to | Load | Also load |
|---|---|---|---|
| Set up Petals | setup, set up, sign in, wallet, credit, first conversation | `connecting`, `setup` | n/a |
| Connect Claude Code | claude code, terminal, desktop app, install | `connecting`, `connect-claude-code` | `setup` |
| Connect Codex | codex | `connecting`, `connect-codex` | `setup` |
| Connect Hermes | hermes | `connecting`, `connect-hermes` | `setup` |
| Connect a cloud app | chatgpt, claude app, custom connector, cursor, mcp url, remote | `connecting`, `connect-cloud` | `setup` |
| What is this address | address, account, wallet or contract | `start-from-an-address` | `what-kind-of-thing-it-is` |
| Who holds power in this DAO or system | power, holds, controls, members | `governance`, `where-power-lives` | `who-gets-a-vote`, `going-deeper` |
| Voting power, delegation, joining or leaving | voting power, delegate, delegated, delegation, join, leave, ragequit | `who-gets-a-vote` | `where-power-lives` |
| Follow a proposal, its rules and quorum | proposal, quorum, passed, executed, voting rules | `from-proposal-to-action` | `who-gets-a-vote` |
| Treasury, signers, admin keys, upgrades, minting | treasury, signers, multisig, admin, upgrade, pause, mint, spend | `who-can-move-money-or-change-rules` | `from-proposal-to-action` |
| Who votes together | votes together, blocs, alike | `voting-blocs-over-time` | `from-proposal-to-action` |
| Validators and the stake behind them | validators, stake, staking | `stake-behind-the-network` | `where-power-lives` |
| What it's worth | worth, value, price, dollars | `value` | `vesting` |
| When it unlocks | unlock, vesting, cliff, release | `vesting` | `value` |
| How it changed over time | changed, history, since, over time | `over-time` | n/a |
| What to offer after an answer | more, deeper, next | `going-deeper` | n/a |
| Who is behind it, names | behind, names, twitter, forum, ens | `open-source-leads` | `going-deeper` |
| A system Petals can't read | cannot read, not supported, framework | `a-new-system` | `contributing` |
| Improve a chapter or a recipe | improve, contribute, pull request, github, fix | `contributing` | n/a |
| A one-press service (#101) | service, deliverable | `services` | n/a |
