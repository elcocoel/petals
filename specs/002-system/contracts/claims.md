# Contract: claims

**Version**: claim/v3 (v1 and v2 still read) | **Code**: `packages/core/src/claims/`, pure | **Schemas**: `packages/core/schema/claim.schema.json` (v1), `claim-v2.schema.json` (v2), `claim-v3.schema.json` (v3) | **Consumers**: a person's annotations (annotation-layer.md), later the relations index and surfaces

**claim/v2 (10 Nov)** adds annotations, what a person or an agent says about an account: `named`, `noted` and `linked`, the kind `stated`, the ground `research`, and `tx`, `proposal` and `quote` in the evidence. Everything else is v1's, word for word. Chain reads are still made as v1, so their ids don't move. A reader picks the schema by `petal`.

**claim/v3 (11 Nov; Elco: "make sure that the DATA LAYER contains space for discovered, inferred, osint gathered claims and their evidence")** types every piece of evidence and says who found it and when. Each piece now has:
- `type`, required: `snapshot` (a reading, `snapshot_sha256`), `tx`, `proposal`, `page` or `post` (`url`), `claim` (`claim_id`) or `note`. Each names the field it must hold, and a page or post is an http(s) URL.
- `found_by`, required: an account, a named tool or a named model, never a person.
- `found_at`, required: when it was found.
- `platform`, optional: where a page or post lives, as a slug (`x`, `github`, `discord`, `forum`…).
- `archive_url`, optional: an archived copy, so the claim survives the page changing. With `url_sha256` (the content hash), `retrieved_at` (when captured) and `quote`, an open-web find keeps what it rests on.

All four ways of knowing fit:
- discovered on the chain: `observed`, with its reading or transaction and `as_of`'s block;
- inferred: its method, its inputs as evidence, who inferred it, and `confidence` claims anyone can give;
- gathered from the open web: `sourced`, as above;
- someone's own word: `stated`.

