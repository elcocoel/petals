# Open questions

Everything we know we'll have to solve. Each has a working default, so nothing here blocks the start. **Bites** says when it starts to matter.

## Who pays and access

| # | Question | Default for now | Bites |
|---|---|---|---|
| 1 | ~~Who pays for a first answer?~~ Decided: the person, as in any crypto app. Viewing and the written opening stay free | Their agent, their wallet, their money. Judges on an invite | Done |
| 2 | How does a person's wallet fund NEAR's agent directly, so Petal never holds money? Their own NEAR AI key from the browser (CORS allows it), NEAR AI's wallet sign-in, staking for inference, connecting subscriptions | Own agent only, for now | After the vertical line |
| 3 | Payment needs mainnet: Intents has no testnet and no plans for one | Dry quote only | When real payment starts |
| 4 | Do voluntary donations fit first? Or a cut per transaction in a commercial version? 1Click `appFees` tops out at 2.5% to Petal, and only on payments through a quote Petal built | Not built | Later |
| 5 | Fresh chain reads cost shared rate limits more than dollars. How are they limited, per what? | A low limit per caller | Before going public |
| 6 | Does NEAR AI's per-key `spendLimit` reset or last for the key's lifetime, and what happens at the limit? | Use it as a backstop once tested | First hosted key |
| 7 | How should sponsored invites look to their holder: one per person, or one shared? | One per holder, revocable | Before submission |
| 8 | Can a sponsored person publish, and as whom? A shared demo account, plainly labelled? | Yes, plainly labelled | Before submission |
| 8c | A complimentary first dollar per account? Could be drained by many accounts | No | Later |
| 8d | How does a person choose the model behind the agent? Fire's rule: offer, choice and receipt are three facts | The default model. `PETAL_MODEL` is server-wide | After the vertical line |

## Claims and policy

| # | Question | Default | Bites |
|---|---|---|---|
| 9 | Chains can't forget. A wrong claim about a real person can be hidden, not erased. What may go on chain? Who may name a person? Constitution line 56 allows links "wherever public evidence allows" and promises removal, and both hold only off chain | Claims name accounts, contracts and groups. `validateClaim` refuses a natural person, and the rule is in plain words in `claims/people.ts`, for Elco to change | Before any open writing |
| 10 | Open writing invites junk. What keeps it down without a maintainer? | Readers' lenses, plus evidence that can be inspected | Before any open writing |
| 11 | What's the default lens a new reader sees? | `DEFAULT_LENS`: observed plus declared, nobody trusted. Observed because a hash proves it, declared because it's the account's own word about itself. Sourced and inferred stay off, because each is someone's word about someone else. Inferred, if asked for, is always caveated, because it can be wrong about someone who never spoke. With nobody trusted, no outside writer can change what shows: the reader is told challenges exist and can choose to count them. The cost: a new reader never sees `contested` until they trust someone | When claims show up |
| 12 | Confidence: a number or plain bands? Who's allowed to set one? | Bands, by a named person or a named model and version. `minConfidence` is a band too, not the sketch's number. The lowest counted rating stands until its rater replaces it | When a classifier arrives |
| 13 | How is a claimer's standing computed without becoming a popularity contest? | Not computed yet | With the social layer |
| 14 | Which classifier? `typesafe/jev-1.13` on NEAR AI looks suited and cheap, but it's untested and may have no enclave signature | Untested, nothing depends on it | When a classifier arrives |
| 15 | Can a PII filter help screen claims before they become permanent? NEAR AI lists `openai/privacy-filter` | Untested | With question 9 |
| 16 | ~~How do existing labels and corrections become claims?~~ Built: `claimsFromMap` reads them as claims, nothing is rewritten, and their text stays on the row. No label rows exist yet, so this has only run on invented rows | | Done |
| 17 | Should private claims exist, such as someone's own notes or a theory they aren't ready to publish? | Notes stay in the exploration | With explorations |
| 17a | A snapshot's `self-declared` isn't always the account's own word. Moloch's 19 names come from proposal text the member may not have written. Should that status change? | Claims read it as `declared` only when the account wrote the row, otherwise `sourced`. The snapshot's field stays as it is | When names show beside claims |
| 17b | Is an API's report of a chain observed? 491 `pool_contract_stake` rows in the NEAR snapshot come from NearBlocks | `sourced`, so the default lens leaves them off. Flowers don't change: they don't read claims yet | When the UI reads claims |
| 17c | `applyPolicy` can't check a proof, and it trusts `by`. A stored claim pretending to be a snapshot read would show as proved | The reader checks first: validate, match the writer, verify the proof, compare ids against the snapshot (`contracts/claims.md`). Not built, because no reader of stored claims exists | The first reader of stored claims |
| 17d | A crowd can't flip a fact, but it can inflate "1000 writers outside this lens challenge it". Should that count show at all? | It shows distinct writers, in `why` | Before any open writing |
| 17e | The policy has no clock, so a `valid_to` in the past isn't weighed. Add a date to the lens? | No. Snapshot claims are single moments | When claims can expire |
| 17f | Today's label row has no `method` or `grounds`, so an `inferred` label can't be read as a claim. Add them to the row? | It's listed in `skipped`, and stays valid on the map | When labels are written |
| 17g | Free text a machine can't judge: a lower-case name in a note, a name as a `role`, an account id or a token symbol that's someone's name (`TRUMP` is a stored unit), a name inside a URL | Shape checks and a small word list, as a net. A symbol stays, because it's the token's own word | Before any open writing |
| 17h | What do a chain's `events` become? 15 `kicked_out_prev_epoch` rows in the NEAR snapshot have no claim | They stay rows: they aren't relations between accounts | With relations |

