# Contract: HTTP API and MCP

**Version**: api/v1 | **Owners**: W4 (tool routes, MCP), W5 (agent routes) | **Consumers**: web (W6), skill, CLI and IronClaw package (W7), any agent, judges

One Hono app, `petalApp(cfg)` from `@petal/agent`, made of two parts:

- **Tool routes**: `httpApp(ctx)` from `@petal/tools`. Every tool in [tools.md](./tools.md) has one route; bodies and responses are the tool's input and output. Also `/api/v1/health` and `/mcp`.
- **Agent routes**: `agentRoutes(...)` from `@petal/agent`: chat, runs and attestation reports. They live with the agent because the agent imports the tools; one-way dependencies, no cycle.

Locally `pnpm api` (or `petal api`) runs `petalApp` under Node on `http://localhost:8787`. On a host it is mounted in the web app at `/api/[[...route]]` with `@hono/vercel`. The HTTP API is the base door; the skill, the CLI, MCP and the IronClaw package sit beside it over the same tools ([packages.md](./packages.md#the-five-doors)).

## Rules

- JSON in and out, UTF-8. `tools_version` in every response.
- No account, key or payment is needed for anything except publishing (FR-030).
- CORS: open, so agents and other sites can call it.
- Rate limits per IP (in memory in Phase A): 60 tool calls per minute; 10 new agent chats per hour, plus 60 follow-ups per hour on an existing run. Over the limit: `429` with `{ error: { code: "rate_limited", retry_after_s } }`.
- Errors: HTTP status from the error code (`bad_input` 400, `unauthorised` 401, `not_found` 404, `cannot_read` 422, `invalid_spec` 422, `rate_limited` 429, `budget_exhausted` 429, `source_failed` 502, `internal` 500), body `{ error: { code, message, hint } }`.
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
| `POST /api/v1/agent/chat` | Petal's agent, SSE (below). With `Accept: application/json` alone: `202 { run_id, status: "running" }` at once, and the run goes on unwatched. Agent route. |
| `GET /api/v1/agent/runs/:id` | a stored run: `{ run_id, status: "running" \| "done" \| "failed" \| "stopped" \| "interrupted", messages, events, flower? }`; with `Accept: text/event-stream`, replays stored events from the cursor (`Last-Event-ID`, or `?from=<seq>`), then streams new ones until the run ends. Agent route. |
| `POST /api/v1/agent/runs/:id/stop` | Stop (below). `{ run_id, status, stopped, already_finished }`. Agent route. |
| `GET /api/v1/attestations/:sha256` | the NEAR AI attestation report Petal stored for a model signature (`report_sha256`), `application/json`, immutable cache headers. Agent route. |
| `GET /api/v1/health` | `{ ok, map: "up"|"down"|"mirror", llm: "up"|"down"|"recorded", version, commit }`; `commit` is what a deploy witnesses, null locally |
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
| `flower` | `{ spec, spec_sha256, render_sha256, view_url, legend, interpretation, validation }` |
| `signature` | `ModelSignature` for the completion that proposed the spec |
| `error` | `{ code, message, hint }`; besides the tool codes, `stopped` (followed by `done`) and `interrupted` (last) |
| `heartbeat` | `{}` every 10 s, so idle connections stay open |
| `done` | `{ turns, model, fallback_used, tokens: { in, out }, cost_usd, signature? }`; `signature` is the completion that wrote the answer, `null` when it got none (T168) |

Limits per chat: 8 tool rounds, 300 s wall time (`PETAL_RUN_MAX_S`), $0.05. A daily cap (`PETAL_LLM_DAILY_USD`, default 3) protects the one server key; past it, including mid-way through a chat, the agent returns `budget_exhausted` and points to the skill (bring your own agent).

Model calls inside a chat are not streamed, so each one can carry a TEE signature (streamed completions get a weaker gateway signature). Progress comes from Petal's own events instead.

Without `NEAR_AI_API_KEY`, the server answers with a recorded transcript (`recordedClient`) and says so in `done.model = "recorded"`. That keeps the judge path working with no credentials (SC-009).

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
