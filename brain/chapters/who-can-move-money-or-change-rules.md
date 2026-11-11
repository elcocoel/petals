---
id: who-can-move-money-or-change-rules
for: tracing treasury execution and authority to change permissions or contract rules
recognise: treasury, spend, funds, money, Safe, multisig, signers, owners, modules, admin, roles, permissions, mint, upgrade, pause, timelock, shaman, policy, Aragon
tools: list_networks, get_network, get_snapshot, describe_snapshot, read_chain, add_layer
continues: from-proposal-to-action, who-gets-a-vote, a-new-system
status: partial
---

# Who can move money or change rules

Follow each permission over assets or rules to whoever can exercise it.

1. **Locate the money.** Identify treasury accounts and assets. Holdings, voting power and a DAO's name do not establish spending authority. Separate payments, allowances and redemption rights.
2. **Trace every evidenced spending path.** For a Safe, read owners and threshold, then enabled modules and applicable guards. Modules can authorize actions without the usual owner signatures. Follow a contract owner or module to its own permissions. A signer list alone is incomplete.
3. **Trace authority over the rules.** Find who can grant or revoke roles, change voting settings, mint, pause, upgrade or replace a controller. Separate each permission. Inspect the proxy's actual upgrade mechanism: transparent ProxyAdmin, implementation-authorized UUPS or a beacon can lead to different authorities. An owner field or implementation address alone is insufficient.
4. **Follow the surrounding governance.** A Governor's timelock may hold assets and permissions: distinguish proposers, executors, cancellers and admins. Sputnik policy permissions vary by proposal kind; inspect upgrade and factory authority too. Aragon OSx combines permissions with installed plugins. Baal combines governance with Safe execution and authorised shamans; do not import those powers into Moloch v1. House of Stake delegation alone grants no executive office.
5. **Explain the chain of authority.** Say who can choose, approve, block and execute an action. Permission to trigger an approved transaction is not discretion over its contents. Distinguish authority from actions observed.

Check `list_networks` and `get_network` before `get_snapshot`; use `describe_snapshot` for its bounds. `near-house-of-stake` supplies some configured roles; `moloch-v1` and `moloch-v3` supply membership data. `sputnik-dao` supplies a Sputnik DAO's role members, not each role's permissions: read its policy for those. None establishes all permissions. No dedicated Governor, Safe or Aragon reader is registered.

`read_chain` supports EVM calls and bounded logs, not generic NEAR reads. Basic role contracts may require grant/revoke history to reconstruct membership. Calls have no historical-block argument; do not present current authority as historical authority. Save independently gathered data with `add_layer` and provenance. A verified chain claim includes its block. Mark deductions inferred, unconfirmed directions leads and unread authority unknown; never infer absent authority from a missing event or failed read.
