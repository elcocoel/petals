# Contract: HTTP API and MCP

**Version**: api/v1 | **Owners**: W4 (tool routes, MCP), W5 (agent routes) | **Consumers**: web (W6), skill, CLI and IronClaw package (W7), any agent, judges

One Hono app, `petalApp(cfg)` from `@petal/agent`, made of two parts:

- **Tool routes**: `httpApp(ctx)` from `@petal/tools`. Every tool in [tools.md](./tools.md) has one route; bodies and responses are the tool's input and output. Also `/api/v1/health` and `/mcp`.
- **Agent routes**: `agentRoutes(...)` from `@petal/agent`: chat, runs and attestation reports. They live with the agent because the agent imports the tools; one-way dependencies, no cycle.
- **Auth routes**: from `@petal/agent`: sign-in, the session and invites ([below](#sign-in-sessions-and-invites)). Mounted before the tool routes, so their open CORS doesn't answer for them.

Locally `pnpm api` (or `petal api`) runs `petalApp` under Node on `http://localhost:8787`. On a host it is mounted in the web app at `/api/[[...route]]` with `@hono/vercel`. The HTTP API is the base door; the skill, the CLI, MCP and the IronClaw package sit beside it over the same tools ([packages.md](./packages.md#the-five-doors)).

## Rules

- JSON in and out, UTF-8. `tools_version` in every response.
- No account, key or payment is needed for anything except publishing and Petal's own agent (FR-030, SYS-051).
- CORS: open on the tool and agent routes, so agents and other sites can call them, with no `Access-Control-Allow-Credentials`, so a browser never sends a session across origins. The auth routes, `/api/v1/me` and `/api/v1/explorations` send no CORS headers.
- Rate limits per address (in memory in Phase A): 60 tool calls per minute; 10 new agent chats per hour, plus 60 follow-ups per hour on an existing run. Over the limit: `429` with `{ error: { code: "rate_limited", retry_after_s } }`. An address is `cf-connecting-ip`, else the socket on a local deployment, and on a public one everyone without it shares a limit. `x-forwarded-for` and `x-real-ip` never count. An IPv6 address counts as its /64.
- A body is at most 256 KiB, and a chat 512 KiB: `400 bad_input`. `/mcp` takes one call per POST, so a batch is `400 bad_input`.
- Global limits (T300, `.env.example`). Daily caps answer `429 rate_limited` with `retry_after_s` until midnight UTC. A fresh read past its turn, two at a time, answers the same with a short `retry_after_s`, and one that takes too long answers `502 source_failed`. Past the data budget, a write a stranger can cause answers `429 budget_exhausted`.
- Errors: HTTP status from the error code (`bad_input` 400, `unauthorised` 401, `invite_required` 403, `not_found` 404, `cannot_read` 422, `invalid_spec` 422, `rate_limited` 429, `budget_exhausted` 429, `source_failed` 502, `internal` 500), body `{ error: { code, message, hint } }`.
- Long tools (`get_snapshot` on a live pull) accept `Accept: text/event-stream` and then stream `progress` events before the final `result` event.

## Routes

| Method and path | Tool |
|---|---|
| `GET /api/v1/find?query=&chain=&limit=` | `find_target` |
| `GET /api/v1/networks?query=` | `list_networks` |
| `GET /api/v1/networks/:id` | `get_network` (params as query) |
| `POST /api/v1/snapshots` | `get_snapshot` |
| `GET /api/v1/snapshots/:sha256` | snapshot body, `application/json`, gzip; immutable cache headers |
| `GET /api/v1/snapshots/:sha256/describe?top=` | `describe_snapshot` |
| `POST /api/v1/figures` | `compute_figures` |
| `POST /api/v1/specs/propose` | `propose_spec` |
| `POST /api/v1/specs/validate` | `validate_spec` |
| `POST /api/v1/render` | `render_flower` (`?format=svg` returns `image/svg+xml`) |
| `GET /api/v1/flowers?network=&maker=&limit=` | `list_flowers` |
| `GET /api/v1/flowers/:id` | `get_flower` |
| `GET /api/v1/flowers/:id/svg` | the published flower's SVG |
| `POST /api/v1/publish/prepare` | `prepare_publish` |
| `POST /api/v1/publish` | `publish_flower` |
| `POST /api/v1/quote` | `quote_payment` (dry, FR-031) |
| `POST /api/v1/figures/compare` | `compare_figures` (Phase B) |
| `POST /api/v1/corrections/prepare` | `prepare_correction` (Phase B) |
| `POST /api/v1/corrections` | `submit_correction` (Phase B) |
| `GET /api/v1/relations/account-groups?account=&limit=` | `account_groups` |
| `GET /api/v1/relations/shared?group_a=&group_b=&limit=` | `shared_accounts` |
| `GET /api/v1/relations/related?group=&by=&limit=` | `related_groups` |
| `GET /api/v1/relations/overview?min_shared=&kind=&limit=` | `relations_overview` |
| `GET /api/v1/relations/path?account_a=&account_b=&max_depth=&budget=&include_inferred=` | `power_path` |
| `GET /api/v1/explorations?limit=` | `list_explorations` ([below](#explorations-and-links)) |
| `POST /api/v1/explorations` | `start_exploration` |
| `GET /api/v1/explorations/:ref` | `get_exploration`; `:ref` is an id or a link's token |
| `POST /api/v1/explorations/:ref/steps` | `save_step`, body without `exploration` |
| `POST /api/v1/explorations/:ref/notes` | `add_note`, body without `exploration` |
| `POST /api/v1/explorations/:ref/claim` | a session takes an unowned exploration with its continue link: `{ exploration, claimed }` |
| `GET /api/v1/explorations/:id/links` | owner only: `{ links: [{ id, scope, created_at, revoked_at }] }`, with no tokens |
| `POST /api/v1/explorations/:id/links` | owner only, body `{ scope: "read" \| "continue" }`: `{ id, scope, url, created_at }`, its token shown this once |
| `POST /api/v1/explorations/:id/links/:link/revoke` | owner only: `{ id, revoked_at }` |
| `GET /d/:hash` | a short draft link: `302` to `/draft?spec=`, relative, with the spec hashed again on read. `404` for an unknown hash |
| `GET /s/:token` | a link's resume packet as markdown, `text/plain`, `no-store`, for an agent that can only fetch a URL. `404`, plain text, for anything else |
| `POST /api/v1/agent/chat` | Petal's agent, SSE (below). With `Accept: application/json` alone: `202 { run_id, status: "running" }` at once, and the run goes on unwatched. Agent route. Refused without a sponsored invite when gated. |
| `GET /api/v1/agent/runs/:id` | a stored run: `{ run_id, status: "running" \| "done" \| "failed" \| "stopped" \| "interrupted", messages, events, flower?, exploration? }`; with `Accept: text/event-stream`, replays stored events from the cursor (`Last-Event-ID`, or `?from=<seq>`), then streams new ones until the run ends. Agent route. |
| `POST /api/v1/agent/runs/:id/stop` | Stop (below). `{ run_id, status, stopped, already_finished }`. Agent route. |
| `GET /api/v1/attestations/:sha256` | the NEAR AI attestation report Petal stored for a model signature (`report_sha256`), `application/json`, immutable cache headers. Agent route. |
| `GET /api/v1/health` | `{ ok, map: "up"|"down"|"mirror", llm: "up"|"down"|"recorded", agent_access: "gated"|"open", version, commit }`; `commit` is what a deploy witnesses, null locally |
| `POST /api/v1/auth/challenge` | `{ nonce, message, recipient, expires_at }` ([below](#sign-in-sessions-and-invites)) |
| `POST /api/v1/auth/verify` | body `{ network, proof }`: `{ person_id, network, wallets, claimed_runs, claimed_explorations }`, and sets the session |
| `POST /api/v1/auth/logout` | `{ ok: true }`, and clears the session |
| `POST /api/v1/auth/invite` | body `{ token }`: `{ invite }`, and holds it in this session |
| `GET /api/v1/auth/invite` | `{ invite }` this session holds, or `{ invite: null }` |
| `GET /api/v1/me` | `{ person_id, network, wallets }`, to that person only; `401` to anyone else |
| `ALL /mcp` | MCP Streamable HTTP, stateless |

## Agent chat (SSE)

`POST /api/v1/agent/chat`, body `{ "messages": [{ "role": "user" | "assistant", "content": string }], "draft"?: { "spec"?, "entry"? }, "run_id"?: string }`, response `text/event-stream`. With `run_id`, the chat continues a stored run (its messages and draft are loaded).

**Runs you can leave and come back to.** Every chat is a run, stored by `RunStore` (`.petal/private.db`), and a job in the one server process. The SSE stream only observes it, so a viewer coming or going changes nothing. `GET /api/v1/agent/runs/:id` returns it, finished or not.

**Reconnecting.** Each stored event has a place in the run's log, its `seq`: 0, 1, 2…, across all the chats of the run. An event's SSE `id` is its `seq`. `Last-Event-ID: <n>` starts after `n`; `?from=<n>` starts at `n`; if both are sent the header wins. A heartbeat carries no `id`, and isn't stored. A chat's own stream starts at the chat's first event, so its `id`s carry on from the run's earlier chats. A run's stream ends when the run does; a stream that ends without `done` or an `error` says nothing about how the run ended, so read the run.

**Stop.** `POST /api/v1/agent/runs/:id/stop` aborts the model call and the tool in progress, settles the budget for what was used, and answers once the run has ended. It reports what it witnessed: `{ status: "stopped", stopped: true, already_finished: false }`, or `{ status: <how it ended>, stopped: false, already_finished: true }` for a run that had already finished. If neither can be said (`status: "running"`, no job holds it), both are false. Whoever holds a run's id may stop it, as they may continue it. Budget for an aborted call counts only what it is known to have cost.

**A restart.** No run is resumed: that would spend money with nobody watching. On boot, every run still `running` gets an `error` event with code `interrupted` and that status, no `done` follows it, and every hold on the ledger is released. Holds lost this way aren't counted as spent, because what those calls cost can't be known. A process that only builds the app (a test, a check) leaves alone the runs of a live process that started a chat on the same store. A chat with `run_id` continues a `stopped` or `interrupted` run from its saved thread, which is saved after each model answer and each tool.

| Event | Data |
|---|---|
| `run` | `{ run_id, resume_url }`, always the first event; `resume_url` is `/make?run=<run_id>` |
| `stage` | `{ stage: "recorded" (v1.1, additive: first stage of a recorded run) \| "thinking" \| "reading_map" \| "fetching" \| "counting" \| "proposing" \| "validating" \| "drawing", message }` |
| `progress` | `{ stage, message, done?, total? }` (forwarded from tools) |
| `tool_call` | `{ id, name, args }` |
| `tool_result` | `{ id, name, ok, summary, ms }` (summaries, never raw snapshot bodies) |
| `message` | `{ text }` one complete assistant turn |
| `approval_required` | `{ tool, network, params?, target_key }`, additive (J4): Petal's own agent reached for a new map before the person said yes, and the tool didn't run. At most once per target per chat, stored like the rest, so a surface can show Yes and No. A chip sends "Yes" as an ordinary message: no new field, no new route |
| `flower` | `{ spec, spec_sha256, render_sha256, view_url, legend, interpretation, validation }` |
| `signature` | `ModelSignature` for the completion that proposed the spec |
| `error` | `{ code, message, hint }`; besides the tool codes, `stopped` (followed by `done`) and `interrupted` (last) |
| `heartbeat` | `{}` every 10 s, so idle connections stay open |
| `done` | `{ turns, model, fallback_used, tokens: { in, out }, cost_usd, signature? }`; `signature` is the completion that wrote the answer, `null` when it got none (T168) |

**The yes (J4, SYS-054).** On a real model, a new map waits for the person: a fresh read through `get_snapshot`, and `propose_spec` and `render_flower`. A `get_snapshot` with no yes behind it is answered from the newest snapshot stored for that target, or the one its `at` names, however old, unless it asks for `fresh`. It's marked `stored_only`, reaches no source, and approves nothing. `target_key` is the `network`, plus its params in canonical form when it has any. A call goes ahead if its target, its snapshot, or the spec it varies is already approved in this run, including a flower already drawn and a `draft` the person sent. Otherwise it goes ahead if the latest user message tells the agent to draw something by name, even as a first message, unless the target is a candidate of an `ambiguous: true` `find_target`. Or if that message is a yes, the agent has said something before it, and what it last said leaves one thing to agree to: no either-or in its last question, no numbered list. One yes covers one new target. Otherwise the model's tool result is `{ error: { code: "approval_required", message, hint } }` and this event goes out. The rest of the chat keeps the tools that only read, and loses `propose_spec` and `render_flower` unless something is already approved. Asking again for what was refused isn't run, and a model left with no words gets one call with no tools, so it has to speak. A reply naming a candidate by ordinal, chain or address counts for that candidate when the last `find_target` said `ambiguous: true`. What's approved is read back from the run's thread and flowers, so it survives `run_id` and a restart, with no new column. A recorded run isn't held. This is consent, not security: a client can write its own history, and the invite budget is the boundary. `approval_required` has no HTTP status, because it never leaves the loop: the tool routes and MCP are not held (SYS-030).

Limits per chat: 8 tool rounds, 300 s wall time (`PETAL_RUN_MAX_S`), $0.05. A daily cap (`PETAL_LLM_DAILY_USD`, default 3) protects the one server key; past it, including mid-way through a chat, the agent returns `budget_exhausted` and points to the skill (bring your own agent).

Model calls inside a chat are not streamed, so each one can carry a TEE signature (streamed completions get a weaker gateway signature). Progress comes from Petal's own events instead.

Without `NEAR_AI_API_KEY`, the server answers with a recorded transcript (`recordedClient`) and says so in `done.model = "recorded"`. That keeps the judge path working with no credentials (SC-009).

## Sign-in, sessions and invites

The server reads three settings. `PETAL_API` is the site's public address: the recipient, the allowed Origin and the cookie's name all come from it, never from a request. `PETAL_AGENT_ACCESS` is `gated`, the default and what anything unrecognised means, or `open`. `PETAL_WALLET_KEY` seals wallet addresses, and is 32 bytes as hex or base64. A server that is gated and has a model key refuses to start without it. Elsewhere (`open`, `NODE_ENV` development or test, no model key) a throwaway key is made at the first sign-in, with one warning line, and wallets sealed under it can't be read after a restart.

**A person** is a private id, `prs_<hex>`, with wallets attached. A wallet is a binding, `near:<network>:<account>`: testnet and mainnet are different wallets, so different people, even for the same implicit account. Addresses are stored sealed, with a keyed hash as the unique index.

**Sign-in, NEP-413 only.**

1. `POST /api/v1/auth/challenge`, no body: `{ nonce, message, recipient, expires_at }`. `recipient` is the site's hostname; `message` is a plain sentence naming it; `nonce` is 32 bytes as base64, valid 5 minutes, single use. These go to the wallet as they are.
2. `POST /api/v1/auth/verify`, body `{ "network": "testnet" | "mainnet", "proof": Nep413Proof }`, where a proof is `{ type: "nep413", account_id, public_key, signature, message, nonce, recipient }`. A signature may be base64, base58, or `ed25519:` and base58. The key must be a full-access key of the account, read with `view_access_key` on that network. An implicit account that doesn't exist yet passes when its id is the hex of the signing key, and only while `view_account` says it doesn't exist.
3. On success, in one step: the person is found or created, the wallet bound, an anonymous session's runs and explorations move to them, and a new session replaces the old one, keeping its invite. `{ person_id, network, wallets: [{ caip10, network, account_id, proved_at }], claimed_runs, claimed_explorations }`. A first sign-in reads the same as a returning one.

Refused with `unauthorised` (401): another message, another recipient, a bad signature, a nonce that's unknown, used or expired, a key that isn't a full-access key of the account. NEAR's RPC not answering is `source_failed` (502), and the same proof can be sent again. A person signing in with another wallet changes person; nothing is merged. Linking a second wallet (SYS-023) isn't built yet.

**A session** is an opaque 256-bit value, of which only the hash is stored, with a subject that is a person id or an anonymous handle (`anon_<hex>`). It lasts 30 days from when it's made. The cookie is HttpOnly, SameSite=Lax, Path=/: `__Host-petal_session` and Secure when `PETAL_API` is `https://`, otherwise plain `petal_session`. A session can read and continue its subject's runs and draw on an invite, and can't approve anything irreversible: publishing still takes a signature.

**Origin.** A POST to an auth route, to `/api/v1/agent/chat` on a real model, or to `.../stop` answers `unauthorised` when its `Origin` isn't the site's. On a local site (no `PETAL_API`, or `localhost`, `127.0.0.1`), a local page matching the `Host` it asked is the site. With no `Origin` and no `Sec-Fetch-Site: cross-site` it isn't a browser, and it passes.

**Run owners (SYS-014).** A chat on a real model creates its run with the session's subject as owner, opening an anonymous session if there is none. Once a run has an owner, only that owner may read, follow, continue or stop it. To anyone else it answers exactly as a run that never existed: `404 { error: { code: "not_found", message: "no run <id>" } }`. The owner never appears in a run. A recorded run opens no session and has no owner; it and any run older than owners stay open to whoever holds the link, and continuing one leaves it unowned. There is no way back to an anonymous session's work once its cookie is lost.

**Who pays (SYS-050 to SYS-052).** With `agent_access: "gated"`, a chat on a real model needs a session holding an active invite. Without one it spends nothing, stores nothing, and answers `403 { error: { code: "invite_required", message, hint } }`, with `hint` pointing to `/connect`. The recorded demo, reading a run, and every tool need no session. `open` is for an operator's own tool: no invite is asked for, and the daily cap still applies.

**Invites.** `scripts/mint-invite.ts <usd> [days]` makes one, for 14 days unless told otherwise, and prints its token once; only a hash of the token is stored. `--revoke <id>` ends it. `POST /api/v1/auth/invite`, body `{ token }`, puts it in this session, opening an anonymous one if needed. Several sessions can redeem one token, and they draw on one budget. `{ invite: { status: "active" | "spent" | "revoked" | "expired", budget_usd, spent_usd, left_usd, expires_at } }`. A token that is unknown, revoked or expired answers `unauthorised`; a spent one `budget_exhausted`.

Each model call of a chat reserves against the invite and the daily cap, then settles both, so the last call can pass the budget by what it costs. When the budget ends, the chat's stream carries `error` with `budget_exhausted` and a plain message, then `done`, and the next chat answers `429` with the same message before any model call. An invite revoked or expired mid-chat stops at the next call the same way, and the next chat answers `403 invite_required`. A restart gives back every hold on an invite.

**402 from NEAR AI.** `budget_exhausted` with a plain message for each kind: `api_key_limit_exceeded` (the key's own lifetime limit), `insufficient_credits`, `no_credits`, `no_limit_configured` (the sponsor account) and any other (unknown). None is retried on another model, and the figures in NEAR AI's message stay out of the event.

## Explorations and links

The tools are in [tools.md](./tools.md#explorations-m-system-t194-additive-still-toolsv1); these routes add a session. They read the cookie, so they send no CORS headers, `Cache-Control: no-store`, and a POST from another site answers `unauthorised`. To anyone without access an exploration answers `404`, one body whatever the reason.

A link is 32 random bytes in base64url, and only its hash is stored. Making, listing and revoking links takes the owner's session, an anonymous one included, and never a link. An exploration moves with its anonymous session at sign-in. A site's run makes one at its first flower, and each new flower is a step, door `site`.

**In the web app:** `apps/web/app/d/[hash]/route.ts` and `apps/web/app/s/[token]/route.ts` are route handlers with no page, which pass to this app as `/mcp`'s does.

## MCP

- **Remote**: `ALL /mcp`, Streamable HTTP, stateless, built with `@modelcontextprotocol/server` v2 (raw JSON Schema through `fromJsonSchema()`).
- **Local**: `petal mcp` over stdio (the CLI in `apps/cli` calls `serveStdio`), for Claude Code and Codex. The one install command: `claude mcp add petal -- pnpm -s --dir <repo> petal mcp`, where `<repo>` is the root of the clone (locally, the `build/` folder).
- Same tool names, input schemas and outputs as [tools.md](./tools.md). Progress goes out as `notifications/progress`.
- IronClaw loads it only through a packaged extension: `skill/ironclaw/` wraps `/mcp` over HTTP and ships the skill. It is a hedge, never on the demo's critical path; the skill and the HTTP API work without it.

## Contract tests (W4 tool routes, W5 agent routes)

- Every tool route returns what its tool returns for the same input (fixture snapshot, fake map).
- SSE: a recorded agent run produces the event order `run → stage → tool_call → tool_result … → flower → signature → done`.
- Runs: after the client disconnects mid-run, `GET /api/v1/agent/runs/:id` later returns the finished run and its flower. A viewer reconnecting by cursor sees every event once. Stop and a restart end a run as `stopped` and `interrupted`, with nothing held on the ledger.
- Attestations: a stored report is served byte for byte, and its SHA-256 matches `report_sha256`.
- MCP: `tools/list` names and schemas equal the registry; one `tools/call` per tool matches the HTTP result.
