# Data model (sketch)

Shapes to start from, not final. Field names may change as they're built.

## Public, by content hash

Already exist in `specs/001-petal-core/`: snapshot, recipe, spec, reading, entry.

## Public, attributed: claim

Built. The full contract, with every verb and rule, is [contracts/claims.md](./contracts/claims.md).

```ts
type Claim = {
  petal: 'claim/v1';
  id: string;                 // hash of the canonical claim, without id and proof
  subject: EntityRef;
  verb: Verb;                 // a closed list per version. 'holds', 'delegates_to', 'challenges', 'confidence'...
  object: EntityRef | { value: string; unit?: string };
  qualifiers?: Record<string, string>;
  valid_from?: string;
  valid_to?: string;
  issued_at: string;
  as_of?: { chain: string; block: number };
  kind: 'observed' | 'declared' | 'sourced' | 'inferred';
  method?: string;            // required if inferred
  evidence: { snapshot_sha256?: string; url?: string; url_sha256?: string; retrieved_at?: string; claim_id?: string; note?: string }[];
  by: EntityRef;              // an account, a named tool, or a named model and version
  via?: EntityRef;
  proof?: Proof;              // tx, nep413 or nearai
};

// Namespaced, with one spelling each: 'near:mainnet:alice.near', 'eip155:1:0xabc…', 'solana:…:…',
// 'group:<snapshot sha256>:<key>', 'asset:…', 'proposal:…', 'claim:<id>', 'tool:…', 'model:…'.
// No natural person, and no free 'entity:' for now: see the contract.
type EntityRef = string;
```

- A challenge is a claim with `verb: 'challenges'` and `object` naming another claim.
- Confidence is a claim with `verb: 'confidence'` about another claim, by a named model or person.
- Disputed, and a claimer's standing, are derived. Neither is stored as a fact.

## Policy

```ts
type Lens = {
  kinds?: Claim['kind'][];
  trusted?: EntityRef[] | 'everyone';   // absent or empty counts nobody's word about anyone else
  minConfidence?: 'low' | 'medium' | 'high';
  showDisputed?: boolean;
  showRetracted?: boolean;
};
type Shown = {
  claim: Claim;
  show: 'plain' | 'caveated' | 'contested' | 'hidden';
  why: string;
  beside: string[];                     // answers from the subject's own account
  challenges: { counted: number; outside: number };
  confidence?: { band: 'low' | 'medium' | 'high'; raters: number };
};
function applyPolicy(claims: Claim[], lens: Lens): Shown[];
```

A pure function. Surfaces get `Shown[]` and decide how it looks, not what's true.

## Derived index (rebuildable)

In `<stateDir>/index.db`, through `@petal/relations`. Integer ids are hashes of what they name, so they don't depend on the order snapshots arrived in. Answers never show them.

```
snapshot(sha256, network, title, as_of)
grp(id, key, module, chain, kind, measure, unit, title)                 -- a group over time: its module and parameters
observation(id, group_id, snapshot_sha256, as_of, as_of_s, block_height, final, anchor_account,
            members_named, members_total, tail_accounts, amount_total, amount_named, named_share,
            read_window, complete, why_partial, latest)                 -- a group at a date
node(id, scope, address)                                                -- an address where it means one thing: eip155, or one chain
account(id, node_id, chain)                                             -- one id per chain
membership(observation_id, node_id, account_id, amount, share, rnk, kind, identity)  -- amount is an exact decimal string
adj(src, dst, inferred)                                                 -- accounts positive, observations negative; inferred joins one address on two chains
group_overlap(a, b, a_obs, b_obs, shared, weight, share_a, share_b, inferred)  -- latest date of each group, both directions
meta(key, value)
```

The index reads snapshots only, for now. Claims would feed the same tables: `holds`, `member_of` and `delegates_to` are `membership` rows of a group, and an inferred `same_address` claim is an `adj` row with `inferred = 1`. A claim's id, kind and author would be new columns beside them.

## Private

In `<stateDir>/private.db`, through `@petal/store`. `ledger`, `credit` and `invite` money is in USD; times are ISO strings.

```
person(id, created_at)
wallet_binding(person, network, caip10_encrypted, caip10_hash UNIQUE, proved_at)  -- near:testnet: and near:mainnet: differ
session(hash, subject, network, invite, expires_at)  -- subject: a person id (prs_) or an anonymous handle (anon_)
challenge(nonce UNIQUE, expires_at, state, used_at)  -- state: issued, checking, used
grant(id, person, client, scopes, token_hash, expires_at, revoked_at)
exploration(id, owner, question, target, head, visibility, share_token_hash, forked_from, created_at, updated_at)
step(exploration, seq, parent, spec_sha256, recipe_sha256, snapshot_sha256, door, note, at)
note(exploration, seq, author, text, at)
run(id, owner, exploration, status, model, body, created_at, updated_at)  -- body: messages, draft, flower
run_event(run, seq, type, data, at)            -- append-only; seq from 0 is the place in Run.events
run_thread(run, messages, updated_at)          -- each round
approval(id, request_hash, signer, proof, expires_at, used_at)
invite(id, token_hash, budget_usd, spent_usd, expires_at, revoked_at)  -- its budget is credit account invite:<id>; a session holds it
ledger(day, usd, reserved_usd)                 -- the cap counts usd + reserved_usd
credit(account_key, balance_usd, reserved_usd) -- a generic account balance
credit_entry(id UNIQUE, account_key, delta_usd, reason, at)  -- an id counts once
draft(sha256, body, created_at)                -- hash-addressed draft links; put-if-absent
publish_draft(entry_sha256, body, used_at)     -- prepared for a signature; used_at is claimed atomically
meta(key, value)
schema_migration(version, applied_at)
```

Not built yet: `grant`, `approval`. A run's `owner` never appears in what a reader of the run sees.

What the store must offer: point reads, put-if-absent with expiry, compare-and-swap on refs, ordered list by owner, a unique secondary index, atomic counters, read-your-writes.

**Never stored:** keys or seed phrases, raw tokens, holdings under a person, an IP joined to a person, addresses in logs or public objects.
