# Data model (sketch)

Shapes to start from, not final. Field names may change as they're built.

## Public, by content hash

Already exist in `specs/001-petal-core/`: snapshot, recipe, spec, reading, entry.

## Public, attributed: claim

```ts
type Claim = {
  petal: 'claim/v1';
  id: string;                 // hash of the canonical claim, without id and signature
  subject: EntityRef;
  verb: string;               // 'holds', 'controls', 'delegates_to', 'voted', 'paid', 'same_as', 'challenges', 'confidence'...
  object: EntityRef | { value: string; unit?: string };
  valid_from?: string;
  valid_to?: string;
  kind: 'observed' | 'sourced' | 'inferred';
  evidence: { snapshot_sha256?: string; url?: string; claim_id?: string; note?: string }[];
  by: EntityRef;              // a NEAR account, a tool, or a named model and version
  signature?: unknown;        // required for what goes on the map
};

// Namespaced, and may be anything: 'near:mainnet:alice.near', 'eip155:1:0xabc…',
// 'solana:…:…', 'group:<id>', 'entity:<id>' for something with no address.
type EntityRef = string;
```

- A challenge is a claim with `verb: 'challenges'` and `object` naming another claim.
- Confidence is a claim with `verb: 'confidence'` about another claim, by a named model or person.
- Disputed, and a claimer's standing, are derived. Neither is stored as a fact.

## Policy

```ts
type Lens = {
  kinds?: Claim['kind'][];
  trusted?: EntityRef[];
  minConfidence?: number;
  showDisputed?: boolean;
};
type Shown = { claim: Claim; show: 'plain' | 'caveated' | 'contested' | 'hidden'; why: string };
function applyPolicy(claims: Claim[], lens: Lens): Shown[];
```

A pure function. Surfaces get `Shown[]` and decide how it looks, not what's true.

## Derived index (rebuildable)

```
node(id, kind, chain, address)
group(id, snapshot_sha256, as_of, measure, coverage)
membership(account, group, amount, share, rank, as_of)
relation(subject, verb, object, kind, by, as_of, claim_id)
group_overlap(a, b, shared, shared_amount, computed_at)
```

## Private

```
person(id, created_at)
wallet_binding(person, caip10_encrypted, caip10_hash UNIQUE, proved_at)
session(hash, person_or_anonymous, expires_at)
challenge(nonce UNIQUE, expires_at, used_at)
grant(id, person, client, scopes, token_hash, expires_at, revoked_at)
exploration(id, owner, question, target, head, visibility, share_token_hash, forked_from, created_at, updated_at)
step(exploration, seq, parent, spec_sha256, recipe_sha256, snapshot_sha256, door, note, at)
note(exploration, seq, by, text, at)
run(id, owner, exploration, status, model, created_at, lease_until)
run_event(run, seq, type, data, at)            -- append-only
run_thread(run, messages)                      -- each round
approval(id, request_hash, signer, proof, expires_at, used_at)
invite(id, token_hash, budget_usd, spent_usd, expires_at, revoked_at)
ledger(day, usd, reserved_usd)
draft(sha256, body, created_at)                -- put-if-absent
```

What the store must offer: point reads, put-if-absent with expiry, compare-and-swap on refs, ordered list by owner, a unique secondary index, atomic counters, read-your-writes.

**Never stored:** keys or seed phrases, raw tokens, holdings under a person, an IP joined to a person, addresses in logs or public objects.
