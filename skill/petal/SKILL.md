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
     coordinator syncs the wording at merge. Edit the rules there, not here. -->
<!-- petal:shared:begin -->
## The six steps

1. **Find the network.** `list_networks` (a `query` narrows the list). Pick the network that answers the question. If Petal can't read it, say so plainly, name what it can read instead (`cannot_read_hint`), and say what data it would take.
2. **Get the data.** `get_snapshot` with the `network` (and `params` or `at` when the question needs them). Say whether it was reused (`reused: true`: a stored, final snapshot, nothing fetched) and give its date and block. Never fetch or read the snapshot body.
3. **Read, then count.** `describe_snapshot` gives the measures, the segment and line options, the primitives this build can draw, the top participants and the source ids. `compute_figures` with the measure the flower uses gives the numbers. These two tools are your only source of numbers.
4. **Propose, then validate.** `propose_spec` with the fewest `choices` the question needs; everything else keeps the default convention (`default/v1`). Then `validate_spec` with the spec and your interpretation. On errors, fix what they name and validate again.
5. **Render and answer.** `render_flower` with the spec. Hand back the `view_url`, the legend, your interpretation, and what the data can't tell.
6. **Publish, only when asked.** `prepare_publish` with the entry, then give the person the `sign_url`. They sign in their own wallet. That is the only way to publish.

## The interpretation

`validate_spec` checks it against the spec. Its fields:

- `summary`: two or three plain sentences: what power means here and what the flower shows.
- `power_means`: what counts as power, as claims, each with `sources` and the `figures` ids it rests on.
- `mappings`: one per primitive the spec uses (`width`, `height`, `colour`, `outline`, `segments`, `lines`, `markings`, `order`), each with `why` and `sources`.
- `conflicts`: other kinds of power this flower does not draw.
- `unknowns`: what the data can't tell. Never empty.
- `inferred`: what is inferred rather than proven.
- `documents`: docs or forum pages you cited, or `[]`.

Source ids come from `describe_snapshot` (`sources`); figure ids (`fig:…`) from `compute_figures` (`figure_ids`).

## The answer

Short: under 200 words, plus the link.

- **Flower**: the `view_url`.
- **What you'll see**: one or two sentences, with the key figures.
- **Mapping**: one line per legend item: what it means, and its source ids.
- **Changed from the default**: `changed_from_default` from `propose_spec`, or "none".
- **What this can't tell you**: the `unknowns`, and anything asked for that the data doesn't have.
- **Data**: the snapshot's date and block, and whether it was reused or fetched.

## Rules

1. **The tools count; you interpret.** Every number you give comes from `compute_figures` or `describe_snapshot`. Never compute, estimate or recall a figure. Turn a share into a percentage without rounding it differently: `0.0816` is 8.16%.
2. **Fewest choices.** Prefer the default. Change only what the question needs, and say what you changed. Two agents that make the same choices get the same `spec_sha256`, so never edit a spec by hand.
3. **Cite.** Every mapping and every claim names a source id Petal gave you. Never invent a source, number, option or network.
4. **Addresses are not people.** An account can be a contract, an exchange, a lockup, or a liquid-staking pool holding many people's tokens. Say so when the flower is about holders.
5. **Evidence before inference.** A self-declared name is self-declared, not verified. Never call an inferred identity, or a shared owner, proven.
6. **Declared, never imitated.** When someone asks for a primitive this build marks unavailable (texture, extrusion, opacity, and any other `describe_snapshot` lists as unavailable), say it isn't available yet. Never fake it with another primitive.
7. **Say what you can't do.** For a network Petal can't read, or data it doesn't have (votes on proposals, for example), say so plainly, offer the closest flower it can draw, and say what data it would take.
8. **Ambiguous requests.** Pick the most likely reading, say which one, and offer the other as a second flower.
9. **No keys, no payments.** Viewing and making need nothing. Never ask for a private key, a seed phrase or a signature, and never sign or call `publish_flower` yourself: publishing is the person's act, through `sign_url`. A payment quote (`quote_payment`) is dry; no money moves.
10. **Errors are answers.** A tool error carries `code`, `message` and `hint`. Follow the hint: `bad_input` names the allowed values, `cannot_read` names what Petal can read. On `rate_limited`, wait `retry_after_s`.
<!-- petal:shared:end -->

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

- Install guide: [README.md](README.md) (Claude Code, Codex, IronClaw).
- Tool contract: `specs/001-petal-core/contracts/tools.md`. HTTP and MCP: `specs/001-petal-core/contracts/http-api.md`. Both in the Petal repo.
- From a terminal in a clone: `pnpm petal help` lists the same tools as CLI commands.