## Identity and agents

| # | Question | Default | Bites |
|---|---|---|---|
| 18 | Which wallets after NEAR, and in what order? near-connect is NEAR only | EVM, then Solana, then Bitcoin | After the NEAR slice |
| 19 | A person with only a Bitcoin wallet can explore and approve, but can't publish under their own name, because publishing needs NEP-413. Is that acceptable? | Yes, for now | With question 18 |
| 20 | What does "private" promise? The operator can read the workspace, and the enclave covers only the model step | Say so plainly | Before any public promise |
| 21 | Do wallets show the recipient reliably, and does signing work inside a connector's popup or on mobile? | Unknown, test with Meteor first | With sign-in |
| 22 | Claude needs a transport 401, and ChatGPT a tool error with `_meta`. Can one server serve both? | Needs a live test | With OAuth |
| 23 | Cursor's callback uses `localhost:8787`, which clashes with Petal's default local API port | Change ours | With OAuth |
| 24 | Are function-call keys worth scheduling for agents writing as the maker? They can't sign NEP-413 and don't work in Claude or ChatGPT | After explorations | Later |
| 25 | What's the recovery story for someone with one lost wallet? | Export, and honesty | Before any public promise |
| 25aa | What does one yes cover? "Draw these two and compare them" is one sentence and two targets | One new target, and being told to draw counts the same way. A second one in the same chat is refused and asked about again, though what's stored of it can still be read. A read that fails doesn't use the yes up, so the model can correct a typo | When people compare in one go |
| 25ab | Which words are a yes? `packages/agent/src/is-yes.ts` is a word list in English, Portuguese and Spanish. A message must be made of them, or be a plain yes and at most four more words that say which ("yes, the second", which the live check's model invited), with no doubt or question word. So "ok" and "yes I see" count even when they only meant "I see", and "good" or "great" don't. Since 6 Nov it also has to answer a true yes-or-no question: after an either-or or a list a plain yes says nothing about which ("stored, or fresh?", "Who holds Nouns?"), so the call is held and the model asks again, once. That's read from the words of the agent's last message (`askedYesOrNo`) | The list as it stands: unsure means ask again | The first time it misreads someone |
| 25ac | Must a stored snapshot wait for a yes? Nothing is fetched, and it costs only model calls. And must someone who said "Draw me…" be asked? | **No to both, since 6 Nov:** the revisit fired ("Who has the largest share? One line." got "I can't quote a number"). A new map is a fresh read or a drawing, and those stay held. A `get_snapshot` with no yes is answered from the newest stored snapshot of that target, however old, through a module that can't reach a source (`stored-read.ts`). It's marked `stored_only` and agrees to no drawing. Being told to draw is the yes (`asksToDraw`: an imperative that names something, in English, Portuguese or Spanish), unless it would pick among the candidates of an ambiguous `find_target`. "Who holds X?" is a question and still gets asked | If old data gets taken for current, or a "draw" that wasn't meant as one spends a read |
| 25ad | The key leaves out the date, so a newer read of an approved target needs no new yes, though it can be a fresh read | No new yes: same target, and the design's key | When fresh reads cost a person money |
| 25ae | After a refusal, what can the model still do? It used to get no tools, so one that reached for the map before looking had nothing to report and could only ask | **Since 6 Nov it keeps what only reads:** the revisit fired. It loses `propose_spec` and `render_flower`, unless something has already been agreed to in this run. Asking again for what was just refused isn't a call, and its words stand. A model with no words and nothing else left gets one call with no tools. Bounded by the rounds as before | If it spends rounds without answering |
| 25af | A draft the site sends with a chat, and a flower already drawn in the run, count as approved, so varying one takes no yes. A flower from the shared map doesn't, until it's in the run | As stated | When the map is what people start from |

## Coming back

| # | Question | Default | Bites |
|---|---|---|---|
| 25a | Anyone can start an exploration or store a spec with no sign-in, up to the tool rate limit. What stops someone filling the disk? | 60 calls a minute per address, a size limit on each row, and 500 steps and 500 notes on each exploration. No limit on how many unowned explorations exist, and nothing expires | Before going public |
| 25b | An unowned exploration's link can't be revoked by anyone: no owner exists until it's claimed. Should its holder be able to? | No. Whoever holds it can claim it, then revoke it | When someone asks |
| 25c | A link is a capability in a URL, so it lands in browser history and chat logs, and any proxy's logs. Does a `continue` link need an expiry? | No expiry, revocable. Petal's own logs don't print it | Before going public |
| 25d | A fork copies notes and the question, so a read link's holder keeps them after it's revoked. Fine? | Yes: they could already read them. Authors stay marked `fork:` | When sharing shows up in the UI |
| 25e | Conversations don't travel, but a site's run could pick up what another agent saved. Should a follow-up on the site tell the model about steps it didn't draw? | No prompt text. The site's chat already takes `draft: { spec }`, so the frontend can pass the packet's `current.spec` | When the frontend shows explorations |

## Data and the map

| # | Question | Default | Bites |
|---|---|---|---|
| 26 | What identifies a group over time, so two dates of one group connect? | The module and its parameters, leaving out `window_days`, which is how it was read. In claims, `group:` refs are scoped to one snapshot for now, so they can't falsely join. `holds` points at the asset, which does connect across dates | With relations |
| 27 | Is the same EVM address on Ethereum and Base one account? It often is, but that's still a claim | Separate refs, and separate account ids in the relations index, where a match is marked `inferred` with its method and paths don't walk it unless asked. `same_address` is an inferred claim that says nothing about control, and `declares_same_controller` is full only when both accounts say so. Nothing merges | With relations |
| 28 | Super-node groups connect everything in traversal. How do paths stay meaningful? | Group sizes on every hop, and how many groups each shared account is in. No score yet | With relations |
| 29 | Overlap between a full read and a window read is only a lower bound. How is that shown? | `at_least`, with the coverage facts of each side | With relations |
| 30 | Is "network", "group" or something else the right word in code? And what replaces "atlas", if anything? | Keep `network` in code | When Elco decides |

## Runtime

| # | Question | Default | Bites |
|---|---|---|---|
| 31 | When does one process stop being enough? | A second tenant or a second worker | Later |
| 32 | How long may a run last? The code's own limit is 120 s, and a chat has been cut off there | Raise it once runs are durable | With durable runs |
| 33 | When is the move to Postgres? The same SQL mostly carries over | Not before the freeze | Later |
| 34 | Where do backups go, and encrypted how? | Nightly, encrypted, off the machine | With hosting |

## Beyond the build

| # | Question | Bites |
|---|---|---|
| 35 | The social layer: how people interact with claims | Sketch and talk later |
| 36 | Could this become a DAO creation and management platform? | Ideas drawer |
| 37 | Beyond chain data: any entity with control over anything | After on-chain works |
