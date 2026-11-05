---

name: petal
description: Draw who holds power in a network as a Petal flower, using Petal's tools over its HTTP API (curl) or MCP. Use when someone asks who holds or backs power in a network (NEAR validators, NEAR House of Stake, a DAO, a chain), how concentrated it is (Nakamoto coefficient, top-k share, HHI, Gini), wants that drawn as a flower with every mapping explained and sourced, or wants to publish a flower to Petal's shared map on NEAR.
metadata: { author: "Felipe Duarte (Elco Coel)", version: "0.1.0" }
---

# Petal

Petal draws power in a network as a flower: a polygon with one side per participant, and on each side a straight bar standing out from it. Width, height, colour, outline and segments each carry a declared meaning, so anyone can tell a shared network from a plutocracy at a glance.

You never draw and you never count. Petal's tools read the data, count, build the spec and render it. You choose the mapping the question needs, explain it with sources, and hand back a link. The same spec always draws the same flower.

## Quick Start

Petal's HTTP API runs at `PETAL_API` (default `http://localhost:8787`; in a clone of the Petal repo, `pnpm api` starts it). No account, key or payment is needed.

```bash
API="${PETAL_API:-http://localhost:8787}"
curl -s "$API/api/v1/health"
curl -s "$API/api/v1/networks"
```

If the `petal` MCP server is configured, call the same tools by name instead (in Claude Code they show as `mcp__petal__<tool>`). Names, inputs and outputs are the same over both.

## Flow

```
list_networks → get_snapshot → describe_snapshot + compute_figures
  → propose_spec → validate_spec → render_flower → (asked to publish) prepare_publish → sign_url
```

<!-- The block between the petal:shared markers is the same text as Petal's own agent prompt
     (packages/agent/src/prompt.md). `node skill/build.ts` copies it from there; until then the
     coordinator syncs the wording at merge. Edit the shared text there, not here. -->
<!-- petal:shared:begin -->
## The six steps

1. **Find the network, and check the map.** Call `list_networks` and pick the network the question is about. If Petal can't read it, say so plainly, say what it can read instead (its `cannot_read_hint`), and stop. Then call `list_flowers` for that network. If a flower there already answers the question (same network, same date, the mapping the question needs), offer it with its link, unless the person asks for a fresh analysis.
2. **Get the snapshot.** Call `get_snapshot`. Say whether it was reused (`reused: true`) or freshly read, and give its date (`as_of`) and block.
3. **Count.** Call `describe_snapshot` for the measures, segment options, primitives and sources, and `compute_figures` for the numbers. Quote only numbers these two tools return.
4. **Propose and validate.** Call `propose_spec` with the fewest choices the question needs; the defaults fill the rest. Then call `validate_spec` with the spec exactly as `propose_spec` returned it, and your interpretation. On errors, fix the cause and try again.
5. **Draw.** Call `render_flower` with the validated spec. Hand back its `view_url`, the legend, your interpretation, and what the data can't tell.
6. **Publish, only when asked.** Call `prepare_publish` with the entry, then give the person the `sign_url`. They sign with their own NEAR wallet. Never ask anyone for a key, a seed phrase or a signature, and never sign or call `publish_flower` yourself. A payment quote (`quote_payment`) is dry: no money moves.

## Choosing

- Start from the default convention. Change only what the question needs, and say what you changed.
- Who holds the most, how concentrated: the defaults.
- Who stands behind each validator or pool: `segments: "backers"`, where the network offers it.
- Named or anonymous: `colour: "identity"`.
- Use only the measures, segment options and primitives `describe_snapshot` lists for this snapshot.
- If the question is ambiguous, pick the most likely reading, say which one you picked, and offer the other.

## What Petal can't read or draw

- `describe_snapshot` gives every primitive's status. Use only `available` ones. If the person asks for an unavailable one (texture, extrusion or opacity, for example), say plainly that it is not available yet. Never imitate it with another primitive.
- If the snapshot doesn't hold what the question needs (votes on proposals, who controls an account off-chain), say so, and put it in `unknowns`.

## The interpretation

`validate_spec` checks it against a strict schema. All seven fields are required, and no others are allowed:

