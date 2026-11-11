---
id: what-kind-of-thing-it-is
department: gathering
for: describing an account or network's technical form, roles and declared organisation type
recognise: type, kind, kind of thing, classification, DAO, foundation, protocol, community, multisig, contract, exchange, custodian, wallet
tools: look_up, get_network, get_snapshot, read_chain, read_page, add_annotation
continues: start-from-an-address, where-power-lives, who-can-move-money-or-change-rules, open-source-leads
status: partial
---

# What kind of thing it is

Allow several labels at once. A network can be a protocol, token community and DAO, with a foundation alongside it. A petal can be a contract, multisig and delegate. These are starting words, not a closed list.

1. **Separate three questions.** What is its technical form? What role does it perform here? What organisational, legal or social nature does it declare? A treasury role does not identify a legal owner; a foundation claim needs documentary evidence. A wallet does not prove one individual human. Add new types when useful, with their meaning and evidence.
2. **Inspect the known address on its chain.** EVM code alone is insufficient: [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) allows EOAs to delegate code. For a [Safe](https://docs.safe.global/advanced/smart-account-concepts), confirm the implementation and read owners and threshold; matching method names alone is not confirmation. Modules create other control paths. For a Governor, match source, deployed version and calls before naming its governance form.
3. **Use each chain's own account model.** [NEAR accounts](https://docs.near.org/protocol/accounts-contracts/account-model) may have code and access keys. Confirm Sputnik code and policy, or staking-pool implementation and methods, before assigning those types. [Solana accounts](https://solana.com/docs/core/accounts) have an owning program, data and an executable flag: program ownership is not human ownership, and a non-executable account is not automatically an ordinary wallet. Known-address public reads do not discover every related account; endpoint access may be restricted.
4. **Keep sourced labels distinct from deductions.** Public labels such as [Dune Spellbook’s](https://github.com/duneanalytics/spellbook/discussions/2634), or an organisation page, supply sourced leads with authors and dates. “Looks like an exchange wallet” is an inference needing supporting evidence, not an identity fact. Funding a known exchange address does not by itself establish exchange control. No match, failed reads or missing labels leave the type unknown.
5. **Save the claim and its bounds.** For a verified chain reading, say “a Safe, 2 of 3, at block X,” naming unread control paths. Use a `noted` annotation with type and explanation in `object.value`: `sourced` for an attributed source, or `inferred` with a versioned method and `grounds: research`. Follow `add_annotation`'s typed-evidence schema; preserve chain, address, block or slot, source and discovery date. Arbitrary types do not belong in the closed `labelled` tags.

`look_up` is a starting point. A reading's participants already carry a `kind`, the reader's own word from the address (an organisation for a `.sputnik-dao.near` account, unknown for most): a starting point, not a type. Check `get_network` before `get_snapshot`: `sputnik-dao` supplies member/activity data, not complete classification. `read_chain` is EVM-only; calls cannot select historical blocks. No universal classifier is established. Other reads need available tools. Supply data; leave display choices to the person.
