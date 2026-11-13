# Petals target research: identity, claims and accountability

**Scope update — Elco, 8 November 2026 (after this research):** wallet-only login. Socials are only ever self-connected fields on the user’s profile, with no login, messaging or other functions. Private messaging is not a goal. Claims are private commentary for now; Petals will not define or declare truth. Public-claim storage research resumes only after basic testing and usability. The upgradable mapping protocol follows testing, covering Elco’s broader list of mapping targets. The earlier social-login, messaging and public-claim recommendations below are historical options, not current scope. Current follow-ups: [Intents for non-NEAR users](intents-current.md) and [contract shortlist/Sputnik](near-contract-shortlist.md).

Research date: **8 November 2026**. Owner: **RESEARCH**, for META COORDINATOR. Based on the approved [003 target](spec.md); these are recommendations for review, not new product decisions. Freeze: 12 November; submission planned for 13 November.

Evidence labels used throughout:

- **Read in docs**: primary documentation, standards, legislation or source code read on 8 November 2026. A source publication date is included where available; undated documentation is identified by access date, not an invented publication date.
- **Tested — prior pass**: a specific result recorded in the project's 4–5 November research, not rerun here. Those experiments had different permissions; this pass made no accounts, signatures, transactions, model calls or payments.
- **Inferred**: our interpretation, proposed design or calculation. It is not a tested integration or a legal ruling.

The earlier research remains useful evidence, especially `research/near-tooling/near-identity.md`, `near-data.md`, `near-agents.md`, `near-ai.md` and `near-pay.md` in the project folder. Its architecture recommendations predate the approved target. References to an Elco-funded agent, sponsored publishing, a server-side agent loop or limited agent keys as the publishing path do not carry forward.

**Terms used in the summary.** An API (application programming interface) lets software call another service. OAuth is a protocol for giving an application limited access to a provider account; a sign-in flow uses that access to identify the account. An RPC (remote procedure call) endpoint is a network service for querying a blockchain node. A wallet signature proves possession or authorized use of signing credentials at that moment, not a person’s legal identity.

## The leans

All entries in this table are **Inferred**.

| Question | Lean | Main reason / remaining boundary |
|---|---|---|
| Q2 wallets | NEAR message sign-in first; Ethereum-family sign-in for the first second-chain link; separate adapters for Solana and Bitcoin | Prove each link independently. Named NEAR accounts and contract wallets need authoritative state checks; the target's ban on server chain reads needs a precise exception or a different trust model. |
| Q3 socials | GitHub and Google first; Discord or Telegram where useful; Farcaster for portable signed proofs; X conditional on app access and pricing | Social control is not legal identity or unique personhood. OAuth proofs usually remain provider-dependent. |
| Q4 claims | A small append-only NEAR contract is the stronger target for retained public claim bodies; FastData is a useful cheaper prototype/index, with an explicit archival dependency | FastData alone cannot honestly satisfy an unconditional permanence promise. Contract choice still depends on the publication policy and review of new contract code. |
| Q5 accountability | Signed records, narrow evidence-backed claims, challenges, replies and retractions; initially show outcomes, not one score; defer money-based penalties | A bond does not supply a competent referee. Uncontested claims are not proven true. |
| Q6 profiles | Private by default, separate explicit public proofs, no private-link hashes on chain; narrower handling of claims identifying people | Public attribution need not expose every login wallet or a person's civil name. Immutable publication creates obligations an interface cannot undo. |
| Q8 payments | Person funds NEAR AI directly and keeps their key in their own agent; consider Intents separately for a defined payment | A token swap is not automatically a Cloud-credit purchase. |

## Decisions this research cannot make

**Inferred from the approved target.** These are concrete specification tensions, not reasons to stop the research:

1. **Authentication reads.** TGT-030 forbids server chain/web reads for visitors. Checking a named NEAR account's current key, an Ethereum contract wallet or a social OAuth callback needs authoritative external information. Client assertions alone are not adequate. Lean: explicitly permit bounded authentication verification and provider key retrieval, distinct from mapping work. If absolutely no such reads are allowed, reduce supported proof types or accept a specified external verifier; do not silently weaken verification.
2. **Public author versus private wallet.** TGT-004 allows private links; TGT-020 requires public attribution. A wallet used to send a public NEAR claim is publicly visible. Lean: the person chooses a public publishing identity; linking a private wallet never silently publishes it. Someone with only private links must choose an eligible public identity before publishing. This does not require a real-world name.
3. **Permanent claims versus people.** Story 6 includes who a wallet belongs to. Narrowing third-party identification of natural persons changes that scope. The recommendation below must be approved by Elco; it is not already a target requirement.
4. **Standing versus adjudication.** The target mentions claims upheld but defines no authority that upholds them. Until a review rule exists, report issued, challenged, answered and retracted; do not fabricate an upheld counter.
5. **Contract deposits versus no custody.** Storage deposits lock contributors' NEAR in the contract account. A design with no operator withdrawal and no treasury is materially different from Petals holding spendable customer balances, but that distinction must be explicit under the target's no-money-custody rule.

## Q2. Proving and linking wallets

### Lean and the unresolved specification conflict

**Inferred:** lean toward four small verification adapters with one shared challenge/session/linking service. A connector asks the wallet to sign; the server independently verifies. A signature proves authorisation by a key or account policy at verification time, not a unique human, beneficial ownership, historical activity or permanent control.

**Inferred, grounded in the standards below:** TGT-030's “server does no chain reads” conflicts with secure current NEAR account verification and EVM smart-wallet verification. No transaction fee does **not** mean no RPC: RPC is a request to a blockchain node, consuming connectivity, provider capacity and potentially fees. This also needs reconciliation with TGT-031/SC-T3's literal restriction on Elco's connection.

Possible approaches:

- Allow narrowly bounded identity-verification reads, separate from visitors' mapping work. This is my lean, subject to Elco changing/clarifying the target.
- Keep the prohibition and explicitly limit accepted proofs to locally verifiable key/address identities; ordinary named NEAR accounts and EVM contract authorisation remain unsupported.
- Have visitors supply independently verifiable chain-state proofs. An ordinary browser RPC response or “verified” boolean is forgeable. A light-client/proof system adds substantial scope; no ready integration was established here.

### What each standard verifies

#### NEAR — NEP-413

A **NEP** is a NEAR Enhancement Proposal; **EIP/ERC** names Ethereum proposal/interface standards, and **BIP** names Bitcoin Improvement Proposals. **Ed25519** and **ECDSA** are digital-signature algorithms. **SHA-256** produces a fixed-size fingerprint, or hash, of exact bytes; a hash does not store the original data. **Gas** is the fee for executing a chain transaction; message signing itself need not execute one.