- `summary`: a string, two to four plain sentences.
- `power_means`: an array, at least one item, on what power is in this network. Each item is `{ "claim": string, "sources": [source ids], "figures": ["fig:…"] }`; `figures` is optional and takes ids from `compute_figures`.
- `mappings`: an array, one item per primitive the flower uses. Each item is `{ "primitive": "width" | "height" | "colour" | "outline" | "segments" | "order", "why": string, "sources": [source ids] }`.
- `conflicts`: an array of strings, `[]` if none: other kinds of power in this network, and which one this flower draws.
- `unknowns`: an array of strings: what Petal could not determine or did not check. Never empty.
- `inferred`: an array of strings, `[]` if none: statements that are inference, not fact.
- `documents`: `[]` unless you cite a document you read yourself, and then each item is `{ "id": string, "kind": "docs" | "forum" | "constitution" | "chain" | "news" | "other", "url": string, "fetched_at": ISO date-time, "title": optional string }`. The snapshot's sources are not documents: cite them by id in `sources`.

Source ids come from the snapshot's `sources`. Every error `validate_spec` returns names its path and what was expected: fix them all in one go.

## The answer

Short, in this shape:

- **Flower**: the `view_url`.
- **What you'll see**: one or two plain sentences.
- **Mapping**: one line per primitive that matters, with what it means and its source id.
- **Changed from the default**: the choices you changed, or "none".
- **What this can't tell you**: from `unknowns`.

## When a tool fails

A tool error is an answer. It carries `code`, `message` and `hint`; follow the hint. `bad_input` names the allowed values, `cannot_read` names what Petal can read instead, and on `rate_limited` wait `retry_after_s` before trying again.

## Rules

1. Use only what the tools return. Never invent data, numbers, sources or options.
2. Use only the choices the tools offer for this network. If a choice doesn't apply (for example `segments: "backers"` on Bitcoin), leave it out.
3. Every mapping cites a source id the snapshot lists.
4. Addresses are not people. Say so when the flower is about holders.
5. Never call an inferred identity proven. A self-declared name stays self-declared.
6. Keep the answer under 200 words, plus the link.
<!-- petal:shared:end -->

## When no Petal site is running

A `view_url` that starts with `/` (`/draft?spec=…`) is a path on a Petal site, and it opens nothing unless one is running. Unless you know one is, don't hand it back as the link. Hand back a local file instead: its full path goes on the **Flower** line of the answer.

Save the spec exactly as `propose_spec` returned it as `spec.json` in your working folder, then run:

```bash
pnpm -s --dir "<repo>" petal render @spec.json --out flower.svg | grep '"spec_sha256"'
```

`<repo>` is the root of the Petal clone. Relative paths stay in your working folder. `flower.svg` is the drawing. The line it prints must match the `spec_sha256` from `render_flower`. Keep the `grep`, because the full answer is over 100 KB. Run the command as written, on its own: a `>`, a `cd` or a `$?` can make an agent's permission check stop it.

If you can't run a command, or a sandbox blocks this one, call `render_flower` again with `"include_svg": true` and save its `svg` field as `flower.svg`, unchanged. It's about 30 KB, so use the command when you can.

## Calling the tools over HTTP

JSON in and out; send `content-type: application/json`. Every answer carries `tools_version`.

| Tool                         | Route                                                                   |
| ---------------------------- | ----------------------------------------------------------------------- |
| `list_networks`              | `GET /api/v1/networks?query=`                                           |
| `get_network`                | `GET /api/v1/networks/:id` (params as query)                            |
| `get_snapshot`               | `POST /api/v1/snapshots`                                                |
| `describe_snapshot`          | `GET /api/v1/snapshots/:sha256/describe?top=`                           |
| `compute_figures`            | `POST /api/v1/figures`                                                  |
| `propose_spec`               | `POST /api/v1/specs/propose`                                            |
| `validate_spec`              | `POST /api/v1/specs/validate`                                           |
| `render_flower`              | `POST /api/v1/render`                                                   |
| `list_flowers`, `get_flower` | `GET /api/v1/flowers?network=&maker=&limit=`, `GET /api/v1/flowers/:id` |
| `prepare_publish`            | `POST /api/v1/publish/prepare`                                          |
| `quote_payment`              | `POST /api/v1/quote` (dry)                                              |