A correction is `supersedes` by its author, or `challenges` plus a writer's own claim. Writers that leave a piece's type, finder or time out (an agent's batch file, the page) get them filled by `annotationsOf`: the type from what the piece holds, and the finder and time as the claim's writer and time. Nothing here has a visual meaning: a kind is data, and the look maps it through the person's view.

Everything is a claim, and one pure function decides what shows. This is the seam, not the crowd: no writer, no contract, no scores and no classifier call exist yet. Observed claims are derived at read time, and nothing here writes to a chain.

## The shape

```ts
type Claim = {
  petal: 'claim/v1' | 'claim/v2';
  id: string;              // SHA-256 of canonicalJson(claim), without id and proof
  subject: EntityRef;
  verb: Verb;              // closed list per version
  object: EntityRef | { value: string; unit?: string };  // a value is a number or a closed tag
  qualifiers?: Record<string, string>;                   // checked per verb; amounts are strings
  valid_from?: string; valid_to?: string;                // when it holds in the world
  issued_at: string;                                     // when it was said
  as_of?: { chain: string; block: number };              // the chain moment it stands for
  kind: 'observed' | 'declared' | 'stated' | 'sourced' | 'inferred';   // stated: v2
  method?: string;         // required if inferred, absent otherwise: name@version, optional #paramhash
  evidence: { snapshot_sha256?; url?; url_sha256?; retrieved_at?; claim_id?; note?;
              tx?; proposal?; quote? }[];                 // tx, proposal, quote: v2
  by: EntityRef;           // who answers for it: an account, a named tool or a named model
  via?: EntityRef;         // the tool or model that produced it
  proof?: Proof;           // outside the hash
};
```

A claim never changes. Changing your mind is a new claim. Dates are UTC with `Z`, so one moment has one spelling and one id.

| Kind | Means | Must have |
|---|---|---|
| `observed` | Read from a chain | A snapshot hash, or a `tx` proof |
| `declared` | The subject says it of itself | `by` equals `subject`, and a proof. A tool can't declare: it holds no key |
| `stated` (v2) | The writer says it on their own word, with no outside source: "this is Dekan's wallet" | `by` is the person's account |
| `sourced` | A writer points at an outside source | An `http(s)` URL in the evidence |
| `inferred` | A rule or model concluded it | `method`, evidence, and closed `grounds`, except a `confidence` |

## Entity refs

One thing has one spelling, so a hash is stable and two things never collide. `parseRef` refuses any other spelling.

| Ref | Names | Notes |
|---|---|---|
| `near:mainnet:abl%5Fpool.near` | An account or contract | Strict CAIP-10: `_` is `%5F`. Chains in v1: `near`, `eip155`, `solana`, `bip122` |
| `eip155:1:0xabc…` | The same | EVM is lower case. Base58 is never touched. The same address on two chains is two refs |
| `group:<snapshot sha256>:<key>` | A group | Scoped to its snapshot: `group:*` ids repeat across snapshots with unrelated meanings |
| `asset:<caip2>:<key>` | An asset | An address or a chain's own token as is; any other key is prefixed with its population |
| `proposal:<caip2>:<key>` | A proposal | |
| `claim:<id>` | Another claim | |
| `tool:<name>@<version>`, `model:<name>@<version>` | A writer or `via` | Never a subject, except as the speaker of a claim about a claim |

## Verbs

A new verb is a new version. Anything else is refused. There's no `same_as`: it hid one address on two chains and one controller, so `same_address`, `declares_same_controller` and neutral inferences replace it, and nothing is ever merged (SYS-066).

| Verb | Kinds | Object | Means |
|---|---|---|---|
| `holds` | observed, sourced | asset | The account has this amount of this asset, under this measure, at this moment. |
| `measured` | observed, sourced | number | A number read for the account that is not a position, like blocks made or a supply. |
| `delegates_to` | observed, sourced | account, contract or group | The account delegates stake or votes to the object. |
| `owned_by` | observed, sourced | account, contract or group | The chain or the source names the object as the owner of the account. |
| `member_of` | observed, sourced | account, contract or group | The account is a member of the group or contract. |
| `holds_role` | observed, sourced | account, contract or group | The account holds this role in the contract. |
| `voted` | observed, sourced | proposal | The account voted on the proposal, with this choice. |
| `proposed` | observed, sourced | proposal | The account submitted the proposal. |
| `reviewed` | observed, sourced | proposal | The account reviewed the proposal. |
| `paid` | observed, sourced | account, contract or group | The account sent this amount to the object. |
| `funded_by` | observed, sourced | account or contract | The object's transfer paid for the account's first action. A deposit alone doesn't count. |
| `signer_of` | observed, sourced | account or contract | The account's key can sign for the object. |
| `deployed` | observed, sourced | account or contract | The account deployed the contract. |
| `controls` | declared, sourced | account, contract or group | The account can direct the object, as the account itself or a cited source says. |
| `declares_same_controller` | declared | account or contract | This account says it and the object have one controller. Full only when both say so. |
| `shares_signer` | inferred | account or contract | One key can sign for both accounts. |
| `moves_with` | inferred | account or contract | The two accounts act in step. |
| `same_funder` | inferred | account or contract | One account paid for both accounts' first actions. |
| `same_address` | inferred | account or contract | The same address exists on two chains. It says nothing about who controls either. |
| `labelled` | declared, sourced, inferred | closed tag | A row on the map labels this account under this tag. Its text is read at draw time. |
| `requests_correction` | declared | account or contract | This account asks for a label or identity link about the object to change or go. |
| `challenges` | declared | claim | The speaker says the claim is wrong, and shows why. |
| `responds` | declared | claim | The speaker answers the claim. From the subject's own account, it always shows. |
| `retracts` | declared | claim | The author withdraws their own claim, which stays readable. Final: say it anew instead. |
| `supersedes` | declared | claim | The author replaces their own earlier claim. The old one stays readable. |
| `confidence` | declared, inferred | claim | How sure a named person or a named model is of the claim. It overwrites nothing. |
| `named` | declared, stated, sourced, inferred | a name, one line, up to 128 characters | Someone says the account goes by this name: a handle, a person's, an organisation's or a role's. |
| `noted` | declared, stated, sourced, inferred | words | A note or research about the account, in words. |
| `linked` | declared, stated, sourced, inferred | an `http(s)` link | A page about the account. |

`named`, `noted` and `linked` are v2's, and a v1 claim can't use them. An inferred one takes `grounds`, as any inference does.

In a claim about a claim (`challenges`, `responds`, `retracts`, `supersedes`, `confidence`), `object` is `claim:<id>` and `subject` is the speaker, so it always equals `by`.

Closed lists: `grounds` is a sorted, comma-separated set of `funding_lineage`, `inbound_transfers`, `research` (v2: read in proposals, pages or posts), `same_address`, `shared_signer`, `synchronised_behaviour`. `band` is `low`, `medium` or `high`. A challenge's `reason` is `names_a_person`, `stale`, `unsupported` or `wrong`.

## Real people

**Elco's decision, 10 Nov** (annotation-layer.md, decision 1 (a)): names are allowed in a person's own annotations, kept in their own project, because Elco asked to tie wallets to friends' names. `validateClaim(claim, { private: true })` reads a claim kept there. Rules 2 and 5 below give way there, for `named` and `noted` and for the evidence's notes and quotes; rules 1, 3 and 4 hold everywhere. Anything published keeps the first version below, decided again before annotations are published (step 8).

**The first version, which Elco can change.** It lives in `packages/core/src/claims/people.ts`. Constitution line 56 allows links "wherever public evidence allows" and promises removal. Both hold only off chain, so that line is under question (open question 9).

1. Claims name accounts, contracts and groups. No natural person as subject or object.
2. No free-text names in `object`, `qualifiers` or `note`.
3. Nothing in the vocabulary calls anyone a `scammer`, a `sybil` or the like.
4. An inference names its method, and can't rest on inbound transfers alone.
5. Names stay in the account's own voice, read at draw time, shown as "this account says". They aren't rewritten as claims. That's why there's no `declares_name`.

| `validateClaim` refuses | Rule |
|---|---|
| `person:`, `human:`, `entity:`, `did:`, `name:`, `user:`, `people:`, `individual:` anywhere | `no_natural_person` |
| A value that's neither a number nor a closed tag; a qualifier outside its verb's class | `object_for_verb`, `no_free_text`, `qualifier` |
| Two capitalised words in a row, a handle or a mail address in a note | `no_free_text_name` |
| `scam`, `sybil`, `fraud`, `launder`, `thief`, `criminal` and the like, wherever text can sit | `vocabulary`, or `schema` for a verb |
| An inference with no `method`, or with no `grounds` | `schema`, `qualifier` |
| Grounds of `inbound_transfers` alone | `inbound_alone` |

**A machine can't catch:** a lower-case name in a note, a name as a `role`, an account id or token symbol that's someone's name (`TRUMP` is a stored unit), a name inside a URL, and whether a stated method is what really ran. The note check is a net, not a guard. These need a person or a later filter (open question 15).

## Derived, never stored

| Thing | Rule |
|---|---|
| Disputed | From `challenges`, under the reader's lens. It moves only a reader who counts that writer, so one writer can't change a fact for everyone |
| `retracts` | Counts only when `by` matches the target's `by`. The target stays readable, off by default. Final: to say it again, issue a new claim |
| `supersedes` | Same author rule. A replacement its author retracted replaces nothing |
| `responds` | From the subject's own account, always beside the claim, under every lens |
| Confidence | A claim about a claim, by a named person or a named model and version. The lowest band among counted raters stands. It overwrites nothing |
| Claimer standing | No verdict. `claimerRecord(claims, by)` returns counts of claims, challenges received, distinct challengers and retractions. No score yet |
| Aggregates | `distinctCounts` and `applyPolicy` count distinct claims, and challengers count once each. On the graph pass, `count(*)` overcounted by up to 11% |

## The policy

```ts
applyPolicy(claims, lens = DEFAULT_LENS): Shown[]   // one row per distinct claim, sorted by id
type Lens = { kinds?; trusted?: EntityRef[] | 'everyone'; minConfidence?: 'low'|'medium'|'high';
              showDisputed?: boolean; showRetracted?: boolean };
type Shown = { claim; show: 'plain'|'caveated'|'contested'|'hidden'; why: string;
               beside: string[]; challenges: { counted; outside }; confidence?: { band; raters } };

DEFAULT_LENS = { kinds: ['observed', 'declared'], trusted: [], showDisputed: true, showRetracted: false };
```

For a claim about accounts, the first that applies decides:

1. Its author retracted or replaced it: hidden, or caveated if `showRetracted`.
2. Its kind isn't in `kinds`: hidden.
3. Its writer isn't trusted: hidden. A declared claim and a snapshot read need no trust.
4. Sourced or inferred, and below `minConfidence` or unrated: hidden.
5. A counted writer challenges it: contested, or hidden if `showDisputed` is false.
6. Inferred: caveated, always. A one-sided `declares_same_controller`, or a low rating: caveated.
7. Otherwise: plain.

A claim about a claim follows its writer, not `kinds`. An absent or empty `trusted` counts nobody, and the open view has to be asked for as `'everyone'`. `why` also says how many writers outside the lens challenge it, so a reader can choose to count them. The default lens is explained in open question 11.

## Existing data as claims

**`observedClaims(snapshot)`**, with `readSnapshot` to also list what it left out. Never stored: the snapshot's hash proves them (SYS-064). The same snapshot gives the same ids, because `issued_at` is the snapshot's own date.

| Row | Claim |
|---|---|
| A holding that's a position | `holds`, with the asset as object, and `amount`, `measure`, `unit`, `folded_count` |
| A holding counted in blocks, chunks, endorsements, votes or proposals, or a `*_supply` | `measured` |
| `delegates_to`, `owned_by`, `proposed`, `reviewed` | The same verb |
| `member_of_role`, `holds_role:x`, `voted:x` | `member_of`, `holds_role` with `role`, `voted` with `choice` |
| A row whose source is a chain | `observed` |
| A row from any other source, such as NearBlocks | `sourced`, with the source's URL |
| `group:not-read`, which "describes no real holder" | Nothing |
| Participants, identity data, events | Nothing. Names stay out, on purpose |

A snapshot isn't a group: NEAR's `delegates_to` claims point at 437 pools. A snapshot with no chain gives no claims. Non-final snapshots aren't treated differently yet, and none is stored.

**`claimsFromMap(rows)`** returns `{ claims, skipped }`. It rewrites nothing and copies no text: a label's value and a correction's reason stay on their row, and the claim points back with `fastdata://<receiver>/<writer>/<key>`.

| Row | Claim |
|---|---|
| Label, `self-declared`, written by the account itself | `labelled`, `declared` |
| Label, `self-declared`, written by anyone else | `labelled`, `sourced`: a report of what the account said |
| Label, `verified` | `labelled`, `sourced`. A writer's word, never `observed` |
| Label, `inferred`, with `method` and `grounds` on the row | `labelled`, `inferred`. Without them it's in `skipped` |
| Correction | `requests_correction`, `declared`, with the requester's NEP-413 proof, which covers the row and not this reading of it |

## On the map, if and when written

```
petal/v1/claim/<subject>/<claim id>
```

One claim, one key, never overwritten. `<subject>` is the ref as it stands, and it never holds a `/`. A row whose key doesn't match its hash is dropped. Testnet only, until open question 9 is decided. Observed claims derivable from a snapshot are never written.

**A reader must never treat "everything under the receiver" as the claim set.** Measured on testnet (`research/near-tooling/near-data.md`): about $2 buys a million junk rows, and it takes 5,000 pages to read past them.

- **Read per writer by default:** the writers a lens trusts, plus the subject's own account, whose answers always show.
- **Cap any receiver-wide read,** such as "all claims about X, by anyone", and report the result as "at least". It's a sample, not the set.
- **Never send `key_prefix: ""`:** it returns 0 rows and no error. Never read newest-first with a prefix: it stops early.
- **KV reads have no time order.** "What's new" comes from the transaction index. `issued_at` is the writer's word, so the policy never orders by it.
- **Finding who challenged a claim** is a reverse lookup: the rebuildable index, or the trusted writers' own rows.
- **A write of over 256 keys loses everything, and is still charged.** A writer has to split them first.

## What a reader does first

`applyPolicy` is pure, so it trusts what it's given. Before a stored claim goes in:

1. `validateClaim` it. That checks the id against the hash.
2. Check the row's FastData writer equals `by`, or that the proof names `by`.
3. Verify the proof, which core can't do.
4. Drop any stored row whose `by` is `SNAPSHOT_READER`. To check one, derive `observedClaims` from the snapshot in its evidence and compare ids. A hash proves only what's derived from it.

## Proof options

| `proof.type` | When | Fields |
|---|---|---|
| `tx` | A direct FastData write, which records its signer | `hash` |
| `nep413` | A relayed write. A function-call key can't sign one | The same as the flower schema's `nep413Proof` |
| `nearai` | A model's enclave signature | `model`, `completion_id`, `text`, `signature`, `signing_address`, `signing_algo` |

`proof` is outside the hash, so one claim can carry a different proof without a new id.

## Export later

Three small pure functions, not built: no on-chain EAS, and no standard claimed.

| Target | `subject`, `verb`, `object` | `by` | `issued_at` | `retracts` |
|---|---|---|---|---|
| `toVC` (W3C VC 2.0) | `credentialSubject` | `issuer` (`did:near:<account>`) | `validFrom` | `credentialStatus` |
| `toEAS` | `recipient`, plus `data` | `attester` | `time` | `revocationTime` |
| `toOLI` | A label on an address | The label pool's attester | `time` | Revocation |

## Additive changes elsewhere

`schemas.claim`; `CLAIM_VERSION` and `VERSIONS.claim`; new exports from `@petal/core` and `@petal/core/types`. No existing shape changed.