**Read in docs:** Final, created **2022-10-25**. The signed payload contains message, 32-byte nonce (a fresh, single-use challenge), recipient and optional callback URL; Borsh (a deterministic binary format) encoding, a protocol tag and SHA-256 hashing separate it from transactions. Account ID and network are not native signed fields. Full-access keys are required. [NEP-413](https://github.com/near/NEPs/blob/master/neps/nep-0413.md)

**Read in docs:** `near-api-js`'s verifier checks `viewAccessKey` for `FullAccess`, then verifies the signature; success resolves `Promise<void>`, failures throw. It does not manage challenges or sessions. [Pinned verifier source](https://github.com/near/near-api-js/blob/08d29f447abcb8b8c9bec35645638fbf3d979257/src/nep413/verify.ts)

**Read in docs:** for a nonexistent Ed25519 implicit account (an account ID derived directly from its public key), NEAR Auth documents accepting the public key's exact hex account ID **only after `view_account` returns `UNKNOWN_ACCOUNT`**. Missing keys, RPC outages and other errors are insufficient; an existing implicit account can rotate keys. NEAR Auth's own signing route uses an on-chain call, unlike ordinary wallet NEP-413 signing. [Verification/security guide](https://docs.auth.near.org/home/guides/sign-messages.md)

**Inferred:** bind account, network and operation explicitly inside Petals' message; reconstruct callback URL exactly. Recheck present authorisation at login and sensitive changes. Never accept an old deleted key through an implicit-account fallback. Contract accounts need another path: **Read in docs:** NEP-641's `w_resolve_auth` uses current-state view calls, potentially recursively. Final; created **2026-06-02**, updated **2026-08-11**. [NEP-641](https://github.com/near/NEPs/blob/master/neps/nep-0641.md)

#### Ethereum / Ethereum Virtual Machine (EVM) chains — Sign-In with Ethereum (SIWE), including smart wallets

**Read in docs:** EIP/ERC-4361 is Final, created **2021-10-11**. SIWE is a structured login message, signed using ERC-191, Ethereum’s signed-message envelope. Check syntax and expected domain, URI, chain, nonce and time constraints. Sessions bind to addresses; contract verification resolves on the stated chain. [SIWE standard](https://eips.ethereum.org/EIPS/eip-4361)

**Read in docs:** an EOA (externally owned account) is an account controlled by a private key; viem's standalone `verifyMessage` recovers and compares its address locally. This does not support contract accounts. [Utility source](https://raw.githubusercontent.com/wevm/viem/main/src/utils/signature/verifyMessage.ts)

**Read in docs:** smart wallets authorise through code. ERC-1271 calls `isValidSignature`, requiring magic result `0x1626ba7e`; validity may change with owners, thresholds, time or state. Created **2018-07-25**, Final. [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271)

**Read in docs:** ERC-6492 handles **counterfactual** wallets: addresses whose wallet contract has not yet been deployed. Its wrapper carries factory/preparation data; verification can simulate deployment and validation through `eth_call`, without broadcasting or spending gas. Check the wrapper before ordinary contract/EOA verification; consult current deployed policy when present. Created **2023-02-10**, Final. [ERC-6492](https://eips.ethereum.org/EIPS/eip-6492)

**Read in docs:** viem's public-client SIWE action combines message checks with universal signature verification. Its validator does not compare every application expectation: enforce URI, chain, purpose and maximum challenge age separately. [SIWE action](https://raw.githubusercontent.com/wevm/viem/main/src/actions/siwe/verifySiweMessage.ts), [validator](https://raw.githubusercontent.com/wevm/viem/main/src/utils/siwe/validateSiweMessage.ts)

**Inferred:** lean toward viem for smart-wallet coverage. Spruce's `siwe` is an alternative parser/verifier, but its inspected contract helper provides ERC-1271 with a provider, not a complete ERC-6492 path. [Spruce helper](https://raw.githubusercontent.com/spruceid/siwe/main/packages/siwe/lib/utils.ts) Bound RPC chain/endpoints, gas, size and timeout; never broadcast factory data. Revalidate smart-wallet sessions before sensitive operations; short sessions limit, but do not instantly detect, owner changes. EIP-7702 permits code on EOAs, so “has code means no private key” is obsolete. [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) (created **2024-05-07**, Final).

#### Solana — SIWS (Sign-In with Solana)

**Read in docs:** SIWS supplies structured sign-in fields; the wallet returns signed bytes and account. Local Ed25519 verification needs no chain read. Use server-stored input with `verifySignIn`; check address/public-key correspondence. [SIWS specification](https://github.com/phantom/sign-in-with-solana) (undated), [utility source](https://raw.githubusercontent.com/anza-xyz/wallet-standard/master/packages/core/util/src/signIn.ts)

**Read in docs:** newer `solana:signIn` 1.1 supports an off-chain envelope. Plain `wallet-standard-util` verification covers plain SIWS; current `@solana/wallet-adapter/core` handles both formats. Feature-detect; hardware support varies. [Solana guide](https://solana.com/docs/frontend/messages-and-auth) (undated). **Inferred:** don't use its transaction fallback for Petals' free sign-in. A multisignature account requires approval from multiple signers. A program-derived address (PDA) cannot sign ordinary SIWS: **Read in docs:** PDAs have no private key. A member's signature proves that member, not the treasury. [PDA documentation](https://solana.com/docs/core/pda)

#### Bitcoin — BIP-322 compatibility needs an explicit boundary

**Read in docs:** current master is **Complete, version 2.1.0**, assigned **2018-09-10**, not the old Draft. It verifies script satisfaction (meeting an address's spending rules) using virtual transactions, without spending coins. Current formats include `smp`, `ful` and `pof` prefixes; old unprefixed simple proofs may be accepted for compatibility. Simple covers native SegWit/Taproot (newer Bitcoin address/spending formats) without timelocks (rules delaying spending); full covers broader scripts. Unsupported scripts yield inconclusive, not valid. Proof-of-funds additionally needs current UTXO (unspent transaction output) state. [Canonical BIP-322](https://github.com/bitcoin/bips/blob/master/bip-0322.mediawiki)

**Read in docs:** `bip322-js` supports limited simple proofs: P2WPKH (native single-key SegWit), nested P2SH-P2WPKH (its older address wrapper) and single-key-spend P2TR (Taproot); P2PKH (older single-key addresses) uses legacy verification. It defaults to loose BIP-137 acceptance, including out-of-spec Taproot compatibility. [Library README](https://github.com/ACken2/bip322-js), [verifier](https://raw.githubusercontent.com/ACken2/bip322-js/main/src/Verifier.ts). Its inspected 4.0.1 verifier consumes raw base64 witness data, not the complete current format family.

**Inferred:** candidate only, not a general BIP-322 verifier. Lean initially toward P2WPKH (native SegWit single-key addresses) and Taproot key-path proofs (signing with the output key); defer arbitrary multisig/scripts. Explicitly dispatch protocol/prefix, reject unsupported formats and review the required signature-hash rules (which transaction fields the signature commits to) and spending-script rules. The strict legacy flag alone does not establish full conformance. Test current vectors against the pinned package before acceptance.

**Read in docs:** Xverse's `sats-connect` can explicitly request `protocol: "BIP322"`; defaults depend on address type. UniSat offers `"bip322-simple"`, defaulting otherwise to ECDSA. These names do not establish compatibility with current BIP prefixes. [Xverse](https://docs.xverse.app/sats-connect/bitcoin-methods/signmessage), [UniSat](https://github.com/unisat-wallet/unisat-dev-docs/blob/master/wallet-api/api-docs/sign-message.md) (both undated).

### Shared server and linking rules

**Inferred:** issue a cryptographically random, short-lived, single-use challenge bound to the initiating pre-session/session, expected origin, chain, address, operation and target Petals account. Consume it atomically with login/link creation. Timestamps alone cannot stop replay. Never trust client-supplied expected fields or verification results. Keep exact signed bytes; reject malformed/oversized input and fail closed on unavailable state checks.

**Inferred:** linking requires a fresh proof from wallet B while authenticated with A, explicit “link” consent, cross-site request forgery (CSRF) protection, which prevents another site from initiating an action in the signed-in session, and recent reauthentication for sensitive changes. Enforce unique chain-qualified wallet bindings transactionally; a wallet belonging to another Petals account must not silently merge accounts. Signing in and publishing a claim require different messages. Local/session security remains necessary after signature verification. [OWASP sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) (undated).

**Inferred:** preserve network in wallet identity; normalise per chain, not by lowercasing everything. CAIP-10, the Chain Agnostic Improvement Proposal for account identifiers, supplies chain-qualified identifiers but leaves canonicalisation to implementers. [CAIP-10](https://standards.chainagnostic.org/CAIPs/caip-10) (created **2020-03-13**, updated **2022-10-23**). Do not automatically link other chains or NEAR accounts sharing a key. Keep private links and proofs off chain, including hashes. Record verification method/time/block where relevant. Removing a wallet should revoke its sessions; prevent removal of the last usable login without recovery. Ordinary key-address rotation means linking a new address while access remains. Account transfer is particularly consequential: every linked wallet can reach the entire Petals account; a shared treasury should not silently become someone's personal recovery credential.

### Library snapshot and evidence limits

**Read in docs — npm publisher metadata**, not installed or executed. Dates below are version publication dates; source branches and installed versions can differ.

| Candidate | Version observed | Published | Registry |
|---|---:|---|---|
| NEAR connector | 0.12.0 | 2026-10-26 | [near-connect](https://registry.npmjs.org/@hot-labs%2fnear-connect) |
| NEAR verification | 7.4.0 | 2026-10-23 | [near-api-js](https://registry.npmjs.org/near-api-js) |
| EVM | 2.57.17 | 2026-11-08 | [viem](https://registry.npmjs.org/viem) |
| EVM alternative | 3.0.0 | 2025-01-21 | [siwe](https://registry.npmjs.org/siwe) |
| Plain SIWS | 1.2.0 | 2026-10-05 | [wallet-standard-util](https://registry.npmjs.org/@solana%2fwallet-standard-util) |
| SIWS/envelope adapter | 3.2.0 | 2026-11-06 | [wallet-adapter](https://registry.npmjs.org/@solana%2fwallet-adapter) |
| Bitcoin verifier candidate | 4.0.1 | 2026-11-01 | [bip322-js](https://registry.npmjs.org/bip322-js) |
| Bitcoin connector | 4.2.1 | 2025-10-28 | [sats-connect](https://registry.npmjs.org/sats-connect) |

**Tested — prior, 2026-11-05, reported in `research/near-tooling/near-identity.md`:** synthetic NEAR cases exposed unfunded implicit-account rejection and callback mismatch; Intents view calls accepted synthetic EVM/Solana-style signatures and rejected mismatches. These were neither SIWE/SIWS interoperability nor smart-wallet/BIP-322 tests. No current fix or real-wallet behaviour was verified here.

**Inferred — next validation:** after resolving the reads conflict, check duplicate/concurrent replay, wrong origin/network/purpose, deleted NEAR keys, EVM owner changes/counterfactual wallets, both SIWS formats, BIP prefixes/address types and conflicting links. A signed issue time is an assertion, not independently trusted historical dating; Q4 must address durable public claim verification separately.


## Q3. Proving social accounts

**Inferred from the target:** Story 3 and TGT-002 require sign-in. A public-post fallback is an option to discuss, not an already approved replacement.

### Terms and the central tradeoff

**Inferred, from the mechanisms below:** OAuth permits an app to ask a provider who the user is. Its access token is a bearer credential: possession enables use. OpenID Connect (**OIDC**) adds a provider-signed identity statement, the ID token. A nonce is a single-use challenge; `state` binds callbacks to sessions; PKCE (Proof Key for Code Exchange) binds authorization codes to their initiator.

A **signed post** names the Petals profile and challenge, signed by its wallet, then published socially. The wallet signature proves only the wallet side: check the actual author's stable provider ID separately. Screenshots/handles are insufficient. Farcaster casts additionally carry protocol signatures; ordinary posts/gists do not expose equivalent independent authorship proofs.

**Inferred:** OAuth/API verification leaves outsiders trusting Petals' checking record. Hashing that record on NEAR adds no provider signature. ID tokens are more portable but contain audience, expiry and possibly private data; they do not alone prove consent to link a particular wallet or publish it. Historical checks need signing-key/time evidence; fresh links must respect expiry.

### Provider comparison

All mechanisms and published limits in this table are **Read in docs**; suitability comments are **Inferred**. Costs are provider charges, excluding our hosting, networking and engineering. “No tariff found” is **not evidence of a guaranteed free service**.

| Provider | Sign-in proof and stable identifier | Published cost / restriction | Post route and lean |
|---|---|---|---|
| **X** | OAuth 2 authorization code + PKCE, then authenticated `GET /2/users/me`. Use user `id` as a string, not `@handle`. Also inspect the OAuth 1.0a alternative below. [X1–X4] | Current pay-per-use table: user read **$0.010/resource**, post read **$0.005/resource**. Prepaid developer credits; no subscription/minimum spend stated. `/users/me`: **75/user/15 min**. [X5–X6] | A public challenge post still needs authenticated API authorship checking and is removable/editable. Public posting is an extra disclosure, not a free substitute for verification. Lean: optional later; settle identity-only OAuth 1.0a cost first. |
| **GitHub** | OAuth code flow, `state` and S256 PKCE (the SHA-256 variant); `GET /user` returns numeric `id` and `node_id`. No scopes needed for the public user response. [GH1–GH3] | No per-login/read tariff located in these docs. REST: **60/hour/IP** unauthenticated; ordinarily **5,000/hour/user** authenticated, shared with other apps. Verified email needed to authorize; flagged accounts may be blocked. [GH4–GH5] | Public gist can be read anonymously and exposes `owner.id`; user publishes it themselves. Avoid requesting `gist` write permission. Lean: useful low-permission sign-in, with a public gist as an explicit fallback. [GH6] |
| **Farcaster** | Sign-In with Farcaster (SIWF) / AuthKit returns a signed sign-in message and **FID** (Farcaster identifier). Verify domain, nonce, signature and signer's authority for that FID. Username is mutable. [FC1–FC3] | Signing an existing account's message requires **no on-chain transaction/gas**. AuthKit documents a default message relay and Optimism-chain RPC, not a fee schedule, quota or service-level guarantee. Registration/storage are separate paid operations; exact current amounts require contract price reads plus gas. [FC4–FC6] | Cast lookup returns FID, hash, signature and signer. This supports stronger independent checking, including signer authorization. Lean: the strongest fit for portable social proof; prefer SIWF over requiring a cast. [FC7–FC8] |
| **Telegram** | Current login supports **OIDC**, bot registration and allowed origins/redirects. Key the OIDC link by **issuer + `sub`**; `profile` additionally gives Telegram `id`. Do not assume `sub == id`. [TG1] | Officially described as a **free** login platform. Requires BotFather setup and client credentials; no numerical login quota stated. Phone and messaging access are optional. [TG1] | Public channel/group authorship can represent a channel or anonymous admin. A posted challenge is a poor default for proving an individual user. Lean: OIDC, if this audience matters. [TG2–TG3] |
| **Discord** | Documented OAuth code flow + `identify`, then `GET /users/@me`; store string **user snowflake ID (Discord’s unique numeric account identifier)**. `email`, `guilds`, `connections` and bot installation are unnecessary for this proof. [DC1–DC2] | No per-login/API tariff located. Per-route quotas are dynamic: inspect headers and `Retry-After`; do not promise a fixed login throughput. Bot global ceiling **50 requests/s** is not a login entitlement. [DC3] | Channel-message verification needs access permissions; content may require privileged intent. Webhook author names can impersonate user names. Lean: OAuth; avoid building a message-reading bot for linking. [DC4–DC5] |
| **Google** | Google Identity Services (GIS) Sign in with Google / OIDC; validate signed ID token. Store canonical issuer + **`sub`**, which Google documents as unchanged and never reused; not email. [G1–G3] | Cloud project/account are documented as free; these login docs publish **no per-login tariff**. Do not substitute Firebase/Identity Platform MAU prices for direct GIS. Registration, origins and consent/branding configuration still apply. [G4–G6] | No general Google-account signed-post proof established here. A YouTube identity or public document is not automatically the same identifier as the Google OIDC subject. Lean: private optional account link, not a default public label. |

### Details that change the choice

**X — Read in docs:** OAuth 1.0a `oauth/access_token` returns `user_id`/`screen_name`; read-only access is available. This may avoid paid `/users/me`. Public pricing does not establish handshake cost or new-app eligibility without credit. **Inferred:** neither “all X login costs one cent” nor “X login is free” is established. OAuth 2 user lookup scopes are `tweet.read users.read`; avoid write/email/offline access. Tokens normally last two hours. [X1–X3]

**X — Read in docs:** API posting costs **$0.015**, or **$0.200 with a URL**; these are not manual-posting charges. Discounted Owned Reads require qualifying developer-owner data. Daily resource deduplication is a soft guarantee. [X5] Off-X matching has consent rules; stored content must track deletions/modifications, including removal within 24 hours of an applicable request. **Inferred:** permanent on-chain copies of proof content are a poor fit. [X7]

**GitHub — Read in docs:** old usernames can be reclaimed; keep authenticated IDs. [GH2, GH7] **Inferred:** check gist `owner.id`, exact challenge and wallet signature; copied contents must fail. Commit author/email is insufficient. Signed commits/tags exist, but checking their key/account relationship adds complexity. [GH6, GH8]

**Farcaster — Read in docs:** SIWF uses EIP-4361, chain ID 10 and `farcaster://fids/<fid>`. Current AuthKit supports authorized **auth addresses** as well as custody addresses, checking authority separately from signature validity. [FC1–FC2, FC9] **Inferred:** record the authority method. For casts, validate bytes/hash/signature, key authorization and relevant chain state/time. A historic signature does not establish continuing control after recovery/key removal. [FC7–FC8, FC10]

**Telegram — Read in docs:** verify the token signature using the public JSON Web Key Set (JWKS), the provider’s verification keys, and check issuer, intended application (audience), and expiry. The default signature algorithm is RS256 (RSA with SHA-256). Request `openid`, optionally `profile`; avoid phone/messaging scopes. No UserInfo endpoint. EdDSA/ES256K options allow only `openid`. [TG1] Legacy-widget HMAC (a shared-secret message authentication code) requires the bot secret, preventing independent verification without it. Mini Apps separately support public Ed25519 verification; neither flow was tested. [TG4–TG5]

**Discord — Read in docs:** linked OIDC discovery advertises RS256/JWKS/S256; the ordinary scope table documents `identify`. No working OIDC scope/claims flow was established. **Inferred:** do not claim OIDC is absent or ready. [DC1, DC6] `identify` grants no arbitrary message access; post verification adds channel/content permissions and infrastructure. [DC4–DC5]

**Google — Read in docs:** verify signature, allowed issuer, audience, expiry and CSRF; bind a nonce where supported. Email is mutable, and Google may not remain authoritative for a third-party email address. [G2–G3] Identity-only scopes have an explicit exception to the usual Testing restrictions: no test-user allowlist requirement, warning or seven-day authorization expiry for that case. Adding other scopes removes the exception. Workspace/Advanced Protection restrictions may still block users. [G5] Brand verification is separate: external production name/logo display requires it; no review turnaround is assumed here. [G6]

### Lean

**Inferred:** lean toward GitHub and optional Google for broad sign-in; Farcaster where portable social proofs matter; Discord/Telegram according to audience; X after resolving identity-only access and payer. Links remain private by default. Public challenges are an opt-in fallback, especially GitHub/Farcaster. No provider list is decided.

Bind attempts to the authenticated profile, fresh challenge and explicit linking consent. Retain stable ID, method, checked time, visibility and status. Matching emails/handles and another provider's linked accounts are insufficient. Show “control checked on [date], using [method]”, not “verified human.” Separate revocation from historical evidence.

Two spec seams remain. Backend OAuth exchanges and `/me` calls use Petals' connection; X may spend its credits. Unsigned JSON from a visitor's agent cannot replace verification. TGT-030/031 need an explicit authentication exception or different architecture. Also, SC-T2 claim-signature verification does not make attached OAuth links independently verifiable. Label those layers separately; never publish private links/tokens to improve portability.

### Primary-source register

All accessed **2026-11-08**. **ND** = no publication/update date shown in the inspected page; not an assertion the content is recent. Links above use these IDs. Mutable source branches are documentary evidence, not tested deployed versions.

| IDs | Primary sources | Publication/update shown |
|---|---|---|
| X1 | [OAuth 2 authorization code + PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code) | ND |
| X2 | [Authentication mapping](https://docs.x.com/fundamentals/authentication/guides/v2-authentication-mapping), [Get My User](https://docs.x.com/x-api/users/get-my-user) | ND |
| X3 | [OAuth API reference, including access-token response](https://docs.x.com/fundamentals/authentication/api-reference), [Log in with X](https://docs.x.com/fundamentals/authentication/guides/log-in-with-x) | ND; dated example responses are not publication dates |
| X4 | [X IDs](https://docs.x.com/fundamentals/x-ids) | ND |
| X5 | [Pay-per-use pricing](https://docs.x.com/x-api/getting-started/pricing), [Changelog](https://docs.x.com/changelog) | Pricing page ND; relevant change announced 2026-04-16, effective 2026-04-20; latest changelog entry inspected 2026-11-05 |
| X6 | [Rate limits](https://docs.x.com/x-api/fundamentals/rate-limits) | ND |
| X7 | [Developer Policy](https://docs.x.com/developer-terms/policy), [Post lookup and edits](https://docs.x.com/x-api/posts/lookup/introduction) | ND |
| GH1 | [Authorizing OAuth apps: developer flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) | ND |
| GH2 | [Authenticated user endpoint](https://docs.github.com/en/rest/users/users#get-the-authenticated-user) | ND |
| GH3 | [OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps) | ND |
| GH4 | [REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) | ND |
| GH5 | [Authorizing apps: user restrictions](https://docs.github.com/en/apps/oauth-apps/using-oauth-apps/authorizing-oauth-apps) | ND |
| GH6 | [Gists REST API](https://docs.github.com/en/rest/gists/gists) | ND |
| GH7 | [Username changes](https://docs.github.com/en/account-and-profile/concepts/username-changes) | ND |
| GH8 | [Commit signature verification](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification) | ND |
| FC1 | [SIWF FIP-11, finalized discussion](https://github.com/farcasterxyz/protocol/discussions/110) | 2023-09-01 original publication; later discussion is not the original date |
| FC2 | [AuthKit verifySignInMessage](https://docs.farcaster.xyz/auth-kit/client/app/verify-sign-in-message) | ND |
| FC3 | [Accounts](https://docs.farcaster.xyz/learn/what-is-farcaster/accounts), [Usernames](https://docs.farcaster.xyz/learn/what-is-farcaster/usernames) | ND |
| FC4 | [AuthKit provider: relay/RPC defaults](https://docs.farcaster.xyz/auth-kit/auth-kit-provider), [Create channel](https://docs.farcaster.xyz/auth-kit/client/app/create-channel) | ND |
| FC5 | [Create an account: contract price reads](https://docs.farcaster.xyz/developers/guides/accounts/create-account) | ND |
| FC6 | [Storage Registry: price, annual rental](https://docs.farcaster.xyz/reference/contracts/reference/storage-registry) | ND |
| FC7 | [Snapchain casts API](https://snapchain.farcaster.xyz/reference/httpapi/casts) | ND |
| FC8 | [Snapchain message/signature format](https://snapchain.farcaster.xyz/reference/datatypes/messages) | ND |
| FC9 | [Published verifier source](https://raw.githubusercontent.com/farcasterxyz/auth-monorepo/main/packages/auth-client/src/messages/verify.ts) | ND; mutable `main` source inspected, not executed |
| FC10 | [Onchain signer events API](https://snapchain.farcaster.xyz/reference/httpapi/onchain) | ND |
| TG1 | [Current Telegram Login/OIDC](https://core.telegram.org/bots/telegram-login) | ND |
| TG2 | [Bot FAQ: message visibility](https://core.telegram.org/bots/faq) | ND |
| TG3 | [Bot API: User/Message/from/sender_chat](https://core.telegram.org/bots/api#message) | Latest listed release 10.3, 2026-08-24; individual object sections undated |
| TG4 | [Legacy login widget/HMAC](https://core.telegram.org/widgets/login-legacy) | ND; explicitly legacy |
| TG5 | [Mini Apps third-party signature verification](https://core.telegram.org/bots/webapps#validating-data-for-third-party-use) | Individual section ND; public verification added under 2024-11-17 changes; latest listed page change 2026-06-11 |
| DC1 | [OAuth2](https://docs.discord.com/developers/topics/oauth2) | ND |
| DC2 | [User resource](https://docs.discord.com/developers/resources/user) | ND |
| DC3 | [Rate limits](https://docs.discord.com/developers/topics/rate-limits) | ND |
| DC4 | [Message resource: authors/webhooks/permissions](https://docs.discord.com/developers/resources/message) | ND |
| DC5 | [Gateway: message-content privileged intent](https://docs.discord.com/developers/events/gateway) | ND |
| DC6 | [Official OIDC discovery metadata](https://discord.com/.well-known/openid-configuration) | ND; reading metadata is not a login test |
| G1 | [GIS overview](https://developers.google.com/identity/gsi/web/guides/overview) | Updated 2026-02-10 |
| G2 | [Verify Google ID tokens](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token) | Updated 2025-12-22 |
| G3 | [Google OIDC: claims and stable subject](https://developers.google.com/identity/openid-connect/openid-connect) | Updated 2026-10-29 |
| G4 | [Official GIS button codelab: free project/account](https://codelabs.developers.google.com/codelabs/sign-in-with-google-button) | ND in inspected material |
| G5 | [Manage App Audience: identity-only exception](https://support.google.com/cloud/answer/15549945) | ND |
| G6 | [Brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification), [OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies) | Brand page updated 2026-10-30; policy last modified 2026-08-05 |


## Q4. Where claims live

An **attestation** is a signed statement with a defined structure. It proves who made the statement; it does not establish that the statement is true. A **schema** defines its fields. **Gas** is the transaction execution fee. **State** is data validators currently retain; **history** is past transactions and receipts, which ordinary nodes may prune. An **indexer** turns chain data into searchable records. These distinctions determine what “permanent” actually promises.

### Storage options and cost

**Read in docs**, except explicitly labelled measurements/calculations. Prices below use native tokens and do not reuse stale dollar exchange rates. A **KiB** is 1,024 bytes; actual serialized storage includes keys and metadata.

| Option | Retention and accountability | Cost per claim and payer | Trade-off |
|---|---|---|---|
| **FastData KV**, FastNEAR's indexed key/value convention | Data is in transaction/receipt history, not contract state. Key ownership is the receipt predecessor; the receiving account is the namespace. Latest values can overwrite; history must be retained separately. | **Tested — prior pass, 5 Nov:** a 417-byte self-directed claim burned about 0.000120 NEAR; 100 claims in one call burned 0.000329 NEAR total. Claimer's transaction pays. No storage stake. | Very cheap; accepts writes whose calls fail. No documented perpetual archive commitment. Query results are not themselves cryptographic proofs. [FastData design](https://hackmd.io/@fastnear/__fastdata), [KV docs](https://docs.fastnear.com/fastdata/kv). |
| **Dedicated NEAR contract, full compact claim in state** | Contract can enforce unique IDs and append-only bodies; challenges and retractions are separate records. Durability depends on chain operation and the absence of destructive account/contract powers. | Storage rate is 10^-5 NEAR per additional byte. **Inferred:** 1 KiB locks 0.01024 NEAR; 4 KiB locks 0.04096 NEAR, plus keys, indexes and gas. Charge each caller the actual added bytes. | More retained state and enforceable rules; new code must be reviewed. Storage is locked capital, not a recurring rent quote. [NEAR storage](https://docs.near.org/protocol/storage/storage-staking). |
| **NEAR contract with only a hash, or events only** | A hash proves integrity of supplied bytes. Events live in history. Neither guarantees access to the claim body. | **Inferred:** 32 raw hash bytes alone lock 0.00032 NEAR, before keys/metadata; logs cost gas. Caller pays. | Useful anchoring, but requires another durable body store. Not a substitute for full retention. Private-link hashes remain forbidden. |
| **EAS — Ethereum Attestation Service**, on Ethereum or an Ethereum-compatible network such as Base | Schema registry, stored attestations, links to earlier attestations, expiration and revocation. Revocation changes status, not original content. Read the contract directly instead of trusting its explorer. | Variable gas; caller pays, or a separately authorized delegate can pay. **Tested — prior pass, 5 Nov:** one Base attestation cost 0.00000363 ETH at 604,053 gas; a sample, not a tariff. Ethereum mainnet and other payloads differ. | Established reusable format; extra network/wallet UX for NEAR contributors. Resolver contracts can impose extra fees or restrictions. [EAS implementation](https://github.com/ethereum-attestation-service/eas-contracts/blob/master/contracts/EAS.sol), [revocation](https://docs.attest.org/docs/core--concepts/revocation). |
| **Off-chain EAS** | Signed structured message can be checked by anyone who has its bytes. Separate on-chain timestamp/revocation options. | Signature has no chain fee; storage/hosting costs remain; timestamps/revocations require gas. | Useful portability; no automatic availability, independent signing time or permanence. [EAS SDK](https://docs.attest.org/docs/developer-tools/eas-sdk), [off-chain storage](https://docs.attest.org/docs/tutorials/storing-offchain-data). |
| **Sign Protocol** | Schemas and attestations; full on-chain, Arweave, or hybrid records. Arweave is a separate storage network; IPFS is content-addressed distribution that still needs someone retaining files. Revocation replaces validity, not history. | Full on-chain: chain gas plus any schema-hook fee. Arweave: storage paid through Sign Developer Platform. Hybrid: upload/storage plus transaction. No universal per-claim quote found. | Broad formats and queries, but another service and upgrade-governance dependency; no native NEAR deployment verified. [Concepts](https://docs.sign.global/developers/concepts/), [storage](https://docs.sign.global/developers/concepts/data-storage/), [networks](https://docs.sign.global/developers/networks/). |
| **NEAR NEP-393 soulbound tokens** | Non-freely-transferable credentials issued to accounts, with registry, issuer and revocation/recovery rules. Final standard, created 12 Sep 2022. | Issuance gas and contract storage, with payer determined by implementation. No generic per-claim fee. | A credential mechanism, not an open third-party claim ledger or truth court. Does not prove one human per account on its own. [NEP-393](https://github.com/near/NEPs/blob/master/neps/nep-0393.md). |

**Read in docs.** Sign's current network table lists maintained EVM deployments at version 1.1.4 with an owner and proxy contracts (addresses whose executing implementation can be changed); several older deployments are explicitly legacy. Its broader storage docs discuss other chains. Do not assume every advertised ecosystem has the same maintained deployment or verification path. Neither the reviewed EAS nor Sign material establishes a native NEAR equivalent. This is a bounded finding, not proof that no community project exists.

**Tested — prior pass.** `research/near-tooling/near-data.md` reports that 56 testnet rows could be reconstructed from 31 transactions with no value mismatch. Transaction discovery still used FastNEAR; decoding used another RPC. Mainnet NearBlocks receipts supplied an independent sample, not a full rebuild. Normal-node history measured roughly 21–35 hours across providers. These are dated measurements, not retention contracts. `near-map-pay.md` also records pagination omissions in some prefix/history queries. No repeat writes were needed for this pass.

### What independent verification needs

**Inferred design**, using the protocols above:

1. Define one versioned claim envelope: network-qualified subject, author/public identity, claim kind, exact proposition, evidence references, observed-at block where relevant, declared issue time, schema version, and links to challenged/retracted/superseded claim IDs. Use the target's three kinds: **observed**, **declared**, **inferred**. An outside article is evidence; it is not automatically a new approved claim kind.
2. Specify canonical bytes: one deterministic serialization, exact text encoding, integer amounts as strings, no ambiguous floating-point values. Hash those bytes, not whatever JSON (structured text data) a user interface or indexer happens to return. FastData's normalization means its indexed JSON is not necessarily the originally signed representation.
3. Keep separate proofs for **message authorship**, **authority to act for a public identity**, and **inclusion on chain**. A sign-in signature cannot be reused as authorization to publish. When the public identity differs from the transaction's sender, publish an explicit public authorization proof or reject the mismatch. Never use a private linking proof for this purpose.
4. A reader fetches the transaction/receipt or contract state from their chosen node, verifies the exact payload and account attribution, and checks the network, block, receipt and action index. A block timestamp establishes inclusion time, not when the author first formed the belief; a message's claimed date alone proves neither.
5. For a direct NEAR call, a contract should attribute to the authorized caller, not blindly to `signer_account_id`: intermediary contracts and relayed calls can separate signer, predecessor and intended author. Make the accepted calling path explicit. For FastData, trace the predecessor and receipts even when execution failed. A valid failed FastData write must not be confused with a failed application contract write.
6. Verify every challenge and retraction separately. Only the author or an explicitly authorized successor retracts that author's claim. Other people may dispute it. Preserve old versions and display correction status without silently overwriting the original.
7. Distribute an export with schema, canonicalization rule, payload, proofs and chain coordinates. Another implementation should be able to render it without a Petals login, API or database. A third-party RPC still introduces that provider's trust; a self-run validating node or verified light-client proof reduces it. Comparing two RPCs is corroboration, not a consensus proof.

**Inferred limitations.** A history export proves the included records, not that nobody omitted a challenge. A durable contract should expose a sequence/count and paged enumeration so readers can check completeness. FastData readers need a replayable scan and independently retained history. A hash-only checkpoint proves a set only to someone who already has the set; it cannot retrieve missing evidence.

**Read in docs / Inferred boundary.** NEAR's [light-client proof method](https://docs.near.org/api-reference/post-light_client_proof), read 8 Nov, returns execution-outcome and block proofs. It is not a turnkey proof of every indexed JSON field. A portable verifier still needs a trusted/verified chain head, raw signed transaction bytes and the appropriate receipt/call linkage. The previous pass fetched a proof; it did not demonstrate this complete offline verifier.

### Recommended split

**Inferred.** For the approved target's stronger permanence language, lean toward compact, eligible public claims and their correction history in an append-only NEAR contract, with caller-funded storage; large public evidence in independently retained, hash-checked files. Keep private links/workspaces in the private database. No evidence hash derived from a private link goes on chain.

A foreign-chain sign-in does not itself give the person a funded NEAR transaction sender. The lean first publishing path requires that person's own linked, explicitly public NEAR wallet. Supporting an EVM-only or Bitcoin-only publisher needs a separate user-funded submission mechanism and proof mapping; Petals cannot quietly become the relayer or pay gas. A social sign-in token is not a durable claim-signing key either. These are publishing limits, distinct from which links the profile can verify.

A dual-write design also needs to handle partial completion: a successful contract write and a failed FastData mirror are one published claim with a missing index entry, not two different claims or a reason to change its ID.

The contract must have no overwrite/delete operation for accepted public claim bodies and no hidden administrative path that bypasses that rule. **Read in docs:** account full-access keys can replace code or delete the account ([access-key permissions](https://docs.near.org/protocol/accounts-contracts/access-keys), read 8 Nov). **Inferred:** a promise of immutability is false while such powers remain unqualified. Audit/review the exact compiled version, initialization and access keys. Removing upgrade powers also removes a repair mechanism, so this is a trade-off to decide before deployment. A permanent entry cannot also offer refundable storage on deletion.

FastData remains a reasonable **prototype with disclosed retention limits**, and an optional public discovery feed. It must use a fresh claim-ID key for every statement; readers still validate immutable identity/content rules because the KV service itself permits overwrites. Keep replicated exports and raw receipt evidence. Running two copies at one provider does not create independent retention. No amount of cheap writing alone proves “forever.”

This is a change of lean from the older “no contract” research, justified by the 8 November target. It is not authorization to deploy. A prototype may demonstrate attribution and challenges while explicitly leaving the permanence acceptance criterion open.

## Q5. Discouraging lies and defamation

**Inferred.** Identity makes a record attributable, not honest. A **Sybil attack** is one actor creating many identities to appear independent. Linking several wallets does not prevent it, and a verified social account may be bought, shared or compromised. Payment is neither truth nor standing under TGT-023.

| Mechanism | How it works | What it costs or can fail at | Petals lean |
|---|---|---|---|
| Identity plus visible record | **Inferred:** retain signed claims, replies, evidence and corrections under a persistent public author. | Low new infrastructure; throwaway identities and coordinated fake challenges remain possible. | Foundation, with no claim that it solves personhood. |
| Evidence rules and right of reply | **Inferred:** precise predicates, dated evidence, reproducible methods; subjects can answer claims about their own accounts. | Requires a clear policy and readable disagreements. A citation or model output can still be wrong. | Use immediately in the design. |
| Stake and slashing | **Inferred:** author posts a bond; a defined losing outcome forfeits some or all. “Slashing” means that enforced loss. | Needs custody/escrow contracts, a referee, appeals and an objective loss rule. Wealthy liars may outspend critics; poor subjects may be unable to challenge. | Defer financial penalties. Never slash because a claim merely received challenges. |
| Challenge game | **Inferred:** two parties narrow a disagreement until a machine-checkable proposition or referee can decide it. | Good for a deterministic computation over a fixed chain snapshot; weak for “these people secretly coordinate.” Ambiguous inputs become the dispute. | Consider later for narrow observed facts, not motives or identity attribution. |
| Curated registry | **Read in docs:** deposits support proposed list entries; challengers risk deposits; disputes go to a court. Kleros now directs new lists to **Light Curate**; Classic Curate is being deprecated, while Light and Stake Curate remain supported. | Rules must define membership. An unchallenged entry may reflect lack of monitoring, not truth. | Useful later for bounded lists such as “contract implements interface X,” not the whole relationship graph. [Kleros Curate](https://docs.kleros.io/products/curate), undated, read 8 Nov. |
| Kleros juries | **Read in docs:** token stake affects juror selection; evidence, votes, fees and appeals lead to a contract ruling. Current docs distinguish V1 and V2; Curate variants use V1. | Arbitration and appeal fees, evidence hosting and EVM integration; a ruling follows the chosen question and policy, not universal truth. **Inferred:** juror incentives can encourage coordination around an expected verdict. | Do not add a cross-chain court for the first slice. Later assess one defined dispute class and exact court configuration. [Court process](https://docs.kleros.io/court/how-it-works), undated, read 8 Nov. |
| UMA optimistic oracle | **Read in docs:** assert a statement with a bond; accept if no timely dispute; otherwise escalate to UMA's token-voter Data Verification Mechanism. | Requires an attentive challenger, unambiguous resolution rules, bonds and gas. V3 minimum bond depends on currency final fee and burn percentage; read `getMinimumBond`, do not hard-code a dollar figure. | Candidate for objective dated facts only, not “is this person a liar?” [UMA overview](https://docs.uma.xyz/protocol-overview/how-does-umas-oracle-work), [V3 source](https://github.com/UMAprotocol/protocol/blob/master/packages/core/contracts/optimistic-oracle-v3/implementation/OptimisticOracleV3.sol), read 8 Nov. |

### A small-team challenge procedure

Everything in this subsection is **Inferred** and proposed for Elco's review.

- A challenge is a signed claim identifying the disputed proposition, reason and counter-evidence. It is shown next to the original. Multiple similar challenges are grouped for reading, not counted as independent votes.
- The author can answer, narrow, supersede or retract. Retraction remains attributable and visible; a voluntary correction should not be treated automatically as fraud.
- For an observed fact, anyone can rerun the declared rule against the named chain/block and publish the result. “Reproduced by X using method Y” is more accurate than a universal “verified” badge.
- For interpretation or common-control inference, disagreement remains unresolved unless the parties accept a named review process. No response is not admission. Passing a deadline does not prove truth.
- A future review result is another signed statement identifying the reviewer, rule version, evidence and appeal outcome. Readers can select a review policy. The default view must disclose whose judgments it follows.
- Start standing as a factual ledger: claims issued, claims with challenges, answered, retracted, and outcomes under named review rules. Count unique claim episodes, not raw events. Self-created claims and challenges get no extra standing, and popularity, deposits, social followers or payment don't purchase credibility. A numerical score can wait for enough real adjudicated outcomes and an explicit anti-gaming rule.
- Keep an off-chain route for unlawful-content notices and correction requests. People must not have to buy a wallet or publish their identity to complain. A chain record's continued existence does not oblige Petals to keep redistributing harmful content through its interface.

The testable slice is a public claim, a different account's challenge, the subject's reply, and the author's signed retraction. Show the history and the changed default presentation. That demonstrates accountable disagreement without pretending to have solved truth arbitration.

### Natural persons and the legal angle

**Read in docs; legal issue-spotting, not a legal opinion about Petals.** A natural person is a human individual, as distinct from a company or contract. EU/Portuguese law is relevant to review given the project's Lisbon context; the applicable laws also depend on operations and affected people.

- The **General Data Protection Regulation (GDPR)** applies to identifiable people, including indirectly identifiable or pseudonymous data. It requires a lawful basis, minimization, accuracy and retention limits; Articles 13/14 concern notice, 16/17 correction/erasure, 21 objection, 25 design safeguards and 35 high-risk assessment. Public availability does not alone supply a lawful basis. Article 9 covers sensitive categories; Article 10 has separate rules for criminal-offence data. Expression exceptions require a specific assessment. [GDPR, 27 April 2016](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng), read 8 Nov.
- The **European Data Protection Board (EDPB)** final blockchain guidance is **version 2.0, 7 July 2026**, not just the 2025 consultation draft. Paragraphs 52–55 discuss hashes, commitments and exceptional justified public processing; 102–106 address erasure and correction. Paragraph 104 recommends keeping personal data off chain even when encrypted or hashed. This is guidance, not a blanket statutory ban on every blockchain. A **data protection impact assessment (DPIA)** evaluates necessity and risks; where required, it must precede processing. [Final guidance](https://www.edpb.europa.eu/system/files/2026-07/edpb_guidelines_202502_blockchain_v2_en.pdf), read 8 Nov.
- Portugal's Penal Code Article 180 addresses damaging factual imputations or judgments communicated to third parties, including suspicions and repetition. Its defence conditions include legitimate interests plus truth or a serious good-faith basis; private/family life and failures of required inquiry complicate that defence. Article 183 addresses publicity and knowing falsity. **Inferred:** adding “AI inferred” does not make an accusation safe. [Official consolidated chapter](https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/1995-34437675-49698975), consolidation displayed 19 August 2026; read 8 Nov.
- Portugal's Law 58/2019 Article 24 protects expression/information while retaining dignity and personality-rights limits. It is not an automatic exemption for a power map. [Official law, 8 August 2019](https://diariodarepublica.pt/dr/detalhe/lei/58-2019-123815982), read 8 Nov.
- The **Digital Services Act (DSA)** has hosting notice-and-action provisions in Article 16 and conditional hosting liability rules in Article 6. Applicability and exemptions need review; small size does not justify assuming every obligation disappears. [DSA, 19 October 2022](https://eur-lex.europa.eu/eli/reg/2022/2065/oj/eng), read 8 Nov.
- The Court of Justice's **22 November 2022** beneficial-ownership judgment invalidated unrestricted public access under the provision before it. It is not a ruling on Petals, but cautions against assuming public-interest ownership data warrants unlimited public exposure. [Court summary, joined cases C-37/20 and C-601/20](https://curia.europa.eu/site/upload/docs/application/pdf/2022-11/cp220188en.pdf), read 8 Nov.

**Inferred recommendation.** Start with narrowly described contract/account actions and consensual self-declarations, and keep third-party natural-person identification and allegations out of immutable claim payloads pending a defined publication policy and qualified legal review. Account-only language is risk reduction, not immunity: named wallets and identifiable clusters can still identify people. Testnet is public too. Self-disclosure does not consent to every future inference about that person.

Do not offer a guaranteed erasure promise for on-chain material. Keep sensitive evidence and correction handling off chain; consider whether even a pointer or hash identifies the person. No raw private names, identity links, access tokens, addresses or allegations should be smuggled into evidence URLs, notes or metadata. A stronger legal/policy restriction than the target must remain visibly proposed until Elco decides.

## Q6. Public and private profiles

All proposed boundaries below are **Inferred**, implementing TGT-004 without inventing privacy guarantees.

| Data | Default | Publication and verification rule |
|---|---|---|
| Internal account ID and full set of login links | Private | Stable internal ID need not be the public author ID. Do not expose linked-wallet counts, hidden provider names or cross-account lookup responses. |
| Additional wallet/social proof | Private | Store method, provider/network, stable subject, verified-at time, proof version and state. Recheck where necessary. A private proof must not leak via logs, backups, analytics or public exports. |
| Chosen public profile and public links | Explicit opt-in per field/link | Show “control proven by method X on date Y”; distinguish it from a self-entered display name. Publishing a link needs its own consent and public proof design. |
| Public claim author and publishing wallet | Public before signing | Preview exact fields and chain exposure. A pseudonym with a verifiable publishing credential can be accountable without revealing the civil name or private login wallets. |
| Conversations, unpublished maps, notes and follows | Private | Owner authorization on every server read/write, recoverable backups, controlled retention. “Private from other visitors” is not “unreadable by the operator.” |
| Provider tokens, nonce/session material, AI keys | Secret / minimal retention | Drop social access tokens after proof if no continuing access is needed. Never place them in claims or identity exports. AI spending keys stay on the person's side under the target. |
| A third party's identity or sensitive allegation | Separate publication assessment | The contributor cannot consent on the subject's behalf. Do not infer that connecting one wallet authorizes public exposure of all that person's wallets. |

**Inferred.** Ordinary selective visibility is a private database plus authorization rules: the server can still see the links. Encryption at rest protects stolen storage but not an authorized running server. **End-to-end encryption** means only the person's devices hold decryption keys; it brings recovery, multi-device key distribution and server-search limits. It does not by itself conceal which login wallets reach the same account. If Story 3's “never shown to anyone else” is meant to include the operator, that requires a materially stronger design than a public/private flag.

**Read in docs.** A **verifiable credential** is an issuer-signed set of claims that a holder can present to a verifier. W3C VC 2.0 (15 May 2025) supports privacy-oriented presentations but is not itself a privacy implementation or truth guarantee. **Selective disclosure** reveals selected attributes while retaining proof of origin; it differs from merely hiding a column in the UI. [VC 2.0](https://www.w3.org/TR/vc-data-model-2.0/), read 8 Nov.

**Read in docs.** **SD-JWT**, Selective Disclosure for JSON Web Tokens (signed structured data packages), is RFC 9901 (November 2025): signed data plus salted hashes and separately disclosed fields. It can support off-chain selective presentations. It does not make arbitrary existing Google/GitHub tokens selectively disclosable, and ordinary presentations can remain correlatable. [RFC 9901](https://www.rfc-editor.org/rfc/rfc9901.html), read 8 Nov.

**Inferred lean.** Do not introduce zero-knowledge proofs—proofs that establish a property without revealing underlying data—just to implement profile visibility. Keep proofs private by default; publish independently signed, minimal link statements only when wanted. Never anchor a whole profile root, private-link hash or membership commitment merely to claim “selective disclosure”: the target forbids putting private links on chain even hashed. If later an external issuer can attest “verified contributor” without exposing wallets, evaluate its trust and correlation model separately.

Changing a field back to private can stop future distribution by Petals; it cannot undo copies already downloaded or chain publication. Unlinking a login credential revokes future access but must not silently reassign old public claims or erase authorship. Account recovery/merging needs explicit rules to avoid transferring an old person's public reputation to a new controller.

## Q8. Payments, lightly

**Read in docs.** NEAR Intents lets a person express a desired asset outcome while competing solvers execute the exchange. The 1Click interface packages this as a quote, deposit route and status. Supported routes/tokens must be discovered at use time; “any chain” is shorthand, not universal coverage. The [FAQ](https://docs.near-intents.org/resources/faqs), read 8 Nov, still says there is no testnet deployment.

**Tested — prior pass.** `near-pay.md` tested browser cross-origin access and dry quotes for EVM, Solana and Bitcoin routes; it did not make a real payment. A person can send from their own wallet to the quoted deposit address, with the destination set to the intended recipient and refunds to the payer. Petals need not hold the funds, but settlement/bridge infrastructure still introduces counterparty and availability assumptions. A payment address must not silently become a verified account link.

**Read in docs, updated 8 Nov.** The current [fee page](https://docs.near-intents.org/resources/fees) states protocol fee 0.0001%; for non-ANY_INPUT quotes, an additional 0.25% without an API key; authenticated base fees normally 0.20%, or 0.01% on stablecoin/same-asset routes. It now describes configurable revenue sharing, floors and quote-improvement fees. Older dry observations did not always show the documented surcharge. **Inferred:** display the actual total quote, network/refund fees, deadline, destination and echoed app fees; do not promise a fixed “Petals cut” from the older notes. No fresh quotes or payments were made here.

**Read in docs.** NEAR AI Cloud's [quickstart](https://docs.near.ai/cloud/quickstart), read 8 Nov, tells the person to create an account, buy credits in its console and generate their own API key; the inference endpoint is OpenAI-compatible at `https://cloud-api.near.ai/v1`. No reviewed public material establishes a general 1Click payment directly into another person's Cloud-credit balance.

**Tested — prior pass / Read in prior code.** `near-ai.md` found browser access technically possible, lifetime rather than periodic per-key spending caps, and potential cap overshoot from concurrent/in-flight calls. Its staking-for-inference investigation found live conversion uncertainty and administrative keys. Those are dated observations, not a fresh purchase test or a risk-free funding recommendation.

**Inferred lean.** Link to the person's own Cloud console for funding/key creation; let their own agent use the key directly. A browser client is an option if the key never reaches Petals' server and the person understands the session/exposure model. A restored conversation is not a still-running agent when the browser is closed. Defer embedded Cloud account provisioning, staking and payment mediation. Define payment purpose, payer, beneficiary, refund handling and fee policy in Q8's later spec before choosing a payment path.

## What remains untested

This pass is desk research. Before implementation is claimed complete, exercise real supported wallets on the intended network; malicious/replayed login and link requests; rotated/revoked keys and contract wallets; social callback substitution and unlinking; private-data exclusion from all public surfaces; and export verification from a different implementation. For the chosen storage path, test full history recovery, omitted/reordered challenges, wrong-author retractions, exact caller costs and loss of the preferred indexer. Test results must identify network, library version and proof type. None of those are implied by reading a standard.

The companion [NEAR framework survey](near-frameworks.md) covers social/messaging infrastructure and reusable contracts.