- Over HTTP, `render_flower` includes the SVG unless you send `"include_svg": false`. Send it: the `view_url` is what the person needs, and the SVG would fill your context.
- Keep large JSON (the spec, your interpretation) in files and send them with `--data-binary @file`.
- Never `GET /api/v1/snapshots/:sha256` (the raw body): `describe_snapshot` and `compute_figures` say what you need.

## Example: who stands behind NEAR's validators?

```bash
API="${PETAL_API:-http://localhost:8787}"; J='content-type: application/json'
curl -s "$API/api/v1/networks?query=near"
curl -s -X POST "$API/api/v1/snapshots" -H "$J" -d '{"network":"near-validators"}'
SHA=...   # "sha256" from the answer above
curl -s "$API/api/v1/snapshots/$SHA/describe?top=10"
curl -s -X POST "$API/api/v1/figures" -H "$J" \
  -d "{\"sha256\":\"$SHA\",\"measure\":\"validator_stake_current_epoch\"}"
curl -s -X POST "$API/api/v1/specs/propose" -H "$J" \
  -d "{\"network\":\"near-validators\",\"sha256\":\"$SHA\",\"choices\":{\"segments\":\"backers\"}}" \
  > proposal.json
# write your interpretation to interpretation.json, then validate and render:
jq --slurpfile i interpretation.json '{spec: .spec, interpretation: $i[0]}' proposal.json \
  | curl -s -X POST "$API/api/v1/specs/validate" -H "$J" --data-binary @-
jq '{spec: .spec, include_svg: false}' proposal.json \
  | curl -s -X POST "$API/api/v1/render" -H "$J" --data-binary @-
```

"Who stands behind" asks for the backers of each pool, so the one choice is `segments: "backers"`; everything else is the default. The measure id comes from `describe_snapshot` (`measures`). No `jq`? Build the JSON with `python3` or by hand.

## propose_spec choices

Use only values `describe_snapshot` lists for this network (`measures`, `segment_options`, `line_options`, `primitives`). Anything else comes back as `bad_input` with the allowed values.

| Choice     | Values                                         | Default (`default/v1`)                                                        |
| ---------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `measure`  | a `measures[].id`                              | the network's first measure                                                   |
| `petals`   | 5 to 300                                       | 60; the rest form one hatched tail petal                                      |
| `width`    | `r1.5`, `r2`, `r3`, `equal`                    | `r2`: share of the measure, the widest side at most 2× the narrowest          |
| `height`   | `sqrt`, `linear`, `log`, `equal`, `m:<metric>` | `sqrt` of the share                                                           |
| `colour`   | `kind`, `identity`, `single`                   | `kind` of account                                                             |
| `outline`  | `identity_status`, `none`                      | `identity_status`: solid when self-declared or verified, dashed when inferred |
| `segments` | `none`, `backers`, `time`, `ops`, `roles`      | `none`, unless the network sets one                                           |
| `lines`    | `none`, or a `line_options` value              | `none`                                                                        |
| `markings` | `none`, `fusion`                               | `none`                                                                        |
| `order`    | `measure_desc`                                 | largest first, clockwise from the top                                         |

## Publishing

`prepare_publish` takes `{ "entry": ... }`: the entry without `id` and without `provenance.maker`, that is `"petal": "flower/v1"`, a `title`, the `spec` and `spec_sha256`, your `interpretation`, `snapshot` (`sha256`, `urls`), `render_sha256`, and `provenance` with `agent: { "kind": "own-agent", "name": "<your agent>" }`, `tools_version` and `created_at`. It answers with a `sign_url`. Give that link to the person: the page shows the draft, they sign the NEP-413 message in their own NEAR wallet, and the flower is written to Petal's shared map on NEAR (testnet during the build).

## Resources

- Install guide: `skill/petal/README.md` in the Petal repo (Claude Code, Codex, IronClaw).
- Tool contract: `specs/001-petal-core/contracts/tools.md`. HTTP and MCP: `specs/001-petal-core/contracts/http-api.md`. Both in the Petal repo.
- From a terminal in a clone: `pnpm petal help` lists the same tools as CLI commands.
