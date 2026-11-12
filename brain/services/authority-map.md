---
id: authority-map
department: services
for: tracing who can choose, approve, block or execute spending and rule changes
recognise: authority map, who can move money, who can change rules, signers, admin powers
tools: brain_context, search_petals, read_page, list_annotations, describe_snapshot, read_chain
continues: who-can-move-money-or-change-rules, from-proposal-to-action
status: partial
---

# Authority map

A free service for Petals' agent or the person's own agent. Show the evidenced permission paths over money and rules.

**Reads:** `brain_context` for spending authority; `search_petals` for the DAO; `read_page` on its map card, `/api/v1/maps/:id/claims` and linked primary sources, using the URL-encoded returned id. Use `list_annotations` for existing accessible project claims, retaining their evidence status and `describe_snapshot` for relevant readings.

1. **Name the controlled objects.** Identify treasury accounts and contracts with spend, upgrade, mint, pause or policy powers. Keep each permission separate from token ownership and voting weight.
2. **Follow each recorded path.** Trace controller → permission → target. Record thresholds, delays, vetoes and conditions. Use `read_chain` for known EVM contracts where needed; it supports calls and bounded logs, not generic NEAR/Solana reads or historical call selection.
3. **Check what a list leaves out.** Safe owners do not establish module/guard powers; Sputnik role members do not establish their permissions. Follow the recorded policy, modules, timelock and upgrade controller where accessible. Mark an unread branch unknown instead of implying no alternative path exists.
4. **Draw only supported edges.** Make a simple text diagram or table naming who chooses, approves, blocks and executes each action. Permission to execute a fixed approved action does not establish discretion over its contents. Attach source, date and block/slot where available to each path; distinguish declared policy, chain reads and inference.

**Missing data:** No dedicated Governor, Safe or Aragon reader establishes a complete authority graph; incomplete permissions remain explicit.

**The person gets:** A sourced authority diagram with conditions and unread branches, showing what the available evidence establishes about spending and rule changes.
